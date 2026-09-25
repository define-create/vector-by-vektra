/**
 * Per-match old-vs-new engine comparison for a single day (read-only, no writes).
 *
 * Replays the FULL history twice — once with the pre-2026-08-23 engine (shared
 * team K + Amendment A cap) and once with the shipped per-player K engine — then
 * prints, for every match on the target date, each player's rating going in and
 * the delta each engine awards.
 *
 * The NEW column comes from the real lib/rating-engine/replay.ts, not a copy, so
 * what is printed is what the app would actually compute.
 *
 * Note the two engines diverge over the whole history, so a player's rating
 * *entering* a match already differs between them. The delta gap therefore has
 * two sources: a different K, and a different expected score. Both are shown.
 *
 * Dates are bucketed in LOCAL time (America/New_York), not UTC — an evening
 * game is stored as the next day in UTC (10:30pm 8/22 EDT = 02:30 8/23 Z), so
 * bucketing by the ISO date would put it on the wrong day.
 *
 * Run: npx tsx scripts/rating-diff-day.ts [YYYY-MM-DD] [IANA-timezone]
 *      defaults: 2026-08-22, America/New_York
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { replayAllMatches } from "../lib/rating-engine/replay";
import type { MatchRecord } from "../lib/rating-engine/types";
import {
  expectedScore,
  kFactor,
  computeRatingDelta,
  teamBaseK,
  dynamicK,
  PARTNER_TIE_EPSILON,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
} from "../lib/rating-engine/elo";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool as any) } as any);

const INITIAL_RATING = 1000;
const TARGET = process.argv[2] ?? "2026-08-22";
const TZ = process.argv[3] ?? "America/New_York";
/**
 * Mode (4th arg):
 *   "simple"  (default) — plain results table: names, score, rating before/after, delta
 *   "compare"           — legacy engine vs shipped engine, side by side
 *   "beta:<n>"          — shipped vs option (b) at strength n, side by side
 */
const MODE = process.argv[4] ?? "simple";
const BETA = MODE.startsWith("beta:") ? Number(MODE.slice(5)) : 0;
/** alpha:<n> — stronger partner counts for n of team strength AND takes that share of the delta. */
const ALPHA = MODE.startsWith("alpha:") ? Number(MODE.slice(6)) : 0.5;
const SIMPLE = MODE === "simple";
// A typo here would otherwise fall through to legacy mode silently and the
// output would look plausible while answering a different question.
if (!Number.isFinite(BETA) || BETA < 0 || BETA > 1) {
  console.error(
    `Invalid beta "${process.argv[4]}" — must be a number in [0, 1].\n` +
      `  0   compare legacy engine vs shipped (default)\n` +
      `  >0  compare shipped vs option (b) at that strength\n` +
      `Usage: npx tsx scripts/rating-diff-day.ts [YYYY-MM-DD] [IANA-timezone] [beta]`,
  );
  process.exit(1);
}

/** YYYY-MM-DD in the target timezone, so evening games land on the right day. */
function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function localTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Per (match, player) result from one engine. */
interface Row {
  pre: number;
  delta: number;
  k: number;
  expected: number;
}

// ---------------------------------------------------------------------------
// Comparison engine. Two modes:
//   legacy   — shared team K + Amendment A, exactly as it was before 2026-08-23
//   beta > 0 — per-player K PLUS option (b): a per-player expected score, where
//              the stronger partner is held to a higher bar than the team's
//              (see docs/rating-engine-ablation.md, Result 4)
// ---------------------------------------------------------------------------

function replayVariant(
  matches: MatchRecord[],
  opts: { legacy: boolean; beta: number; alpha?: number },
): Map<string, Row> {
  const alpha = opts.alpha ?? 0.5;
  const weightedTeam = (x: number, y: number) =>
    alpha * Math.max(x, y) + (1 - alpha) * Math.min(x, y);
  const ratings = new Map<string, number>();
  const counts = new Map<string, number>();
  const out = new Map<string, Row>();
  const r = (id: string) => ratings.get(id) ?? INITIAL_RATING;
  const n = (id: string) => counts.get(id) ?? 0;

  for (const m of matches) {
    const [a1, b1] = m.team1PlayerIds as [string, string];
    const [a2, b2] = m.team2PlayerIds as [string, string];

    // Always the local weighted form: at alpha = 0.5 it IS the plain average,
    // which is what the legacy engine used. Deliberately NOT elo.ts's
    // teamRating — that now carries TEAM_ALPHA, which would silently turn the
    // "legacy" replay into the new model.
    const t1Avg = weightedTeam(r(a1), r(b1));
    const t2Avg = weightedTeam(r(a2), r(b2));
    const E1 = expectedScore(t1Avg, t2Avg);
    const E2 = 1 - E1;

    const gapFactor = lopsidedGapFactor(t1Avg - t2Avg);
    const lop1 = t1Avg >= t2Avg ? gapFactor : 2 - gapFactor;
    const lop2 = t2Avg >= t1Avg ? gapFactor : 2 - gapFactor;

    const s1 = m.games.map((g) => g.team1Score);
    const s2 = m.games.map((g) => g.team2Score);
    const [w, l] = m.team1Won ? [s1, s2] : [s2, s1];
    const mov = marginOfVictoryMultiplier(w, l);

    // Legacy shares one base K across the team; otherwise each player uses their own.
    const legacyBase1 = opts.legacy ? teamBaseK(n(a1), n(b1)) : null;
    const legacyBase2 = opts.legacy ? teamBaseK(n(a2), n(b2)) : null;

    const pre = new Map(
      [...m.team1PlayerIds, ...m.team2PlayerIds].map((id) => [id, { n: n(id), r: r(id) }]),
    );

    /** Option (b): blend the team expectation toward the player's solo one. */
    const expectationFor = (id: string, eTeam: number, oppAvg: number) =>
      opts.beta === 0
        ? eTeam
        : eTeam + opts.beta * (expectedScore(pre.get(id)!.r, oppAvg) - eTeam);

    const sides = [
      { ids: m.team1PlayerIds, base: legacyBase1, lop: lop1, eTeam: E1, oppAvg: t2Avg, actual: m.team1Won ? 1 : 0 },
      { ids: m.team2PlayerIds, base: legacyBase2, lop: lop2, eTeam: E2, oppAvg: t1Avg, actual: m.team1Won ? 0 : 1 },
    ];

    /** Stronger partner takes 2*alpha of the delta, weaker 2*(1-alpha). */
    const shareFor = (id: string, ids: string[]) => {
      if (alpha === 0.5) return 1;
      const partner = ids.find((x) => x !== id)!;
      const self = pre.get(id)!.r;
      const other = pre.get(partner)!.r;
      // Mirrors elo.ts PARTNER_TIE_EPSILON — sub-point gaps are noise, not an ordering.
      if (Math.abs(self - other) < PARTNER_TIE_EPSILON) return 1;
      return 2 * (self > other ? alpha : 1 - alpha);
    };

    for (const side of sides) {
      for (const id of side.ids) {
        const k =
          kFactor((side.base ?? dynamicK(pre.get(id)!.n)) * side.lop, 1.0, mov) *
          shareFor(id, side.ids);
        const e = expectationFor(id, side.eTeam, side.oppAvg);
        const delta = computeRatingDelta(k, side.actual, e);
        out.set(`${m.matchId}|${id}`, { pre: pre.get(id)!.r, delta, k, expected: e });
        ratings.set(id, pre.get(id)!.r + delta);
      }
    }
    for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) counts.set(id, pre.get(id)!.n + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------

const f = (x: number, d = 1) => (x >= 0 ? "+" : "") + x.toFixed(d);

async function main() {
  const rows = await prisma.match.findMany({
    where: { voidedAt: null },
    include: {
      participants: { select: { playerId: true, team: true } },
      games: { select: { team1Score: true, team2Score: true, gameOrder: true } },
    },
    orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }],
  });

  const names = new Map(
    (await prisma.player.findMany({ select: { id: true, displayName: true } })).map((p) => [
      p.id,
      p.displayName,
    ]),
  );

  const matches: MatchRecord[] = [];
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
      matchId: m.id,
      matchDate: m.matchDate,
      createdAt: m.createdAt,
      team1PlayerIds: t1,
      team2PlayerIds: t2,
      team1Won: w1 > w2,
      games: m.games
        .sort((a, b) => a.gameOrder - b.gameOrder)
        .map((g) => ({ team1Score: g.team1Score, team2Score: g.team2Score })),
    });
  }

  // Chronological order the engines both use
  const sorted = [...matches].sort((a, b) => {
    const d = a.matchDate.getTime() - b.matchDate.getTime();
    return d !== 0 ? d : a.createdAt.getTime() - b.createdAt.getTime();
  });

  // NEW: real engine. Derive pre-rating and delta from consecutive snapshots.
  const { snapshots } = replayAllMatches(sorted, "compare");
  const byPlayer = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const arr = byPlayer.get(s.playerId) ?? [];
    arr.push(s);
    byPlayer.set(s.playerId, arr);
  }
  const newRows = new Map<string, Row>();
  for (const [, snaps] of byPlayer) {
    snaps.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
    let prev = INITIAL_RATING;
    for (const s of snaps) {
      newRows.set(`${s.matchId}|${s.playerId}`, {
        pre: prev,
        delta: s.rating - prev,
        k: s.effectiveK,
        expected: s.expectedScore,
      });
      prev = s.rating;
    }
  }

  // With no beta: legacy vs shipped. With beta: shipped vs option (b), so the
  // "OLD" column is the shipped engine and "NEW" is the proposal.
  const variantMode = BETA > 0 || ALPHA !== 0.5;
  const oldRows = variantMode ? newRows : replayVariant(sorted, { legacy: true, beta: 0 });
  const cmpRows = variantMode
    ? replayVariant(sorted, { legacy: false, beta: BETA, alpha: ALPHA })
    : newRows;
  const [oldLabel, newLabel] = variantMode
    ? ["SHIPPED", BETA > 0 ? `beta=${BETA.toFixed(2)}` : `alpha=${ALPHA.toFixed(2)}`]
    : ["OLD", "NEW"];

  const dayMatches = sorted.filter((m) => localDate(m.matchDate) === TARGET);
  if (dayMatches.length === 0) {
    const available = [...new Set(sorted.map((m) => localDate(m.matchDate)))];
    console.log(`No matches on ${TARGET} (${TZ}). Most recent: ${available.slice(-8).join(", ")}`);
    return;
  }

  console.log(
    `\nMatches on ${TARGET} (${TZ}, played ${localTime(dayMatches[0]!.matchDate)}): ` +
      `${dayMatches.length}   (full history: ${sorted.length} matches)`,
  );
  // --- Simple mode: just the results, as a player would read them -----------
  if (SIMPLE) {
    console.log("Ratings from the shipped engine (per-player K).\n");
    for (const [idx, m] of dayMatches.entries()) {
      const score = m.games.map((g) => `${g.team1Score}-${g.team2Score}`).join(", ");
      console.log("=".repeat(72));
      console.log(`Match ${idx + 1}   ${score}   winner: ${m.team1Won ? "Team 1" : "Team 2"}`);
      console.log("team  player              before     after    change");
      console.log("-".repeat(72));
      for (const [teamNo, ids] of [
        [1, m.team1PlayerIds],
        [2, m.team2PlayerIds],
      ] as [number, string[]][]) {
        for (const id of ids) {
          const row = newRows.get(`${m.matchId}|${id}`)!;
          console.log(
            `  ${teamNo}   ${(names.get(id) ?? id).slice(0, 16).padEnd(18)}` +
              `${row.pre.toFixed(1).padStart(8)}  ${(row.pre + row.delta).toFixed(1).padStart(8)}  ${f(row.delta).padStart(8)}`,
          );
        }
        if (teamNo === 1) console.log("");
      }
    }

    // Net movement across the night, per player — the thing a player checks.
    console.log("=".repeat(72));
    console.log("\nNet change across all 6 matches:\n");
    const net = new Map<string, { start: number; end: number; games: number }>();
    for (const m of dayMatches) {
      for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) {
        const row = newRows.get(`${m.matchId}|${id}`)!;
        const cur = net.get(id);
        if (cur) {
          cur.end = row.pre + row.delta;
          cur.games++;
        } else {
          net.set(id, { start: row.pre, end: row.pre + row.delta, games: 1 });
        }
      }
    }
    console.log("player            games   start      end     change");
    for (const [id, v] of [...net.entries()].sort((a, b) => b[1].end - a[1].end)) {
      console.log(
        `${(names.get(id) ?? id).slice(0, 16).padEnd(18)}${String(v.games).padStart(3)}  ${v.start.toFixed(1).padStart(8)}  ${v.end.toFixed(1).padStart(8)}  ${f(v.end - v.start).padStart(8)}`,
      );
    }
    return;
  }

  console.log(
    !variantMode
      ? `${oldLabel} = shared team K + Amendment A cap.   ${newLabel} = per-player K (shipped).\n`
      : BETA > 0
        ? `${oldLabel} = per-player K (shipped).   ${newLabel} = option (b), per-player expected score.\n`
        : `${oldLabel} = per-player K (shipped).   ${newLabel} = stronger partner counts ${(100 * ALPHA).toFixed(0)}% of team strength.\n`,
  );

  let totalAbs = 0;
  let count = 0;

  dayMatches.forEach((m, idx) => {
    const score = m.games.map((g) => `${g.team1Score}-${g.team2Score}`).join(", ");
    const winner = m.team1Won ? "Team 1" : "Team 2";
    console.log(`${"=".repeat(104)}`);
    console.log(`Match ${idx + 1}  ${score}   winner: ${winner}`);
    console.log(
      `team  player            ${oldLabel.padEnd(7)} pre  ${oldLabel.padEnd(5)} Δ  ${oldLabel.padEnd(5)} K  |  ` +
        `${newLabel.padEnd(7)} pre  ${newLabel.padEnd(5)} Δ  ${newLabel.padEnd(5)} K  |  Δ-diff`,
    );
    console.log("-".repeat(104));

    for (const [teamNo, ids] of [
      [1, m.team1PlayerIds],
      [2, m.team2PlayerIds],
    ] as [number, string[]][]) {
      for (const id of ids) {
        const o = oldRows.get(`${m.matchId}|${id}`)!;
        const nw = cmpRows.get(`${m.matchId}|${id}`)!;
        const diff = nw.delta - o.delta;
        totalAbs += Math.abs(diff);
        count++;
        console.log(
          `  ${teamNo}   ${(names.get(id) ?? id).slice(0, 18).padEnd(20)}` +
            `${o.pre.toFixed(1).padStart(7)}  ${f(o.delta).padStart(7)}  ${o.k.toFixed(1).padStart(6)}  |` +
            `${nw.pre.toFixed(1).padStart(8)}  ${f(nw.delta).padStart(7)}  ${nw.k.toFixed(1).padStart(6)}  |` +
            `  ${f(diff).padStart(6)}`,
        );
      }
      if (teamNo === 1) console.log("");
    }
  });

  console.log("=".repeat(104));
  console.log(
    `\n${count} player-results on ${TARGET}. Mean |change in delta|: ${(totalAbs / count).toFixed(2)} pts.`,
  );
  console.log(
    `Note: ${oldLabel} pre and ${newLabel} pre already differ — the two engines diverged over all`,
  );
  console.log(
    BETA > 0
      ? "prior history, so the gap reflects both the changed expectation and the compounding drift it causes."
      : "prior history, so the gap reflects both the K change and the resulting expected-score change.",
  );
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
