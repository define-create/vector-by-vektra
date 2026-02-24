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
  partnerName: string;
  partnerId: string;
  opponentNames: string[];
  opponentIds: string[];
  score: string;
}

export interface CommunityStats {
  avg: number;
  min: number;
  max: number;
}

export interface CommandData {
  myPlayerId: string | null;
  rating: number | null;
  winPct90d: number | null;
  compoundingIndex: number | null;
  driftScore: number | null;
  recentMatchHistory: LastMatch[];
  editTimer: { expiresAt: string | null };
  upcomingProbability: number | null;
  communityStats: CommunityStats | null;
}

export async function getCommandData(userId: string): Promise<CommandData> {
  const empty: CommandData = {
    myPlayerId: null,
    rating: null,
    winPct90d: null,
    compoundingIndex: null,
    driftScore: null,
    recentMatchHistory: [],
    editTimer: { expiresAt: null },
    upcomingProbability: null,
    communityStats: null,
  };

  const myPlayer = await prisma.player.findFirst({
    where: { userId, deletedAt: null },
  });

  if (!myPlayer) return empty;

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [recentMatches, last10Snapshots, editableMatch, recentOpponentParticipants, communityAgg, historyParticipants] =
    await Promise.all([
      // 90-day window — used only for win% calculation
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

      // Community rating stats (all non-deleted players, including shadow profiles)
      prisma.player.aggregate({
        where: { deletedAt: null },
        _avg: { rating: true },
        _min: { rating: true },
        _max: { rating: true },
        _count: { id: true },
      }),

      // Match history — no date filter, last 20 regardless of age
      prisma.matchParticipant.findMany({
        where: { playerId: myPlayer.id, match: { voidedAt: null } },
        include: {
          match: {
            include: {
              participants: { include: { player: { select: { id: true, displayName: true } } } },
              games: true,
            },
          },
        },
        orderBy: [{ match: { matchDate: "desc" } }, { match: { createdAt: "desc" } }],
        take: 20,
      }),
    ]);

  // Win % — 90-day window only
  let wins90 = 0;
  let losses90 = 0;

  for (const participation of recentMatches) {
    const match = participation.match;
    const myTeam = participation.team;
    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    if (myTeam === 1 ? t1Wins > t2Wins : t2Wins > t1Wins) wins90++;
    else losses90++;
  }

  const totalGames90 = wins90 + losses90;
  const winPct90d = totalGames90 > 0 ? wins90 / totalGames90 : null;

  // Match history — last 20 matches regardless of date
  const recentMatchHistory: LastMatch[] = historyParticipants.map((participation) => {
    const match = participation.match;
    const myTeam = participation.team;

    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    const myTeamWon = myTeam === 1 ? t1Wins > t2Wins : t2Wins > t1Wins;

    const partner = match.participants.find(
      (p) => p.team === myTeam && p.player.id !== myPlayer.id,
    );
    const opponentParticipants = match.participants.filter((p) => p.team !== myTeam);
    const opponents = opponentParticipants.map((p) => p.player.displayName);
    const opponentIds = opponentParticipants.map((p) => p.player.id);
    const gameScores = match.games
      .sort((a, b) => a.gameOrder - b.gameOrder)
      .map((g) =>
        myTeam === 1
          ? `${g.team1Score}–${g.team2Score}`
          : `${g.team2Score}–${g.team1Score}`,
      )
      .join(", ");

    return {
      matchDate: match.matchDate.toISOString(),
      outcome: myTeamWon ? "win" : "loss",
      partnerName: partner?.player.displayName ?? "Unknown",
      partnerId: partner?.player.id ?? "",
      opponentNames: opponents,
      opponentIds,
      score: gameScores,
    };
  });

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

  // Community stats
  let communityStats: CommunityStats | null = null;
  if (
    communityAgg._count.id >= 3 &&
    communityAgg._avg.rating !== null &&
    communityAgg._min.rating !== null &&
    communityAgg._max.rating !== null
  ) {
    communityStats = {
      avg: communityAgg._avg.rating,
      min: communityAgg._min.rating,
      max: communityAgg._max.rating,
    };
  }

  return {
    myPlayerId: myPlayer.id,
    rating: myPlayer.rating,
    winPct90d,
    compoundingIndex,
    driftScore,
    recentMatchHistory,
    editTimer: { expiresAt: editExpiresAt },
    upcomingProbability,
    communityStats,
  };
}
