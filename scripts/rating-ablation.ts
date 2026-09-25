/**
 * Rating engine ablation + parameter sweep (read-only — no DB writes).
 *
 * The 2026-06-11 bake-off compared the WHOLE engine against OpenSkill and
 * called it a wash. It never asked the cheaper question: does each term we
 * hand-rolled actually earn its keep? This script answers that by replaying
 * history with individual terms switched off, and by sweeping the constants.
 *
 * Method mirrors the bake-off: walk-forward, predict BEFORE updating, so every
 * variant is scored only on information it had at the time.
 *
 * READING THE NUMBERS — two things the earlier scripts got wrong:
 *
 *  1. An order-symmetric engine cannot beat "team 1 wins 69% of the time".
 *     That 69% is an entry-order artifact (see docs/rating-engine-bakeoff.md),
 *     not skill, and our engine is symmetric in team order by construction, so
 *     the honest skill baseline is the coin flip: log-loss ln(2) = 0.6931.
 *     Skill = how far below 0.6931 a variant gets.
 *
 *  2. Differences of ~0.001 nats are noise at n≈566. Every comparison here is
 *     reported as a PAIRED difference with a 95% CI (same matches, same order,
 *     per-match loss differences), so "better" means the CI excludes zero.
 *
 * Run: npx tsx scripts/rating-ablation.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import pg from "pg";
import { createHash } from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BASE_K,
  K_MAX,
  K_MIN,
  K_DECAY_RATE,
  LOPSIDED_SCALE,
  MOV_MIN,
  MOV_MAX,
  NEW_PLAYER_THRESHOLD,
} from "../lib/rating-engine/elo";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter } as any);

const INITIAL_RATING = 1000;

interface ReplayMatch {
  team1: [string, string];
  team2: [string, string];
  team1Won: boolean;
  games: { team1Score: number; team2Score: number }[];
}

/** Every knob in the engine, so any one can be switched off or retuned. */
interface EngineConfig {
  label: string;
  /** teamRating = alpha*max + (1-alpha)*min. 0.5 = current plain average. */
  alpha: number;
  /** Logistic denominator in expectedScore. 400 = current. */
  eloScale: number;
  /** false => every player uses a flat BASE_K regardless of experience. */
  dynamicK: boolean;
  kMax: number;
  kMin: number;
  kDecay: number;
  /** false => team base-K is the plain average of both players' K (pre-Amendment A). */
  amendmentA: boolean;
  newPlayerThreshold: number;
  /**
   * true => each player moves by their OWN dynamicK instead of a shared team K.
   * The outcome surprise (actual - E) stays a team property, because the team
   * won or lost as a unit; only the learning rate becomes personal, which is
   * what K means in Elo. Supersedes amendmentA (a veteran's K is already their
   * own, so a new partner cannot inflate it).
   */
  perPlayerK: boolean;
  /**
   * Option (b): per-player EXPECTED score, strength in [0, 1]. 0 = the shared
   * team expectation (correct under the team-average model, and what ships).
   *
   * Encodes the intuition "the stronger partner was expected to carry, so a win
   * should reward them less". Each player's expectation is blended from the
   * team value toward what they alone would be expected to score against the
   * opposing team's average:
   *     E_i = E_team + beta * (expected(r_i, oppAvg) - E_team)
   *
   * Only the rating UPDATE is affected — the match prediction stays team-level,
   * since that is what the model actually claims. Differences in prediction
   * quality therefore arrive indirectly, through the rating trajectory, exactly
   * as they do for MOV and the lopsided factor.
   */
  perPlayerExpected: number;
  /**
   * Option (c): let `alpha` also split the delta between partners, not just the
   * team rating used for the expectation.
   *
   * If team strength is `alpha*max + (1-alpha)*min`, then the derivative of the
   * likelihood w.r.t. the stronger partner is `alpha` and w.r.t. the weaker is
   * `1-alpha`. Splitting the delta the same way is the correct gradient step for
   * that model — unlike option (b), which splits by rating while leaving the
   * team model an average, and so double-counts.
   *
   * Normalised so alpha = 0.5 reproduces today's behaviour exactly (both 1.0).
   * Symmetric: the stronger partner moves more on wins AND on losses, so it
   * redistributes between partners without dragging anyone toward the mean.
   */
  alphaSplit: boolean;
  /**
   * true => make every match rating-neutral by subtracting the match's net
   * change evenly across its four players. Used to measure the leak: the
   * per-player gap between this and the normal engine IS the leak each player
   * absorbed.
   */
  conserve: boolean;
  /** false => no favourite/underdog K adjustment. */
  lopsided: boolean;
  lopsidedScale: number;
  /** false => margin of victory ignored (weight fixed at 1.0). */
  mov: boolean;
  movMin: number;
  movMax: number;
}

/**
 * The SHIPPED engine as of 2026-08-23 (per-player K). This is the baseline every
 * variant below is measured against. The pre-2026-08-23 engine (shared team K +
 * Amendment A) is still available as a variant, for historical comparison.
 */
const CURRENT: EngineConfig = {
  label: "shipped (per-player K)",
  alpha: 0.5,
  eloScale: 400,
  dynamicK: true,
  kMax: K_MAX,
  kMin: K_MIN,
  kDecay: K_DECAY_RATE,
  amendmentA: false,
  newPlayerThreshold: NEW_PLAYER_THRESHOLD,
  perPlayerK: true,
  perPlayerExpected: 0,
  alphaSplit: false,
  conserve: false,
  lopsided: true,
  lopsidedScale: LOPSIDED_SCALE,
  mov: true,
  movMin: MOV_MIN,
  movMax: MOV_MAX,
};

function cfg(label: string, overrides: Partial<EngineConfig>): EngineConfig {
  return { ...CURRENT, label, ...overrides };
}

/** One walk-forward prediction, captured before the match updated any rating. */
interface Prediction {
  e1: number;
  team1Won: boolean;
  minPriorMatches: number;
  index: number;
}

// ---------------------------------------------------------------------------
// Parameterised replay — mirrors lib/rating-engine/replay.ts with switches
// ---------------------------------------------------------------------------

/** One partner pair's pre-match ratings and the deltas they each received. */
interface PairRecord {
  ra: number;
  rb: number;
  da: number;
  db: number;
}

function replay(
  matches: ReplayMatch[],
  c: EngineConfig,
  outRatings?: Map<string, number>,
  outCounts?: Map<string, number>,
  outPairs?: PairRecord[],
): Prediction[] {
  const ratings = new Map<string, number>();
  const counts = new Map<string, number>();
  const r = (id: string) => ratings.get(id) ?? INITIAL_RATING;
  const n = (id: string) => counts.get(id) ?? 0;

  const teamRating = (a: number, b: number) =>
    c.alpha * Math.max(a, b) + (1 - c.alpha) * Math.min(a, b);

  const expected = (ta: number, tb: number) => 1 / (1 + Math.pow(10, (tb - ta) / c.eloScale));

  const dynK = (played: number) =>
    c.dynamicK ? c.kMin + (c.kMax - c.kMin) * Math.exp(-played / c.kDecay) : BASE_K;

  const teamK = (na: number, nb: number) => {
    if (!c.amendmentA) return (dynK(na) + dynK(nb)) / 2;
    const bothEstablished = na >= c.newPlayerThreshold && nb >= c.newPlayerThreshold;
    if (bothEstablished) return (dynK(na) + dynK(nb)) / 2;
    return Math.min(dynK(na), dynK(nb));
  };

  const movWeight = (winner: number[], loser: number[]) => {
    if (!c.mov || winner.length === 0) return 1.0;
    const tw = winner.reduce((s, v) => s + v, 0);
    const tl = loser.reduce((s, v) => s + v, 0);
    if (tw + tl === 0) return 1.0;
    const normalized = 2 * (tw / (tw + tl) - 0.5);
    return c.movMin + (c.movMax - c.movMin) * normalized;
  };

  const predictions: Prediction[] = [];

  matches.forEach((m, index) => {
    const [p1a, p1b] = m.team1;
    const [p2a, p2b] = m.team2;

    const t1 = teamRating(r(p1a), r(p1b));
    const t2 = teamRating(r(p2a), r(p2b));
    const e1 = expected(t1, t2);

    predictions.push({
      e1,
      team1Won: m.team1Won,
      minPriorMatches: Math.min(n(p1a), n(p1b), n(p2a), n(p2b)),
      index,
    });

    // Base K is either shared across the team (current) or personal to each
    // player (perPlayerK). The lopsided and MOV multipliers are match-level and
    // apply either way.
    const baseK1 = c.perPlayerK ? null : teamK(n(p1a), n(p1b));
    const baseK2 = c.perPlayerK ? null : teamK(n(p2a), n(p2b));

    const gapFactor = c.lopsided ? Math.exp(-Math.abs(t1 - t2) / c.lopsidedScale) : 1;
    const lop1 = c.lopsided ? (t1 >= t2 ? gapFactor : 2 - gapFactor) : 1;
    const lop2 = c.lopsided ? (t2 >= t1 ? gapFactor : 2 - gapFactor) : 1;

    const t1Scores = m.games.map((g) => g.team1Score);
    const t2Scores = m.games.map((g) => g.team2Score);
    const [w, l] = m.team1Won ? [t1Scores, t2Scores] : [t2Scores, t1Scores];
    const mov = movWeight(w, l);

    const actual1 = m.team1Won ? 1 : 0;
    const actual2 = 1 - actual1;

    // Capture pre-match ratings and counts: neither a player's K nor their
    // expectation may be affected by this match, and both teammates must be
    // read before either is written.
    const ids = [...m.team1, ...m.team2];
    const pre = new Map(ids.map((id) => [id, { n: n(id), r: r(id) }]));

    /**
     * Player's expectation. beta = 0 gives the shared team value; beta = 1 gives
     * what this player alone would be expected to score against the opposing
     * team average. See EngineConfig.perPlayerExpected.
     */
    const expectationFor = (id: string, eTeam: number, oppAvg: number) => {
      if (c.perPlayerExpected === 0) return eTeam;
      const solo = expected(pre.get(id)!.r, oppAvg);
      return eTeam + c.perPlayerExpected * (solo - eTeam);
    };

    /**
     * Gradient share for this player within their pair. 1.0 for both unless
     * alphaSplit is on, in which case the stronger partner takes 2*alpha and
     * the weaker 2*(1-alpha). Equal ratings split evenly.
     */
    const shareFor = (id: string, partnerId: string) => {
      if (!c.alphaSplit) return 1;
      const self = pre.get(id)!.r;
      const other = pre.get(partnerId)!.r;
      // Mirrors elo.ts PARTNER_TIE_EPSILON — sub-point gaps are noise.
      if (Math.abs(self - other) < 1) return 1;
      return 2 * (self > other ? c.alpha : 1 - c.alpha);
    };

    // Compute all four deltas before applying any, so `conserve` can see the
    // match's net change.
    const deltas = new Map<string, number>();
    for (const [i, id] of m.team1.entries()) {
      const k = baseK1 ?? dynK(pre.get(id)!.n);
      const e = expectationFor(id, e1, t2);
      deltas.set(id, k * shareFor(id, m.team1[1 - i]!) * lop1 * mov * (actual1 - e));
    }
    for (const [i, id] of m.team2.entries()) {
      const k = baseK2 ?? dynK(pre.get(id)!.n);
      const e = expectationFor(id, 1 - e1, t1);
      deltas.set(id, k * shareFor(id, m.team2[1 - i]!) * lop2 * mov * (actual2 - e));
    }

    if (c.conserve) {
      const net = [...deltas.values()].reduce((s, v) => s + v, 0) / deltas.size;
      for (const [id, d] of deltas) deltas.set(id, d - net);
    }

    for (const [id, d] of deltas) ratings.set(id, pre.get(id)!.r + d);
    if (outPairs) {
      for (const [x, y] of [m.team1, m.team2]) {
        outPairs.push({
          ra: pre.get(x)!.r,
          rb: pre.get(y)!.r,
          da: ratings.get(x)! - pre.get(x)!.r,
          db: ratings.get(y)! - pre.get(y)!.r,
        });
      }
    }

    for (const id of ids) counts.set(id, pre.get(id)!.n + 1);
  });

  if (outRatings) for (const [id, v] of ratings) outRatings.set(id, v);
  if (outCounts) for (const [id, v] of counts) outCounts.set(id, v);
  return predictions;
}

// ---------------------------------------------------------------------------
// Metrics — per-match losses kept so differences can be paired
// ---------------------------------------------------------------------------

const EPS = 1e-12;

function perMatchLogLoss(preds: Prediction[]): number[] {
  return preds.map((p) => {
    const e = Math.min(1 - EPS, Math.max(EPS, p.e1));
    return p.team1Won ? -Math.log(e) : -Math.log(1 - e);
  });
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function brier(preds: Prediction[]): number {
  return mean(preds.map((p) => ((p.team1Won ? 1 : 0) - p.e1) ** 2));
}

function accuracy(preds: Prediction[]): number {
  return mean(preds.map((p) => (p.e1 >= 0.5 === p.team1Won ? 1 : 0)));
}

/**
 * Paired difference in mean log-loss between two variants over the same matches.
 * Returns the mean difference (a - b; negative => a is better) and its 95% CI.
 */
function pairedDiff(a: number[], b: number[]): { diff: number; lo: number; hi: number } {
  const d = a.map((v, i) => v - b[i]!);
  const m = mean(d);
  const variance = d.length > 1 ? mean(d.map((v) => (v - m) ** 2)) * (d.length / (d.length - 1)) : 0;
  const se = Math.sqrt(variance / d.length);
  return { diff: m, lo: m - 1.96 * se, hi: m + 1.96 * se };
}

function fmt(x: number, digits = 4): string {
  return (x >= 0 ? "+" : "") + x.toFixed(digits);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rows = await prisma.match.findMany({
    where: { voidedAt: null },
    include: {
      participants: { select: { playerId: true, team: true } },
      games: { select: { team1Score: true, team2Score: true, gameOrder: true } },
    },
    orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }],
  });

  const matches: ReplayMatch[] = [];
  for (const m of rows) {
    const t1 = m.participants.filter((p) => p.team === 1).map((p) => p.playerId);
    const t2 = m.participants.filter((p) => p.team === 2).map((p) => p.playerId);
    if (t1.length !== 2 || t2.length !== 2) continue;
    let w1 = 0;
    let w2 = 0;
    for (const g of m.games) {
      if (g.team1Score > g.team2Score) w1++;
      else if (g.team2Score > g.team1Score) w2++;
    }
    matches.push({
      team1: [t1[0]!, t1[1]!],
      team2: [t2[0]!, t2[1]!],
      team1Won: w1 > w2,
      games: m.games
        .sort((a, b) => a.gameOrder - b.gameOrder)
        .map((g) => ({ team1Score: g.team1Score, team2Score: g.team2Score })),
    });
  }

  const team1Rate = mean(matches.map((m) => (m.team1Won ? 1 : 0)));
  console.log(`Replaying ${matches.length} non-voided doubles matches (${rows.length} fetched)`);
  console.log(`Team-1 win rate: ${(100 * team1Rate).toFixed(1)}%  (entry-order artifact, not skill)\n`);

  // --- Baselines -----------------------------------------------------------
  console.log("=== Baselines (what any engine must beat) ===\n");
  const coinFlip = Math.log(2);
  const cheat = -(team1Rate * Math.log(team1Rate) + (1 - team1Rate) * Math.log(1 - team1Rate));
  console.log(`coin flip, p=0.500                    log-loss ${coinFlip.toFixed(4)}   <- the honest bar`);
  console.log(
    `always "team 1", p=${team1Rate.toFixed(3)}             log-loss ${cheat.toFixed(4)}   <- exploits entry order; not a real competitor`,
  );
  console.log(
    "\nAn order-symmetric engine structurally cannot beat the second baseline.\n" +
      "Skill is measured against the coin flip.\n",
  );

  // --- Segments ------------------------------------------------------------
  const base = replay(matches, CURRENT);
  const seasonedIdx = new Set(base.filter((p) => p.minPriorMatches >= 5).map((p) => p.index));
  const segments: [string, (p: Prediction) => boolean][] = [
    ["all matches", () => true],
    ["seasoned (all 4 players >=5 prior)", (p) => seasonedIdx.has(p.index)],
  ];

  // --- Ablation ------------------------------------------------------------
  const variants: EngineConfig[] = [
    CURRENT,
    // The pre-2026-08-23 engine, for historical comparison.
    cfg("legacy: team K + Amendment A", { perPlayerK: false, amendmentA: true }),
    cfg("- margin of victory", { mov: false }),
    cfg("- lopsided gap factor", { lopsided: false }),
    cfg("- dynamic K (flat K=32)", { dynamicK: false }),
    cfg("plain Elo (all extras off)", {
      mov: false,
      lopsided: false,
      dynamicK: false,
      perPlayerK: false,
      amendmentA: false,
    }),
    // Option (b): per-player expected score — "the favourite was meant to win,
    // so reward them less". Swept as a strength, not a yes/no.
    cfg("+ per-player E, beta=0.25", { perPlayerExpected: 0.25 }),
    cfg("+ per-player E, beta=0.50", { perPlayerExpected: 0.5 }),
    cfg("+ per-player E, beta=0.75", { perPlayerExpected: 0.75 }),
    cfg("+ per-player E, beta=1.00", { perPlayerExpected: 1.0 }),
    // Option (c): stronger partner counts for more of the team, and takes a
    // proportionally larger share of the delta — symmetric, both directions.
    cfg("+ alpha-split 0.60", { alpha: 0.6, alphaSplit: true }),
    cfg("+ alpha-split 0.65", { alpha: 0.65, alphaSplit: true }),
    cfg("+ alpha-split 0.70", { alpha: 0.7, alphaSplit: true }),
    cfg("+ alpha-split 0.80", { alpha: 0.8, alphaSplit: true }),
    // Control: same alpha, but only the expectation changes (no delta split) —
    // this is what rating-calibration.ts already swept.
    cfg("  alpha 0.60, E only (control)", { alpha: 0.6, alphaSplit: false }),
  ];

  const runs = new Map<string, Prediction[]>();
  for (const v of variants) runs.set(v.label, replay(matches, v));

  for (const [segLabel, segFilter] of segments) {
    console.log(`\n=== Ablation — ${segLabel} ===`);
    console.log("Paired vs current engine. Negative diff = variant is BETTER.");
    console.log("CI excluding zero = real difference; CI spanning zero = noise.\n");
    console.log(
      "variant                          log-loss   paired log-loss diff (95% CI)      acc     paired acc diff (95% CI)",
    );

    const currentPreds = runs.get(CURRENT.label)!.filter(segFilter);
    const currentLosses = perMatchLogLoss(currentPreds);
    const hits = (preds: Prediction[]) => preds.map((p) => (p.e1 >= 0.5 === p.team1Won ? 1 : 0));
    const currentHits = hits(currentPreds);

    for (const v of variants) {
      const preds = runs.get(v.label)!.filter(segFilter);
      const losses = perMatchLogLoss(preds);
      let diffCol = "—  (reference)".padEnd(35);
      let accCol = "—  (reference)";
      if (v.label !== CURRENT.label) {
        const ll = pairedDiff(losses, currentLosses);
        const llVerdict = ll.lo > 0 ? " worse" : ll.hi < 0 ? " BETTER" : " noise";
        diffCol = `${fmt(ll.diff)} [${fmt(ll.lo)}, ${fmt(ll.hi)}]${llVerdict}`.padEnd(35);
        // Accuracy diff is paired too (same matches), so the CI accounts for
        // the fact that variants agree on the large majority of predictions.
        const ac = pairedDiff(hits(preds), currentHits);
        const acVerdict = ac.hi < 0 ? " worse" : ac.lo > 0 ? " BETTER" : " noise";
        accCol = `${fmt(100 * ac.diff, 1)}pp [${fmt(100 * ac.lo, 1)}, ${fmt(100 * ac.hi, 1)}]${acVerdict}`;
      }
      console.log(
        `${v.label.padEnd(32)} ${mean(losses).toFixed(4)}   ${diffCol} ${(100 * accuracy(preds)).toFixed(1)}%   ${accCol}`,
      );
    }
    console.log(`${"(coin flip)".padEnd(32)} ${coinFlip.toFixed(4)}${" ".repeat(39)}50.0%`);
  }

  // --- Parameter sweeps ----------------------------------------------------
  console.log("\n\n=== Parameter sweeps (all matches, paired vs current) ===");
  console.log("Only sweeps terms the ablation did not already kill.\n");

  const sweeps: [string, EngineConfig[]][] = [
    [
      "K_DECAY_RATE (current 20)",
      [5, 10, 15, 20, 30, 40, 60].map((v) => cfg(`  decay=${v}`, { kDecay: v })),
    ],
    [
      "K_MAX (current 48)",
      [32, 40, 48, 56, 64].map((v) => cfg(`  kMax=${v}`, { kMax: v })),
    ],
    [
      "K_MIN (current 16)",
      [8, 12, 16, 20, 24, 32].map((v) => cfg(`  kMin=${v}`, { kMin: v })),
    ],
    [
      "LOPSIDED_SCALE (current 400)",
      [200, 300, 400, 600, 1000].map((v) => cfg(`  scale=${v}`, { lopsidedScale: v })),
    ],
    [
      "MOV range (current 0.75-1.25)",
      [
        cfg("  0.90-1.10", { movMin: 0.9, movMax: 1.1 }),
        cfg("  0.75-1.25", { movMin: 0.75, movMax: 1.25 }),
        cfg("  0.50-1.50", { movMin: 0.5, movMax: 1.5 }),
        cfg("  0.25-1.75", { movMin: 0.25, movMax: 1.75 }),
      ],
    ],
    [
      "Elo scale (current 400)",
      [200, 300, 400, 500, 600].map((v) => cfg(`  scale=${v}`, { eloScale: v })),
    ],
    [
      "NEW_PLAYER_THRESHOLD (current 10)",
      [0, 5, 10, 15, 20].map((v) => cfg(`  threshold=${v}`, { newPlayerThreshold: v })),
    ],
  ];

  const currentAll = perMatchLogLoss(runs.get(CURRENT.label)!);

  for (const [title, configs] of sweeps) {
    console.log(`\n${title}`);
    console.log("value              log-loss    paired diff vs current (95% CI)");
    for (const c of configs) {
      const losses = perMatchLogLoss(replay(matches, c));
      const { diff, lo, hi } = pairedDiff(losses, currentAll);
      const verdict = lo > 0 ? "  worse" : hi < 0 ? "  BETTER" : "  noise";
      console.log(
        `${c.label.padEnd(18)} ${mean(losses).toFixed(4)}    ${fmt(diff)}  [${fmt(lo)}, ${fmt(hi)}]${verdict}`,
      );
    }
  }

  // --- Dispersion diagnostic ----------------------------------------------
  // Every sweep above improved by making ratings move further (higher K, slower
  // decay) or by mapping the same gap to a sharper probability (lower Elo
  // scale). Those are the same symptom seen twice. Test it directly: is there a
  // scalar temperature s such that sigmoid(s * logit(e1)) predicts better?
  //   s > 1  => engine is UNDER-confident (real gaps are bigger than it thinks)
  //   s < 1  => engine is OVER-confident
  console.log("\n\n=== Dispersion diagnostic: is the engine under-confident? ===\n");

  const logits = runs.get(CURRENT.label)!.map((p) => {
    const e = Math.min(1 - EPS, Math.max(EPS, p.e1));
    return { l: Math.log(e / (1 - e)), won: p.team1Won };
  });

  const tempLoss = (s: number) =>
    mean(
      logits.map(({ l, won }) => {
        const e = Math.min(1 - EPS, Math.max(EPS, 1 / (1 + Math.exp(-s * l))));
        return won ? -Math.log(e) : -Math.log(1 - e);
      }),
    );

  let bestS = 1;
  let bestSLoss = Infinity;
  for (let s = 0.2; s <= 3.001; s += 0.02) {
    const loss = tempLoss(s);
    if (loss < bestSLoss) {
      bestSLoss = loss;
      bestS = s;
    }
  }
  console.log(`optimal temperature s = ${bestS.toFixed(2)}   (s = 1.00 means perfectly calibrated)`);
  console.log(
    `log-loss at s=1.00: ${tempLoss(1).toFixed(4)}   at s=${bestS.toFixed(2)}: ${bestSLoss.toFixed(4)}   gain ${fmt(bestSLoss - tempLoss(1))}`,
  );
  console.log(
    `\nEquivalent Elo scale: 400 / ${bestS.toFixed(2)} = ${(400 / bestS).toFixed(0)}` +
      `  (i.e. the same ratings, read on a ${(400 / bestS).toFixed(0)}-point scale)`,
  );

  // --- Out-of-sample tuning ------------------------------------------------
  // Everything above picked parameters on the same data it scored them on.
  // With ~566 matches that overfits happily. Tune on the first 70% of history,
  // then score ONLY the last 30% — matches no tuning decision ever saw.
  const split = Math.floor(matches.length * 0.7);
  console.log(`\n\n=== Out-of-sample check: tune on matches 1-${split}, score ${split + 1}-${matches.length} ===\n`);

  // Structural variants first. These fit NO parameters, so scoring them on the
  // held-out split is a clean test — unlike the grid below, there is nothing
  // for them to have overfitted with.
  console.log("Structural variants (no fitted parameters), scored on the held-out split only:\n");
  console.log("variant                          TEST log-loss   paired diff vs current (95% CI)");
  for (const v of variants) {
    if (v.label === CURRENT.label) continue;
    const testLosses = perMatchLogLoss(replay(matches, v)).slice(split);
    const d = pairedDiff(testLosses, currentAll.slice(split));
    const verdict = d.lo > 0 ? "  worse" : d.hi < 0 ? "  BETTER" : "  noise";
    console.log(
      `${v.label.padEnd(32)} ${mean(testLosses).toFixed(4)}          ${fmt(d.diff)}  [${fmt(d.lo)}, ${fmt(d.hi)}]${verdict}`,
    );
  }
  console.log(
    `${CURRENT.label.padEnd(32)} ${mean(currentAll.slice(split)).toFixed(4)}          —  (reference)`,
  );

  console.log("\nTuned-parameter grid (fits 4 parameters, so the holdout is the real test):\n");

  const grid: EngineConfig[] = [];
  for (const kMax of [40, 48, 56, 64, 80]) {
    for (const kMin of [12, 16, 20, 24, 32]) {
      if (kMin > kMax) continue;
      for (const kDecay of [20, 30, 45, 60]) {
        for (const eloScale of [250, 300, 350, 400]) {
          grid.push(
            cfg(`kMax=${kMax} kMin=${kMin} decay=${kDecay} scale=${eloScale}`, {
              kMax,
              kMin,
              kDecay,
              eloScale,
            }),
          );
        }
      }
    }
  }

  let bestTrain = { label: "", loss: Infinity, test: [] as number[] };
  for (const c of grid) {
    const losses = perMatchLogLoss(replay(matches, c));
    const trainLoss = mean(losses.slice(0, split));
    if (trainLoss < bestTrain.loss) {
      bestTrain = { label: c.label, loss: trainLoss, test: losses.slice(split) };
    }
  }

  const currentTest = currentAll.slice(split);
  const { diff, lo, hi } = pairedDiff(bestTrain.test, currentTest);
  const verdict = lo > 0 ? "WORSE out of sample" : hi < 0 ? "BETTER out of sample" : "NOISE out of sample";

  console.log(`grid searched: ${grid.length} configs`);
  console.log(`best on training split: ${bestTrain.label}`);
  console.log(`  train log-loss ${bestTrain.loss.toFixed(4)}  (current: ${mean(currentAll.slice(0, split)).toFixed(4)})`);
  console.log(`  TEST log-loss  ${mean(bestTrain.test).toFixed(4)}  (current: ${mean(currentTest).toFixed(4)})`);
  console.log(`  paired test diff ${fmt(diff)}  [${fmt(lo)}, ${fmt(hi)}]  => ${verdict}`);
  console.log(`  test-set coin flip: ${coinFlip.toFixed(4)}  (n=${currentTest.length})`);

  // Temperature is ONE parameter, so it overfits far less than the 400-config
  // grid above. Give it the same honest test: fit s on the training split only,
  // then score the held-out matches with it.
  console.log("\n--- Temperature, fitted out of sample ---\n");

  const fitTemp = (sample: { l: number; won: boolean }[]) => {
    let s = 1;
    let loss = Infinity;
    for (let cand = 0.2; cand <= 3.001; cand += 0.02) {
      const v = mean(
        sample.map(({ l, won }) => {
          const e = Math.min(1 - EPS, Math.max(EPS, 1 / (1 + Math.exp(-cand * l))));
          return won ? -Math.log(e) : -Math.log(1 - e);
        }),
      );
      if (v < loss) {
        loss = v;
        s = cand;
      }
    }
    return s;
  };

  const lossAt = (sample: { l: number; won: boolean }[], s: number) =>
    sample.map(({ l, won }) => {
      const e = Math.min(1 - EPS, Math.max(EPS, 1 / (1 + Math.exp(-s * l))));
      return won ? -Math.log(e) : -Math.log(1 - e);
    });

  const trainLogits = logits.slice(0, split);
  const testLogits = logits.slice(split);
  const sTrain = fitTemp(trainLogits);
  const sTest = fitTemp(testLogits);

  const testAtTrainS = lossAt(testLogits, sTrain);
  const testAtOne = lossAt(testLogits, 1);
  const t = pairedDiff(testAtTrainS, testAtOne);

  console.log(`s fitted on train split:  ${sTrain.toFixed(2)}   (equivalent Elo scale ${(400 / sTrain).toFixed(0)})`);
  console.log(`s fitted on test split:   ${sTest.toFixed(2)}   (stability check — should be similar)`);
  console.log(
    `TEST log-loss  s=1.00: ${mean(testAtOne).toFixed(4)}   s=${sTrain.toFixed(2)}: ${mean(testAtTrainS).toFixed(4)}`,
  );
  console.log(
    `paired test diff ${fmt(t.diff)}  [${fmt(t.lo)}, ${fmt(t.hi)}]  => ` +
      (t.lo > 0 ? "WORSE out of sample" : t.hi < 0 ? "BETTER out of sample" : "NOISE out of sample"),
  );

  // --- Blast radius: how far would the leaderboard actually move? ----------
  // Prediction quality is not what players see. If per-player K ships, every
  // rating is recomputed from raw matches — this is the size of that shift.
  // The candidate whose leaderboard impact is worth seeing. Change this line to
  // inspect a different proposal.
  const CANDIDATE = cfg("alpha-split 0.60", { alpha: 0.6, alphaSplit: true });

  console.log(`\n\n=== Blast radius: ${CANDIDATE.label} vs shipped ===\n`);

  const nowRatings = new Map<string, number>();
  const nowCounts = new Map<string, number>();
  const newRatings = new Map<string, number>();
  replay(matches, CURRENT, nowRatings, nowCounts);
  replay(matches, CANDIDATE, newRatings);

  const rankOf = (m: Map<string, number>) => {
    const order = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return new Map(order.map((id, i) => [id, i + 1]));
  };
  const nowRank = rankOf(nowRatings);
  const newRank = rankOf(newRatings);

  const rows2 = [...nowRatings.keys()].map((id) => ({
    id,
    played: nowCounts.get(id) ?? 0,
    delta: (newRatings.get(id) ?? 0) - (nowRatings.get(id) ?? 0),
    rankShift: (newRank.get(id) ?? 0) - (nowRank.get(id) ?? 0),
  }));
  const absDeltas = rows2.map((x) => Math.abs(x.delta)).sort((a, b) => a - b);
  const median = absDeltas[Math.floor(absDeltas.length / 2)] ?? 0;
  const p90 = absDeltas[Math.floor(absDeltas.length * 0.9)] ?? 0;

  // Checksum so the live engine in lib/rating-engine/replay.ts can be verified
  // to reproduce this variant exactly — two independent implementations agreeing.
  // Hash the SHIPPED engine (nowRatings), not the candidate — this is the value
  // that must match lib/rating-engine/replay.ts.
  const checksum = createHash("sha1")
    .update([...nowRatings.entries()].map(([id, v]) => `${id}:${v.toFixed(6)}`).sort().join("\n"))
    .digest("hex")
    .slice(0, 16);
  console.log(`shipped-engine final-ratings checksum: ${checksum}  (expect ad1789696cb70de5)`);
  console.log(`players: ${rows2.length}`);

  // Does option (b) actually compress the spread, as predicted? A rating system
  // that pushes everyone toward the mean loses its ability to distinguish
  // players, which matters more than a fraction of a nat of log-loss.
  const spread = (m: Map<string, number>) => {
    const vals = [...m.values()];
    const mu = mean(vals);
    const sd = Math.sqrt(mean(vals.map((v) => (v - mu) ** 2)));
    const sortedVals = [...vals].sort((a, b) => a - b);
    return { mu, sd, lo: sortedVals[0]!, hi: sortedVals.at(-1)! };
  };
  const sNow = spread(nowRatings);
  const sNew = spread(newRatings);
  console.log("\nRating spread — does the candidate compress toward the mean?");
  console.log("engine                        mean     std dev    lowest    highest    range");
  for (const [label, s] of [
    ["shipped", sNow],
    [CANDIDATE.label, sNew],
  ] as [string, typeof sNow][]) {
    console.log(
      `${label.padEnd(28)} ${s.mu.toFixed(1).padStart(7)}  ${s.sd.toFixed(1).padStart(8)}  ${s.lo.toFixed(1).padStart(8)}  ${s.hi.toFixed(1).padStart(9)}  ${(s.hi - s.lo).toFixed(1).padStart(7)}`,
    );
  }
  console.log(
    `std dev change: ${fmt(100 * (sNew.sd / sNow.sd - 1), 1)}%   range change: ${fmt(100 * ((sNew.hi - sNew.lo) / (sNow.hi - sNow.lo) - 1), 1)}%`,
  );

  // The defect this is all trying to fix: two partners rated far apart getting
  // the SAME rating change, because rating never enters the split — only
  // experience does, and experience saturates at the K floor. Measure it
  // directly; log-loss has nothing to say about it.
  console.log("\nDo partners rated 100+ apart still move by the same amount?");
  console.log("variant                          pairs   identical (<0.5 apart)   avg gap");
  const identicalRate = (c: EngineConfig) => {
    const all: PairRecord[] = [];
    replay(matches, c, undefined, undefined, all);
    const wide = all.filter((p) => Math.abs(p.ra - p.rb) >= 100);
    const gaps = wide.map((p) => Math.abs(p.da - p.db));
    return {
      pairs: wide.length,
      identical: gaps.filter((g) => g < 0.5).length,
      avgGap: mean(gaps),
    };
  };
  for (const v of [CURRENT, CANDIDATE, cfg("alpha-split 0.70", { alpha: 0.7, alphaSplit: true })]) {
    const s = identicalRate(v);
    console.log(
      `${v.label.padEnd(32)} ${String(s.pairs).padStart(5)}   ${(`${s.identical} (${(100 * s.identical / s.pairs).toFixed(0)}%)`).padStart(22)}   ${s.avgGap.toFixed(2)}`,
    );
  }

  // --- Rating conservation ------------------------------------------------
  // Every player enters at 1000, so the system starts with 1000 * playerCount
  // points. Any shortfall at the end leaked out. A match is rating-neutral only
  // when the two teams' total K matches: the four deltas are
  //   surprise * (K_a1 + K_a2 - K_b1 - K_b2)
  // so whenever one side carries more K than the other, the match creates or
  // destroys points. Isolate which term is responsible.
  console.log("\n\nRating conservation — where do the points go?\n");
  console.log("variant                          final mean   total leaked   per match");
  const conservation = (c: EngineConfig) => {
    const m = new Map<string, number>();
    replay(matches, c, m);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    const injected = m.size * INITIAL_RATING;
    return { mean: total / m.size, leaked: injected - total, perMatch: (injected - total) / matches.length };
  };
  for (const v of [
    CURRENT,
    cfg("- lopsided gap factor", { lopsided: false }),
    cfg("- dynamic K (flat K=32)", { dynamicK: false }),
    cfg("- alpha split (0.5)", { alpha: 0.5, alphaSplit: false }),
    cfg("- margin of victory", { mov: false }),
    cfg("plain Elo (all extras off)", {
      mov: false,
      lopsided: false,
      dynamicK: false,
      perPlayerK: false,
      amendmentA: false,
      alpha: 0.5,
      alphaSplit: false,
    }),
  ]) {
    const s = conservation(v);
    console.log(
      `${v.label.padEnd(32)} ${s.mean.toFixed(1).padStart(9)}   ${s.leaked.toFixed(0).padStart(12)}   ${s.perMatch.toFixed(2).padStart(9)}`,
    );
  }
  console.log(
    "\nA variant whose leak drops to ~0 identifies the term responsible.",
  );

  // Is the leak an "activity tax"? You can only leak points by being in
  // matches, so in principle it falls hardest on whoever plays most. Compare
  // the shipped engine against a rating-neutral version of itself: the
  // per-player difference is exactly the leak that player absorbed.
  console.log("\nIs the leak a tax on playing? (shipped vs a rating-neutral version of itself)\n");
  const leakyR = new Map<string, number>();
  const leakyN = new Map<string, number>();
  const fairR = new Map<string, number>();
  replay(matches, CURRENT, leakyR, leakyN);
  replay(matches, cfg("conserved", { conserve: true }), fairR);

  const leakBands: [string, (n: number) => boolean][] = [
    ["1-9    ", (n) => n < 10],
    ["10-24  ", (n) => n >= 10 && n < 25],
    ["25-59  ", (n) => n >= 25 && n < 60],
    ["60-149 ", (n) => n >= 60 && n < 150],
    ["150+   ", (n) => n >= 150],
  ];
  console.log("games played     n    mean points lost to the leak   per match played");
  for (const [label, pred] of leakBands) {
    const sel = [...leakyR.keys()].filter((id) => pred(leakyN.get(id) ?? 0));
    if (sel.length === 0) {
      console.log(`${label}      0    (none)`);
      continue;
    }
    const lost = sel.map((id) => fairR.get(id)! - leakyR.get(id)!);
    const games = sel.map((id) => leakyN.get(id) ?? 0);
    console.log(
      `${label}   ${String(sel.length).padStart(4)}    ${mean(lost).toFixed(1).padStart(24)}   ${(mean(lost) / mean(games)).toFixed(3).padStart(15)}`,
    );
  }

  // How often does the alpha-split discontinuity actually bite? Partners a
  // hair apart get 1.2x and 0.8x; exact ties split evenly. Only pairs with a
  // very small gap make that feel arbitrary.
  console.log("\n\nHow often are partners close enough for the 1.2x/0.8x split to feel arbitrary?\n");
  const allPairs: PairRecord[] = [];
  replay(matches, CURRENT, undefined, undefined, allPairs);
  const gapBands: [string, number, number][] = [
    ["exact tie      ", 0, 0.0001],
    ["under 1 point  ", 0.0001, 1],
    ["1-5 points     ", 1, 5],
    ["5-10 points    ", 5, 10],
    ["10-25 points   ", 10, 25],
    ["25+ points     ", 25, Infinity],
  ];
  console.log("partner gap        pairs    share of all pairs");
  for (const [label, lo, hi] of gapBands) {
    const n = allPairs.filter((p) => {
      const g = Math.abs(p.ra - p.rb);
      return g >= lo && g < hi;
    }).length;
    console.log(
      `${label} ${String(n).padStart(6)}    ${((100 * n) / allPairs.length).toFixed(1).padStart(6)}%`,
    );
  }
  console.log(`\ntotal partner pairs across all matches: ${allPairs.length}`);

  // Compression is dose-dependent, so a small beta deserves its own look rather
  // than being judged by beta=1.
  console.log("\nCompression vs beta (0 = shipped):");
  console.log("beta    std dev   vs shipped    range    vs shipped");
  for (const b of [0, 0.25, 0.5, 0.75, 1.0]) {
    const m = new Map<string, number>();
    replay(matches, cfg(`b${b}`, { perPlayerExpected: b }), m);
    const s = spread(m);
    console.log(
      `${b.toFixed(2)}  ${s.sd.toFixed(1).padStart(9)}  ${fmt(100 * (s.sd / sNow.sd - 1), 1).padStart(10)}%  ${(s.hi - s.lo).toFixed(1).padStart(8)}  ${fmt(100 * ((s.hi - s.lo) / (sNow.hi - sNow.lo) - 1), 1).padStart(10)}%`,
    );
  }

  console.log(`absolute rating change — median ${median.toFixed(1)}, p90 ${p90.toFixed(1)}, max ${(absDeltas.at(-1) ?? 0).toFixed(1)}`);
  console.log(`players whose rank moves at all: ${rows2.filter((x) => x.rankShift !== 0).length}`);
  console.log(`players whose rank moves by >3 places: ${rows2.filter((x) => Math.abs(x.rankShift) > 3).length}`);

  // Per-player K differs from the current team K only when partners have
  // unequal experience, so the shift should land on newcomers and leave
  // established players alone. Verify rather than assume.
  console.log("\nChange by experience band:");
  console.log("matches played     n    median |change|   max |change|");
  const bands: [string, (p: number) => boolean][] = [
    ["0-9   (provisional)", (p) => p < 10],
    ["10-24            ", (p) => p >= 10 && p < 25],
    ["25-49            ", (p) => p >= 25 && p < 50],
    ["50+   (veterans) ", (p) => p >= 50],
  ];
  for (const [label, pred] of bands) {
    const sel = rows2.filter((x) => pred(x.played)).map((x) => Math.abs(x.delta)).sort((a, b) => a - b);
    if (sel.length === 0) {
      console.log(`${label}  ${String(0).padStart(4)}   (none)`);
      continue;
    }
    console.log(
      `${label}  ${String(sel.length).padStart(4)}   ${(sel[Math.floor(sel.length / 2)] ?? 0).toFixed(1).padStart(12)}   ${(sel.at(-1) ?? 0).toFixed(1).padStart(11)}`,
    );
  }

  console.log("\nLargest movers (these are the players who would notice):");
  console.log("matches played   rating change   rank change");
  for (const x of [...rows2].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)) {
    console.log(
      `${String(x.played).padStart(11)}   ${fmt(x.delta, 1).padStart(13)}   ${x.rankShift === 0 ? "—" : fmt(x.rankShift, 0)}`,
    );
  }

  console.log(
    "\n\nReminder: a term that measures as 'noise' is not automatically worthless —\n" +
      "it may serve fairness or player perception rather than prediction. But it can\n" +
      "no longer be defended on prediction accuracy.",
  );
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
