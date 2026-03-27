/**
 * Core recompute service.
 * Called from POST /api/matches (auto) and POST /api/admin/recompute (admin/nightly).
 *
 * Each call:
 *   1. Creates a new RatingRun record (status: running)
 *   2. Replays all non-voided matches through the rating engine
 *   3. Deletes ALL existing RatingSnapshot rows (fixes accumulation bug)
 *   4. Bulk-inserts fresh snapshots for this run
 *   5. Updates Player.rating / ratingConfidence / ratingVolatility
 *   6. Marks the run succeeded (or failed on error)
 */

import { prisma } from "@/lib/db";
import {
  replayAllMatches,
  computeRatingConfidence,
  computeRatingVolatility,
  type MatchRecord,
} from "@/lib/rating-engine";
import { type RatingRunType } from "@/app/generated/prisma/client";

function computeTeam1Won(games: { team1Score: number; team2Score: number }[]): boolean {
  let w1 = 0;
  let w2 = 0;
  for (const g of games) {
    if (g.team1Score > g.team2Score) w1++;
    else if (g.team2Score > g.team1Score) w2++;
  }
  return w1 > w2;
}

export interface RecomputeResult {
  runId: string;
  matchesReplayed: number;
  snapshotsWritten: number;
  playersUpdated: number;
}

export async function runRecompute(
  runType: RatingRunType,
  notes?: string,
): Promise<RecomputeResult> {
  const run = await prisma.ratingRun.create({
    data: {
      runType,
      status: "running",
      notes: notes ?? null,
    },
  });

  try {
    // Fetch all non-voided matches ordered chronologically
    const matches = await prisma.match.findMany({
      where: { voidedAt: null },
      include: {
        participants: { select: { playerId: true, team: true } },
        games: { select: { team1Score: true, team2Score: true } },
      },
      orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }],
    });

    const matchRecords: MatchRecord[] = matches.map((m) => ({
      matchId: m.id,
      matchDate: m.matchDate,
      createdAt: m.createdAt,
      team1PlayerIds: m.participants.filter((p) => p.team === 1).map((p) => p.playerId),
      team2PlayerIds: m.participants.filter((p) => p.team === 2).map((p) => p.playerId),
      team1Won: computeTeam1Won(m.games),
    }));

    // Run the full replay
    const { snapshots, finalRatings } = replayAllMatches(matchRecords, run.id);

    // Delete ALL existing snapshots before writing fresh ones.
    // This prevents accumulation across runs (each run is a complete rewrite).
    await prisma.ratingSnapshot.deleteMany({});

    // Bulk-insert new snapshots for this run
    await prisma.ratingSnapshot.createMany({
      data: snapshots.map((s) => ({
        runId: s.runId,
        playerId: s.playerId,
        matchId: s.matchId,
        matchDate: s.matchDate,
        rating: s.rating,
        effectiveK: s.effectiveK,
        expectedScore: s.expectedScore,
      })),
    });

    // Compute win% per player from matchRecords (avoids N+1 queries at read time)
    const winCount = new Map<string, number>();
    const totalCount = new Map<string, number>();
    for (const m of matchRecords) {
      for (const pid of m.team1PlayerIds) {
        winCount.set(pid, (winCount.get(pid) ?? 0) + (m.team1Won ? 1 : 0));
        totalCount.set(pid, (totalCount.get(pid) ?? 0) + 1);
      }
      for (const pid of m.team2PlayerIds) {
        winCount.set(pid, (winCount.get(pid) ?? 0) + (m.team1Won ? 0 : 1));
        totalCount.set(pid, (totalCount.get(pid) ?? 0) + 1);
      }
    }

    // Pre-index snapshots by playerId so metric functions don't scan the full array per player
    const snapshotsByPlayer = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const arr = snapshotsByPlayer.get(s.playerId) ?? [];
      arr.push(s);
      snapshotsByPlayer.set(s.playerId, arr);
    }

    // Update all players: rating, confidence, volatility, winPct
    const allPlayerIds = [...finalRatings.keys()];
    const playerUpdates = allPlayerIds.map((playerId) => {
      const rating = finalRatings.get(playerId)!;
      const playerSnaps = snapshotsByPlayer.get(playerId) ?? [];
      const ratingConfidence = computeRatingConfidence(playerId, matchRecords, playerSnaps);
      const ratingVolatility = computeRatingVolatility(playerId, playerSnaps);
      const total = totalCount.get(playerId) ?? 0;
      const wins = winCount.get(playerId) ?? 0;
      const winPct = total >= 3 ? wins / total : null;
      return prisma.player.update({
        where: { id: playerId },
        data: { rating, ratingConfidence, ratingVolatility, winPct },
      });
    });
    await Promise.all(playerUpdates);

    // Upsert CommunityStats singleton (id=1)
    const ratings = [...finalRatings.values()];
    await prisma.communityStats.upsert({
      where: { id: 1 },
      update: {
        avgRating: ratings.reduce((s, r) => s + r, 0) / ratings.length,
        minRating: Math.min(...ratings),
        maxRating: Math.max(...ratings),
        totalCount: ratings.length,
      },
      create: {
        id: 1,
        avgRating: ratings.reduce((s, r) => s + r, 0) / ratings.length,
        minRating: Math.min(...ratings),
        maxRating: Math.max(...ratings),
        totalCount: ratings.length,
      },
    });

    // Mark run as succeeded
    await prisma.ratingRun.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });

    return {
      runId: run.id,
      matchesReplayed: matchRecords.length,
      snapshotsWritten: snapshots.length,
      playersUpdated: allPlayerIds.length,
    };
  } catch (error) {
    await prisma.ratingRun
      .update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date() },
      })
      .catch(() => {
        // Ignore secondary failure — original error is more important
      });
    throw error;
  }
}
