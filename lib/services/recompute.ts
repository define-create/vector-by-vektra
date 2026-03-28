/**
 * Core recompute service.
 * Called from POST /api/matches (auto) and POST /api/admin/recompute (admin/nightly).
 *
 * runRecompute(runType, notes)           → full replay (all matches)
 * runRecompute(runType, notes, fromDate) → incremental replay (matches with matchDate >= fromDate)
 *
 * Each call:
 *   0. Concurrency guard: if a run is in progress, poll up to 10s for it to finish,
 *      then proceed with an incremental run. If still running after 10s, return
 *      { ratingsDeferred: true } — the nightly cron ensures eventual consistency.
 *      Orphaned runs (> 5 min old) are immediately marked failed and skipped.
 *   1. Creates a new RatingRun record (status: running, replayScope, fromMatchId)
 *   2. Fetches the appropriate matches (all for full, fromDate+ for incremental)
 *   3. For incremental: loads each affected player's pre-window rating from RatingSnapshot
 *   4. Replays matches through the rating engine
 *   5. Deletes only the affected snapshots (all for full, replayed-match IDs for incremental)
 *   6. Bulk-inserts fresh snapshots for this run
 *   7. Updates Player.rating / ratingConfidence / ratingVolatility / winPct for affected players
 *      (winPct uses full match history in incremental mode to stay accurate)
 *   8. Upserts CommunityStats from ALL active players' current ratings (not just replayed subset)
 *   9. Marks the run succeeded (or failed on error)
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
  skipped?: boolean;
  ratingsDeferred?: boolean;
}

// A run is considered orphaned (crashed serverless function) after this threshold.
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function runRecompute(
  runType: RatingRunType,
  notes?: string,
  fromDate?: Date,
): Promise<RecomputeResult> {
  // --- Concurrency guard (wait-and-retry) ---
  const activeRun = await prisma.ratingRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "asc" },
  });

  if (activeRun) {
    const ageMs = Date.now() - activeRun.startedAt.getTime();

    if (ageMs >= ORPHAN_THRESHOLD_MS) {
      // Orphaned run (crashed function) — mark it failed before proceeding.
      console.warn(
        `[runRecompute] Orphaned run ${activeRun.id} detected (${Math.round(ageMs / 1000)}s ago). Marking failed and continuing.`,
      );
      await prisma.ratingRun.update({
        where: { id: activeRun.id },
        data: { status: "failed", finishedAt: new Date() },
      });
    } else {
      // Wait-and-retry: poll at 500ms intervals, hard limit of 10 seconds (20 polls).
      const POLL_INTERVAL_MS = 500;
      const MAX_POLLS = 20;
      let polls = 0;
      let resolved = false;

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          polls++;
          prisma.ratingRun
            .findUnique({ where: { id: activeRun.id }, select: { status: true } })
            .then((check) => {
              if (!check || check.status === "succeeded" || check.status === "failed") {
                clearInterval(interval);
                resolved = true;
                resolve();
              } else if (polls >= MAX_POLLS) {
                clearInterval(interval);
                resolve(); // timeout — resolved stays false
              }
            })
            .catch(() => {
              clearInterval(interval);
              resolve(); // DB error — fail open
            });
        }, POLL_INTERVAL_MS);
      });

      if (!resolved) {
        console.warn(
          `[runRecompute] Concurrency wait timed out after 10s — deferring recompute (run ${activeRun.id} still in progress).`,
        );
        return {
          runId: activeRun.id,
          matchesReplayed: 0,
          snapshotsWritten: 0,
          playersUpdated: 0,
          ratingsDeferred: true,
        };
      }
      // Active run finished — proceed with this run below.
    }
  }

  const replayScope = fromDate ? "incremental" : "full";

  const run = await prisma.ratingRun.create({
    data: {
      runType,
      status: "running",
      notes: notes ?? null,
      replayScope,
    },
  });

  try {
    // Fetch matches to replay (all for full, fromDate+ for incremental)
    const matches = await prisma.match.findMany({
      where: {
        voidedAt: null,
        ...(fromDate ? { matchDate: { gte: fromDate } } : {}),
      },
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

    // All player IDs affected by this run
    const affectedPlayerIds = [
      ...new Set(matchRecords.flatMap((m) => [...m.team1PlayerIds, ...m.team2PlayerIds])),
    ];

    // --- Starting-ratings lookup (incremental only) ---
    let startingRatings: Map<string, number> | undefined;

    if (fromDate && affectedPlayerIds.length > 0) {
      // Fetch the most recent RatingSnapshot per player before fromDate.
      // JOIN on Match for createdAt tie-breaking (same-day matches ordered by createdAt).
      const candidateSnapshots = await prisma.ratingSnapshot.findMany({
        where: {
          playerId: { in: affectedPlayerIds },
          matchDate: { lt: fromDate },
        },
        include: { match: { select: { createdAt: true } } },
      });

      // Sort: matchDate DESC, then match.createdAt DESC; keep first (most recent) per player.
      candidateSnapshots.sort((a, b) => {
        const dateDiff = b.matchDate.getTime() - a.matchDate.getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.match.createdAt.getTime() - a.match.createdAt.getTime();
      });

      startingRatings = new Map<string, number>();
      for (const snap of candidateSnapshots) {
        if (!startingRatings.has(snap.playerId)) {
          startingRatings.set(snap.playerId, snap.rating);
        }
      }
    }

    // Run the replay
    const { snapshots, finalRatings } = replayAllMatches(matchRecords, run.id, startingRatings);

    // --- Snapshot delete (scoped to replayed matches for incremental) ---
    if (fromDate) {
      const replayedMatchIds = matchRecords.map((m) => m.matchId);
      if (replayedMatchIds.length > 0) {
        await prisma.ratingSnapshot.deleteMany({
          where: { matchId: { in: replayedMatchIds } },
        });
      }
    } else {
      // Full recompute — delete ALL existing snapshots before writing fresh ones.
      await prisma.ratingSnapshot.deleteMany({});
    }

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

    // --- Win% computation ---
    // For incremental runs, matchRecords is a subset — fetch full match history for accuracy.
    const winCount = new Map<string, number>();
    const totalCount = new Map<string, number>();

    if (fromDate && affectedPlayerIds.length > 0) {
      // Fetch all non-voided match participations for affected players
      const allParticipations = await prisma.matchParticipant.findMany({
        where: {
          playerId: { in: affectedPlayerIds },
          match: { voidedAt: null },
        },
        select: {
          playerId: true,
          team: true,
          match: { select: { games: { select: { team1Score: true, team2Score: true } } } },
        },
      });

      for (const p of allParticipations) {
        const t1Wins = p.match.games.filter((g) => g.team1Score > g.team2Score).length;
        const t2Wins = p.match.games.filter((g) => g.team2Score > g.team1Score).length;
        const won = p.team === 1 ? t1Wins > t2Wins : t2Wins > t1Wins;
        winCount.set(p.playerId, (winCount.get(p.playerId) ?? 0) + (won ? 1 : 0));
        totalCount.set(p.playerId, (totalCount.get(p.playerId) ?? 0) + 1);
      }
    } else {
      // Full replay — compute from matchRecords (covers all matches)
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
    }

    // Pre-index new snapshots by playerId for metric functions
    const snapshotsByPlayer = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const arr = snapshotsByPlayer.get(s.playerId) ?? [];
      arr.push(s);
      snapshotsByPlayer.set(s.playerId, arr);
    }

    // Update affected players: rating, confidence, volatility, winPct
    const playerUpdates = affectedPlayerIds.map((playerId) => {
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

    // --- CommunityStats — always from ALL active players' current ratings ---
    const allActivePlayers = await prisma.player.findMany({
      where: { deletedAt: null },
      select: { rating: true },
    });
    const allRatings = allActivePlayers.map((p) => p.rating);

    if (allRatings.length > 0) {
      await prisma.communityStats.upsert({
        where: { id: 1 },
        update: {
          avgRating: allRatings.reduce((s, r) => s + r, 0) / allRatings.length,
          minRating: Math.min(...allRatings),
          maxRating: Math.max(...allRatings),
          totalCount: allRatings.length,
        },
        create: {
          id: 1,
          avgRating: allRatings.reduce((s, r) => s + r, 0) / allRatings.length,
          minRating: Math.min(...allRatings),
          maxRating: Math.max(...allRatings),
          totalCount: allRatings.length,
        },
      });
    }

    // Record the earliest replayed match ID (incremental only)
    const fromMatchId =
      fromDate && matchRecords.length > 0 ? matchRecords[0]!.matchId : null;

    // Mark run as succeeded
    await prisma.ratingRun.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date(), fromMatchId },
    });

    return {
      runId: run.id,
      matchesReplayed: matchRecords.length,
      snapshotsWritten: snapshots.length,
      playersUpdated: affectedPlayerIds.length,
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
