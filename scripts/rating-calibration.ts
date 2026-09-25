/**
 * Partner-gap calibration analysis (read-only — no DB writes).
 *
 * Question: does the team carried by a strong player (large internal partner gap)
 * win more often than the team-average ELO expectation predicts? If yes, the
 * probability model leaks rating points to "partner farming".
 *
 * Part 1 — replay all matches with the current engine formula (alpha = 0.5,
 *          plain team average) and compare predicted E vs actual win rate,
 *          bucketed by the internal partner gap of the higher-spread team.
 * Part 2 — sweep alpha in teamRating = alpha*max + (1-alpha)*min, fully
 *          replaying history per alpha, and report log-loss / Brier score.
 *
 * Run: npx tsx scripts/rating-calibration.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  expectedScore,
  kFactor,
  computeRatingDelta,
  teamBaseK,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
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

/** One prediction record per match, captured during a replay. */
interface Prediction {
  e1: number; // predicted win probability for team 1
  team1Won: boolean;
  spreadGap: number; // internal partner gap of the higher-spread team
  eSpread: number; // predicted win probability for the higher-spread team
  spreadWon: boolean;
  minPriorMatches: number; // fewest prior matches among the 4 players
}

function weightedTeamRating(r1: number, r2: number, alpha: number): number {
  return alpha * Math.max(r1, r2) + (1 - alpha) * Math.min(r1, r2);
}

/**
 * Full in-memory replay mirroring lib/rating-engine/replay.ts, with the team
 * rating aggregation parameterised by alpha (0.5 = current plain average).
 */
function replayWithAlpha(matches: ReplayMatch[], alpha: number): Prediction[] {
  const ratings = new Map<string, number>();
  const counts = new Map<string, number>();
  const r = (id: string) => ratings.get(id) ?? INITIAL_RATING;
  const n = (id: string) => counts.get(id) ?? 0;

  const predictions: Prediction[] = [];

  for (const m of matches) {
    const [p1a, p1b] = m.team1;
    const [p2a, p2b] = m.team2;

    const t1Avg = weightedTeamRating(r(p1a), r(p1b), alpha);
    const t2Avg = weightedTeamRating(r(p2a), r(p2b), alpha);
    const e1 = expectedScore(t1Avg, t2Avg);

    const gap1 = Math.abs(r(p1a) - r(p1b));
    const gap2 = Math.abs(r(p2a) - r(p2b));
    const team1IsSpread = gap1 >= gap2;

    predictions.push({
      e1,
      team1Won: m.team1Won,
      spreadGap: Math.max(gap1, gap2),
      eSpread: team1IsSpread ? e1 : 1 - e1,
      spreadWon: team1IsSpread ? m.team1Won : !m.team1Won,
      minPriorMatches: Math.min(n(p1a), n(p1b), n(p2a), n(p2b)),
    });

    // Same K pipeline as replay.ts (dynamic K + lopsided + MOV)
    const k1Base = teamBaseK(n(p1a), n(p1b));
    const k2Base = teamBaseK(n(p2a), n(p2b));
    const gapFactor = lopsidedGapFactor(t1Avg - t2Avg);
    const adjK1 = t1Avg >= t2Avg ? k1Base * gapFactor : k1Base * (2 - gapFactor);
    const adjK2 = t2Avg >= t1Avg ? k2Base * gapFactor : k2Base * (2 - gapFactor);
    const t1Scores = m.games.map((g) => g.team1Score);
    const t2Scores = m.games.map((g) => g.team2Score);
    const [w, l] = m.team1Won ? [t1Scores, t2Scores] : [t2Scores, t1Scores];
    const mov = marginOfVictoryMultiplier(w, l);
    const delta1 = computeRatingDelta(kFactor(adjK1, 1.0, mov), m.team1Won ? 1 : 0, e1);
    const delta2 = computeRatingDelta(kFactor(adjK2, 1.0, mov), m.team1Won ? 0 : 1, 1 - e1);

    for (const id of m.team1) {
      ratings.set(id, r(id) + delta1);
      counts.set(id, n(id) + 1);
    }
    for (const id of m.team2) {
      ratings.set(id, r(id) + delta2);
      counts.set(id, n(id) + 1);
    }
  }

  return predictions;
}

function logLoss(preds: { e: number; won: boolean }[]): number {
  const EPS = 1e-12;
  let sum = 0;
  for (const p of preds) {
    const e = Math.min(1 - EPS, Math.max(EPS, p.e));
    sum += p.won ? -Math.log(e) : -Math.log(1 - e);
  }
  return sum / preds.length;
}

function brier(preds: { e: number; won: boolean }[]): number {
  let sum = 0;
  for (const p of preds) sum += ((p.won ? 1 : 0) - p.e) ** 2;
  return sum / preds.length;
}

function pct(x: number): string {
  return (100 * x).toFixed(1) + "%";
}

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
    if (t1.length !== 2 || t2.length !== 2) continue; // doubles only
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

  console.log(`Replaying ${matches.length} non-voided doubles matches (${rows.length} fetched)\n`);

  // ---- Part 1: calibration of the current formula (alpha = 0.5) ----
  const current = replayWithAlpha(matches, 0.5);

  console.log("=== Part 1: Calibration of current formula (plain team average) ===");
  console.log("Bucketed by internal partner gap of the higher-spread team.");
  console.log("'predicted' = mean E for that team; 'actual' = its observed win rate.");
  console.log("actual > predicted  =>  carried teams outperform the model (leak confirmed)\n");

  const buckets: [string, (p: Prediction) => boolean][] = [
    ["gap   0-100 ", (p) => p.spreadGap < 100],
    ["gap 100-200 ", (p) => p.spreadGap >= 100 && p.spreadGap < 200],
    ["gap 200-300 ", (p) => p.spreadGap >= 200 && p.spreadGap < 300],
    ["gap 300+    ", (p) => p.spreadGap >= 300],
  ];

  console.log("bucket         n     predicted   actual    diff     ±SE");
  for (const [label, filter] of buckets) {
    const sel = current.filter(filter);
    if (sel.length === 0) {
      console.log(`${label}  ${String(0).padStart(4)}   (no matches)`);
      continue;
    }
    const predicted = sel.reduce((s, p) => s + p.eSpread, 0) / sel.length;
    const actual = sel.filter((p) => p.spreadWon).length / sel.length;
    const se = Math.sqrt((predicted * (1 - predicted)) / sel.length);
    console.log(
      `${label}  ${String(sel.length).padStart(4)}   ${pct(predicted).padStart(7)}   ${pct(actual).padStart(7)}   ${pct(actual - predicted).padStart(7)}   ${pct(se)}`,
    );
  }

  // Same table, but only matches where every player has >= 5 prior matches
  // (early matches at rating 1000 dilute the signal).
  console.log("\nSame buckets, seasoned matches only (all 4 players have >= 5 prior matches):");
  console.log("bucket         n     predicted   actual    diff     ±SE");
  const seasoned = current.filter((p) => p.minPriorMatches >= 5);
  for (const [label, filter] of buckets) {
    const sel = seasoned.filter(filter);
    if (sel.length === 0) {
      console.log(`${label}  ${String(0).padStart(4)}   (no matches)`);
      continue;
    }
    const predicted = sel.reduce((s, p) => s + p.eSpread, 0) / sel.length;
    const actual = sel.filter((p) => p.spreadWon).length / sel.length;
    const se = Math.sqrt((predicted * (1 - predicted)) / sel.length);
    console.log(
      `${label}  ${String(sel.length).padStart(4)}   ${pct(predicted).padStart(7)}   ${pct(actual).padStart(7)}   ${pct(actual - predicted).padStart(7)}   ${pct(se)}`,
    );
  }

  // ---- Part 2: alpha sweep ----
  console.log("\n=== Part 2: alpha sweep — teamRating = alpha*max + (1-alpha)*min ===");
  console.log("Lower log-loss / Brier = better predictions. alpha 0.50 = current formula.\n");
  console.log("alpha   log-loss   Brier     log-loss (gap>=200 only)");

  const alphas = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
  let best = { alpha: 0.5, ll: Infinity };
  for (const alpha of alphas) {
    const preds = replayWithAlpha(matches, alpha);
    const all = preds.map((p) => ({ e: p.e1, won: p.team1Won }));
    const highGap = preds
      .filter((p) => p.spreadGap >= 200)
      .map((p) => ({ e: p.e1, won: p.team1Won }));
    const ll = logLoss(all);
    if (ll < best.ll) best = { alpha, ll };
    const llHigh = highGap.length > 0 ? logLoss(highGap).toFixed(4) : "n/a";
    console.log(
      `${alpha.toFixed(2)}    ${ll.toFixed(4)}     ${brier(all).toFixed(4)}    ${llHigh}  (n=${highGap.length})`,
    );
  }

  // The argmin alone means nothing — the alpha curve is nearly flat, so the
  // best value wanders with the data. Only call a leak real if the winning
  // alpha beats 0.50 by more than the noise floor (~0.006 nats at n≈566; see
  // docs/rating-engine-ablation.md for how that floor was established).
  const NOISE_FLOOR = 0.006;
  const baseline = replayWithAlpha(matches, 0.5);
  const baselineLL = logLoss(baseline.map((p) => ({ e: p.e1, won: p.team1Won })));
  const gain = baselineLL - best.ll;

  console.log(`\nBest alpha by overall log-loss: ${best.alpha.toFixed(2)}`);
  console.log(
    `Gain vs alpha=0.50: ${gain.toFixed(4)} nats (noise floor ~${NOISE_FLOOR} at this sample size)`,
  );
  if (gain <= NOISE_FLOOR) {
    console.log(
      "Within noise — the alpha curve is flat. No evidence of a partner-farming leak;\n" +
        "keep the plain average.",
    );
  } else {
    console.log("Weighted team rating beats the plain average by more than noise — investigate.");
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
