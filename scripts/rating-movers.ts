/**
 * Who will notice the next recompute? (read-only, no DB writes)
 *
 * Replays the full history through the engine that produced the ratings
 * currently in the database (the pre-2026-08-23 "legacy" engine: shared team K
 * + Amendment A + plain team average) and through the engine in the working
 * tree right now, then lists the players whose rating moves most.
 *
 * Run this BEFORE triggering a recompute, so nobody's leaderboard position
 * changes without you knowing who and by how much.
 *
 * Run: npx tsx scripts/rating-movers.ts [minChange]     (default 15)
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { replayAllMatches } from "../lib/rating-engine/replay";
import type { MatchRecord } from "../lib/rating-engine/types";
import {
  teamRating,
  expectedScore,
  kFactor,
  computeRatingDelta,
  dynamicK,
  partnerDeltaShare,
  teamBaseK,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
} from "../lib/rating-engine/elo";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL }) as any),
} as any);

const INITIAL_RATING = 1000;
const MIN_CHANGE = Number(process.argv[2] ?? "15");
/**
 * "legacy"   — compare the DB's current engine against the working tree (default)
 * "conserve" — compare the working tree against itself with each match made
 *              rating-neutral, i.e. what fixing the point leak would cost
 */
const MODE = process.argv[3] ?? "legacy";

/**
 * The engine as it was before 2026-08-23: plain team average, one shared team K
 * per side (Amendment A), both partners receiving the identical delta.
 * Deliberately self-contained — elo.ts's teamRating now carries TEAM_ALPHA.
 */
function replayLegacy(matches: MatchRecord[]): Map<string, number> {
  const R = new Map<string, number>();
  const N = new Map<string, number>();
  const r = (i: string) => R.get(i) ?? INITIAL_RATING;
  const n = (i: string) => N.get(i) ?? 0;
  const plainAvg = (a: number, b: number) => (a + b) / 2;

  for (const m of matches) {
    const [a1, b1] = m.team1PlayerIds as [string, string];
    const [a2, b2] = m.team2PlayerIds as [string, string];
    const t1 = plainAvg(r(a1), r(b1));
    const t2 = plainAvg(r(a2), r(b2));
    const E1 = expectedScore(t1, t2);

    const g = lopsidedGapFactor(t1 - t2);
    const adj1 = t1 >= t2 ? teamBaseK(n(a1), n(b1)) * g : teamBaseK(n(a1), n(b1)) * (2 - g);
    const adj2 = t2 >= t1 ? teamBaseK(n(a2), n(b2)) * g : teamBaseK(n(a2), n(b2)) * (2 - g);

    const s1 = m.games.map((x) => x.team1Score);
    const s2 = m.games.map((x) => x.team2Score);
    const [w, l] = m.team1Won ? [s1, s2] : [s2, s1];
    const mov = marginOfVictoryMultiplier(w, l);

    const d1 = computeRatingDelta(kFactor(adj1, 1.0, mov), m.team1Won ? 1 : 0, E1);
    const d2 = computeRatingDelta(kFactor(adj2, 1.0, mov), m.team1Won ? 0 : 1, 1 - E1);

    const counts = [...m.team1PlayerIds, ...m.team2PlayerIds].map((i) => [i, n(i)] as const);
    for (const id of m.team1PlayerIds) R.set(id, r(id) + d1);
    for (const id of m.team2PlayerIds) R.set(id, r(id) + d2);
    for (const [id, c] of counts) N.set(id, c + 1);
  }
  return R;
}

/**
 * The current engine plus per-match normalisation: after computing all four
 * deltas, subtract the match's net change evenly so no points are created or
 * destroyed. Uses the live elo.ts helpers so it stays in step with production.
 */
function replayConserved(matches: MatchRecord[]): Map<string, number> {
  const R = new Map<string, number>();
  const N = new Map<string, number>();
  const r = (i: string) => R.get(i) ?? INITIAL_RATING;
  const n = (i: string) => N.get(i) ?? 0;

  for (const m of matches) {
    const [a1, b1] = m.team1PlayerIds as [string, string];
    const [a2, b2] = m.team2PlayerIds as [string, string];
    const t1 = teamRating(r(a1), r(b1));
    const t2 = teamRating(r(a2), r(b2));
    const E1 = expectedScore(t1, t2);

    const g = lopsidedGapFactor(t1 - t2);
    const lop1 = t1 >= t2 ? g : 2 - g;
    const lop2 = t2 >= t1 ? g : 2 - g;

    const s1 = m.games.map((x) => x.team1Score);
    const s2 = m.games.map((x) => x.team2Score);
    const [w, l] = m.team1Won ? [s1, s2] : [s2, s1];
    const mov = marginOfVictoryMultiplier(w, l);

    const pre = new Map(
      [...m.team1PlayerIds, ...m.team2PlayerIds].map((i) => [i, { n: n(i), r: r(i) }]),
    );
    const deltas = new Map<string, number>();
    for (const [ids, lop, E, act] of [
      [m.team1PlayerIds, lop1, E1, m.team1Won ? 1 : 0],
      [m.team2PlayerIds, lop2, 1 - E1, m.team1Won ? 0 : 1],
    ] as [string[], number, number, number][]) {
      for (const id of ids) {
        const partner = ids.find((x) => x !== id)!;
        const share = partnerDeltaShare(pre.get(id)!.r, pre.get(partner)!.r);
        const k = kFactor(dynamicK(pre.get(id)!.n) * share * lop, 1.0, mov);
        deltas.set(id, computeRatingDelta(k, act, E));
      }
    }

    const net = [...deltas.values()].reduce((s, v) => s + v, 0) / deltas.size;
    for (const [id, d] of deltas) R.set(id, pre.get(id)!.r + d - net);
    for (const [id, v] of pre) N.set(id, v.n + 1);
  }
  return R;
}

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
  const sorted = [...matches].sort((a, b) => {
    const d = a.matchDate.getTime() - b.matchDate.getTime();
    return d !== 0 ? d : a.createdAt.getTime() - b.createdAt.getTime();
  });

  const { finalRatings: current } = replayAllMatches(sorted, "movers");
  // legacy   : what the DB holds  ->  working tree (per-player K + alpha split)
  // conserve : working tree       ->  same plus per-match normalisation
  // all      : what the DB holds  ->  all three changes at once
  const before = MODE === "conserve" ? current : replayLegacy(sorted);
  const after =
    MODE === "conserve" || MODE === "all" ? replayConserved(sorted) : current;

  const played = new Map<string, number>();
  for (const m of sorted) {
    for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) {
      played.set(id, (played.get(id) ?? 0) + 1);
    }
  }

  const rankOf = (m: Map<string, number>) =>
    new Map(
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id], i) => [id, i + 1]),
    );
  const rankBefore = rankOf(before);
  const rankAfter = rankOf(after);

  const movers = [...before.keys()]
    .map((id) => ({
      name: names.get(id) ?? id,
      games: played.get(id) ?? 0,
      before: before.get(id)!,
      after: after.get(id)!,
      change: after.get(id)! - before.get(id)!,
      rankBefore: rankBefore.get(id)!,
      rankAfter: rankAfter.get(id)!,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  console.log(
    MODE === "conserve"
      ? `\n${movers.length} players. Working-tree engine vs the same engine with every match made rating-neutral.\n`
      : MODE === "all"
        ? `\n${movers.length} players. What the DB holds now vs ALL THREE changes: per-player K + alpha 0.60 + normalisation.\n`
        : `\n${movers.length} players. Legacy engine (what is in the DB now) vs the engine in the working tree.\n`,
  );
  console.log(`Players moving ${MIN_CHANGE}+ points:\n`);
  console.log("player             games    before     after    change    rank");
  console.log("-".repeat(70));
  for (const m of movers.filter((x) => Math.abs(x.change) >= MIN_CHANGE)) {
    const rank =
      m.rankBefore === m.rankAfter
        ? `#${m.rankBefore}`
        : `#${m.rankBefore} -> #${m.rankAfter}`;
    console.log(
      `${m.name.slice(0, 17).padEnd(18)}${String(m.games).padStart(4)}  ${m.before.toFixed(1).padStart(8)}  ${m.after.toFixed(1).padStart(8)}  ${f(m.change).padStart(8)}    ${rank}`,
    );
  }

  const abs = movers.map((m) => Math.abs(m.change)).sort((a, b) => a - b);
  console.log(
    `\nAll players: median ${abs[Math.floor(abs.length / 2)]!.toFixed(1)}, ` +
      `p90 ${abs[Math.floor(abs.length * 0.9)]!.toFixed(1)}, max ${abs.at(-1)!.toFixed(1)}`,
  );
  console.log(
    `Players changing rank: ${movers.filter((m) => m.rankBefore !== m.rankAfter).length} of ${movers.length}` +
      `   (by more than 3 places: ${movers.filter((m) => Math.abs(m.rankBefore - m.rankAfter) > 3).length})`,
  );

  console.log("\nTop 20 leaderboard, before -> after:");
  const top = [...movers].sort((a, b) => a.rankAfter - b.rankAfter).slice(0, 20);
  // Games played is shown alongside, because a rating built on 3 matches and
  // one built on 300 sit side by side on the leaderboard with nothing to
  // distinguish them.
  console.log("new rank   player             rating   games   was     evidence");
  for (const m of top) {
    const flag = m.games < 10 ? "!! thin" : m.games < 25 ? "!  light" : "";
    console.log(
      `  #${String(m.rankAfter).padEnd(7)} ${m.name.slice(0, 17).padEnd(18)}${m.after.toFixed(1).padStart(7)}${String(m.games).padStart(8)}   #${String(m.rankBefore).padEnd(5)} ${flag}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
