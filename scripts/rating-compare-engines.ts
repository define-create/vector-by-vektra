/**
 * Side-by-side leaderboard under every engine option considered (read-only).
 *
 * Four columns, all replaying the same 566-match history:
 *
 *   LEGACY      what the database holds right now — shared team K + Amendment A,
 *               plain team average
 *   SHIPPED     the working tree — per-player K + TEAM_ALPHA 0.60. Uses the real
 *               lib/rating-engine/replay.ts, not a copy
 *   OPTION B    per-player EXPECTED score at full strength ("the favourite was
 *               meant to win, so reward them less"). Rejected — see Result 4
 *   NORMALISED  SHIPPED plus per-match rating conservation. Rejected — see
 *               Result 6, it distorts individual matches by a median 18.7%
 *
 * Run: npx tsx scripts/rating-compare-engines.ts [topN]      (default 25)
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
const TOP_N = Number(process.argv[2] ?? "25");

type Variant = "legacy" | "optionB" | "normalised";

/**
 * One replay covering the three non-shipped variants. SHIPPED comes from the
 * real engine instead, so this never has to mirror it.
 */
function replayVariant(matches: MatchRecord[], variant: Variant): Map<string, number> {
  const R = new Map<string, number>();
  const N = new Map<string, number>();
  const r = (i: string) => R.get(i) ?? INITIAL_RATING;
  const n = (i: string) => N.get(i) ?? 0;

  // Legacy and option B both predate TEAM_ALPHA, so they use a plain average.
  const team = (x: number, y: number) =>
    variant === "normalised" ? teamRating(x, y) : (x + y) / 2;

  for (const m of matches) {
    const [a1, b1] = m.team1PlayerIds as [string, string];
    const [a2, b2] = m.team2PlayerIds as [string, string];
    const t1 = team(r(a1), r(b1));
    const t2 = team(r(a2), r(b2));
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

    for (const [ids, lop, eTeam, oppAvg, act] of [
      [m.team1PlayerIds, lop1, E1, t2, m.team1Won ? 1 : 0],
      [m.team2PlayerIds, lop2, 1 - E1, t1, m.team1Won ? 0 : 1],
    ] as [string[], number, number, number, number][]) {
      // Legacy: one shared team K, both partners get the identical delta.
      const legacyBase =
        variant === "legacy" ? teamBaseK(pre.get(ids[0]!)!.n, pre.get(ids[1]!)!.n) : null;

      for (const id of ids) {
        const partner = ids.find((x) => x !== id)!;
        const share =
          variant === "normalised" ? partnerDeltaShare(pre.get(id)!.r, pre.get(partner)!.r) : 1;
        const k = kFactor((legacyBase ?? dynamicK(pre.get(id)!.n)) * share * lop, 1.0, mov);
        // Option B: hold each player to their own solo expectation instead of
        // the team's.
        const e = variant === "optionB" ? expectedScore(pre.get(id)!.r, oppAvg) : eTeam;
        deltas.set(id, computeRatingDelta(k, act, e));
      }
    }

    if (variant === "normalised") {
      // Scale each side toward the midpoint so the match nets zero.
      let gained = 0;
      let lost = 0;
      for (const d of deltas.values()) {
        if (d > 0) gained += d;
        else lost += -d;
      }
      if (gained > 0 && lost > 0) {
        const target = (gained + lost) / 2;
        for (const [id, d] of deltas) {
          deltas.set(id, d * (d > 0 ? target / gained : target / lost));
        }
      }
    }

    for (const [id, d] of deltas) R.set(id, pre.get(id)!.r + d);
    for (const [id, v] of pre) N.set(id, v.n + 1);
  }
  return R;
}

const rankOf = (m: Map<string, number>) =>
  new Map(
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id], i) => [id, i + 1]),
  );

const spread = (m: Map<string, number>) => {
  const v = [...m.values()];
  const mu = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length);
  const sorted = [...v].sort((a, b) => a - b);
  return { mu, sd, lo: sorted[0]!, hi: sorted.at(-1)! };
};

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

  const played = new Map<string, number>();
  for (const m of sorted) {
    for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) {
      played.set(id, (played.get(id) ?? 0) + 1);
    }
  }

  const engines: [string, Map<string, number>][] = [
    ["LEGACY", replayVariant(sorted, "legacy")],
    ["SHIPPED", replayAllMatches(sorted, "cmp").finalRatings],
    ["OPTION B", replayVariant(sorted, "optionB")],
    ["NORMALISED", replayVariant(sorted, "normalised")],
  ];
  const ranks = engines.map(([, m]) => rankOf(m));

  const shipped = engines[1]![1];
  const order = [...shipped.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  console.log(`\nLeaderboard under each engine option — top ${TOP_N} of ${order.length}, ordered by SHIPPED.\n`);
  console.log("                        LEGACY        SHIPPED       OPTION B      NORMALISED");
  console.log("player            games  rank rating  rank rating  rank rating  rank rating");
  console.log("-".repeat(78));
  for (const id of order.slice(0, TOP_N)) {
    let line = `${(names.get(id) ?? id).slice(0, 16).padEnd(17)}${String(played.get(id) ?? 0).padStart(4)} `;
    engines.forEach(([, m], i) => {
      line += `  #${String(ranks[i]!.get(id)).padEnd(3)}${m.get(id)!.toFixed(0).padStart(5)}`;
    });
    console.log(line);
  }

  console.log("\n" + "-".repeat(78));
  console.log("engine        mean   std dev   lowest  highest   range   vs SHIPPED spread");
  const shippedSd = spread(shipped).sd;
  for (const [label, m] of engines) {
    const s = spread(m);
    const rel = ((s.sd / shippedSd - 1) * 100).toFixed(1);
    console.log(
      `${label.padEnd(12)} ${s.mu.toFixed(1).padStart(6)}   ${s.sd.toFixed(1).padStart(6)}   ${s.lo.toFixed(0).padStart(6)}  ${s.hi.toFixed(0).padStart(7)}  ${(s.hi - s.lo).toFixed(0).padStart(6)}   ${(rel.startsWith("-") ? rel : "+" + rel).padStart(6)}%`,
    );
  }

  console.log(
    "\nOPTION B's narrower range IS the collapse: the same players, squeezed together,",
  );
  console.log("so the leaderboard separates them less well.");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
