/**
 * Command screen data service.
 * Called directly by the Command Server Component (no HTTP round-trip).
 * The /api/command route also uses this for client-side callers.
 */

import { prisma } from "@/lib/db";
import { computeCI } from "@/lib/metrics/compounding-index";
import { computeDriftScore } from "@/lib/metrics/drift-score";
import { computeUpcomingProbability } from "@/lib/metrics/upcoming-probability";

export interface LastMatch {
  matchDate: string;
  outcome: "win" | "loss";
  opponentNames: string[];
  score: string;
}

export interface CommandData {
  rating: number | null;
  winPct90d: number | null;
  compoundingIndex: number | null;
  driftScore: number | null;
  lastMatch: LastMatch | null;
  editTimer: { expiresAt: string | null };
  upcomingProbability: number | null;
}

export async function getCommandData(userId: string): Promise<CommandData> {
  const empty: CommandData = {
    rating: null,
    winPct90d: null,
    compoundingIndex: null,
    driftScore: null,
    lastMatch: null,
    editTimer: { expiresAt: null },
    upcomingProbability: null,
  };

  const myPlayer = await prisma.player.findFirst({
    where: { userId, deletedAt: null },
  });

  if (!myPlayer) return empty;

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [recentMatches, last10Snapshots, editableMatch, recentOpponentParticipants] =
    await Promise.all([
      prisma.matchParticipant.findMany({
        where: {
          playerId: myPlayer.id,
          match: { voidedAt: null, matchDate: { gte: ninetyDaysAgo } },
        },
        include: {
          match: {
            include: {
              participants: { include: { player: { select: { id: true, displayName: true } } } },
              games: true,
            },
          },
        },
        orderBy: { match: { matchDate: "desc" } },
      }),

      prisma.ratingSnapshot.findMany({
        where: { playerId: myPlayer.id },
        orderBy: { matchDate: "desc" },
        take: 10,
      }),

      prisma.match.findFirst({
        where: {
          enteredByUserId: userId,
          createdAt: { gt: sixtyMinutesAgo },
          voidedAt: null,
        },
        orderBy: { createdAt: "desc" },
      }),

      prisma.matchParticipant.findMany({
        where: { playerId: myPlayer.id, match: { voidedAt: null } },
        include: {
          match: {
            include: {
              participants: {
                include: { player: { select: { id: true, rating: true } } },
              },
            },
          },
        },
        orderBy: { match: { matchDate: "desc" } },
        take: 20,
      }),
    ]);

  // Win % and last match
  let wins90 = 0;
  let losses90 = 0;
  let lastMatch: LastMatch | null = null;

  const sortedRecent = recentMatches
    .filter((p) => p.match)
    .sort((a, b) => b.match.matchDate.getTime() - a.match.matchDate.getTime());

  for (const participation of sortedRecent) {
    const match = participation.match;
    const myTeam = participation.team;

    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    const myTeamWon = myTeam === 1 ? t1Wins > t2Wins : t2Wins > t1Wins;

    if (myTeamWon) wins90++;
    else losses90++;

    if (!lastMatch) {
      const opponents = match.participants
        .filter((p) => p.team !== myTeam)
        .map((p) => p.player.displayName);

      const gameScores = match.games
        .sort((a, b) => a.gameOrder - b.gameOrder)
        .map((g) =>
          myTeam === 1
            ? `${g.team1Score}–${g.team2Score}`
            : `${g.team2Score}–${g.team1Score}`,
        )
        .join(", ");

      lastMatch = {
        matchDate: match.matchDate.toISOString(),
        outcome: myTeamWon ? "win" : "loss",
        opponentNames: opponents,
        score: gameScores,
      };
    }
  }

  const totalGames90 = wins90 + losses90;
  const winPct90d = totalGames90 > 0 ? wins90 / totalGames90 : null;

  // CI + Drift
  const snapsAsc = [...last10Snapshots].sort(
    (a, b) => a.matchDate.getTime() - b.matchDate.getTime(),
  );
  const ciSnapshots = snapsAsc.map((s) => ({
    playerId: s.playerId,
    matchId: s.matchId,
    matchDate: s.matchDate,
    rating: s.rating,
    effectiveK: s.effectiveK,
    expectedScore: s.expectedScore,
    runId: s.runId,
  }));
  const driftActuals: number[] = ciSnapshots.map((_, i) => {
    if (i === 0) return 0;
    const delta = ciSnapshots[i]!.rating - ciSnapshots[i - 1]!.rating;
    return delta > 0 ? 1 : 0;
  });

  const compoundingIndex = ciSnapshots.length >= 2 ? computeCI(ciSnapshots) : null;
  const driftScore = ciSnapshots.length >= 1 ? computeDriftScore(ciSnapshots, driftActuals) : null;

  // Edit timer
  const editExpiresAt = editableMatch
    ? new Date(editableMatch.createdAt.getTime() + 60 * 60 * 1000).toISOString()
    : null;

  // Upcoming probability
  const recentOpponents: { id: string; rating: number }[] = [];
  for (const participation of recentOpponentParticipants) {
    const myTeam = participation.team;
    for (const p of participation.match.participants) {
      if (p.team !== myTeam && p.playerId !== myPlayer.id) {
        recentOpponents.push({ id: p.player.id, rating: p.player.rating });
      }
    }
  }
  const upcomingProbability = computeUpcomingProbability(myPlayer.rating, recentOpponents);

  return {
    rating: myPlayer.rating,
    winPct90d,
    compoundingIndex,
    driftScore,
    lastMatch,
    editTimer: { expiresAt: editExpiresAt },
    upcomingProbability,
  };
}
