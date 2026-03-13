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
  tag: string | null;
  ratingDelta: number | null;
}

export interface CommunityStats {
  avg: number;
  min: number;
  max: number;
}

export interface CommandFilter {
  from?: Date;
  to?: Date;
  tag?: string;
}

export interface CommandData {
  hasPlayer: boolean;
  emailVerified: boolean;
  userDisplayName: string;
  myPlayerId: string | null;
  myPlayerDisplayName: string | null;
  rating: number | null;
  winPct: number | null;
  compoundingIndex: number | null;
  driftScore: number | null;
  recentMatchHistory: LastMatch[];
  editTimer: { expiresAt: string | null };
  upcomingProbability: number | null;
  communityStats: CommunityStats | null;
  ratingHistory: { date: string; rating: number; outcome: "win" | "loss" }[];
  situationState: "hot_streak" | "improving" | "stable" | "declining" | null;
  situationDetail: string;
  driverHistory: {
    winRateHistory: number[];
    ciHistory: number[];
    driftHistory: number[];
  };
  driverDeltas: {
    winRateDelta: number | null;
    ciDelta: number | null;
    driftDelta: number | null;
  };
  dominantDriver: "winRate" | "ci" | "drift" | null;
}

export async function getCommandData(userId: string, filter?: CommandFilter): Promise<CommandData> {
  const empty: Omit<CommandData, "hasPlayer" | "emailVerified" | "userDisplayName"> = {
    myPlayerId: null,
    myPlayerDisplayName: null,
    rating: null,
    winPct: null,
    compoundingIndex: null,
    driftScore: null,
    recentMatchHistory: [],
    editTimer: { expiresAt: null },
    upcomingProbability: null,
    communityStats: null,
    ratingHistory: [],
    situationState: null,
    situationDetail: "",
    driverHistory: { winRateHistory: [], ciHistory: [], driftHistory: [] },
    driverDeltas: { winRateDelta: null, ciDelta: null, driftDelta: null },
    dominantDriver: null,
  };

  const [myPlayer, userRecord] = await Promise.all([
    prisma.player.findFirst({ where: { userId, deletedAt: null } }),
    prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, displayName: true } }),
  ]);

  const emailVerified = userRecord?.emailVerifiedAt != null;
  const userDisplayName = userRecord?.displayName ?? "";

  if (!myPlayer) return { ...empty, hasPlayer: false, emailVerified, userDisplayName };

  const now = new Date();
  const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Build the match filter clause based on the active filter
  // Always exclude voided matches
  const matchWhere = {
    voidedAt: null,
    ...(filter?.from || filter?.to
      ? {
          matchDate: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
    ...(filter?.tag ? { tag: filter.tag } : {}),
  };

  // Snapshot filter: for date range use matchDate, for tag use match.tag relation
  const snapshotWhere = {
    playerId: myPlayer.id,
    ...(filter?.from || filter?.to
      ? {
          matchDate: {
            ...(filter?.from ? { gte: filter.from } : {}),
            ...(filter?.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
    ...(filter?.tag ? { match: { tag: filter.tag } } : {}),
  };

  const [
    filteredMatches,
    filteredSnapshots,
    editableMatch,
    recentOpponentParticipants,
    communityAgg,
    historyParticipants,
  ] = await Promise.all([
    // Filtered matches — used for win% calculation
    prisma.matchParticipant.findMany({
      where: {
        playerId: myPlayer.id,
        match: matchWhere,
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

    // Filtered snapshots — used for CI + Drift (up to 20 most recent in the window)
    prisma.ratingSnapshot.findMany({
      where: snapshotWhere,
      orderBy: { matchDate: "desc" },
      take: 20,
    }),

    // Edit timer — always unfiltered (last 60 minutes regardless of active filter)
    prisma.match.findFirst({
      where: {
        enteredByUserId: userId,
        createdAt: { gt: sixtyMinutesAgo },
        voidedAt: null,
      },
      orderBy: { createdAt: "desc" },
    }),

    // Upcoming probability — always unfiltered (uses recent opponents for forward-looking calc)
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

    // Community rating stats — always unfiltered (all-time community aggregate)
    prisma.player.aggregate({
      where: { deletedAt: null },
      _avg: { rating: true },
      _min: { rating: true },
      _max: { rating: true },
      _count: { id: true },
    }),

    // Match history — filtered, last 20 in the active window
    prisma.matchParticipant.findMany({
      where: {
        playerId: myPlayer.id,
        match: matchWhere,
      },
      include: {
        match: {
          include: {
            participants: { include: { player: { select: { id: true, displayName: true } } } },
            games: true,
            ratingSnapshots: { where: { playerId: myPlayer.id }, take: 1 },
          },
        },
      },
      orderBy: [{ match: { matchDate: "desc" } }, { match: { createdAt: "desc" } }],
      take: 20,
    }),
  ]);

  // Win % — all matches in the filter window (no date cap when unfiltered)
  let wins = 0;
  let losses = 0;

  for (const participation of filteredMatches) {
    const match = participation.match;
    const myTeam = participation.team;
    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    if (myTeam === 1 ? t1Wins > t2Wins : t2Wins > t1Wins) wins++;
    else losses++;
  }

  const totalGames = wins + losses;
  const winPct = totalGames > 0 ? wins / totalGames : null;

  // Rating delta per match — diff between consecutive snapshot ratings (chronological order)
  const snapshotRatingByMatchId = new Map<string, number>();
  for (const p of historyParticipants) {
    const snap = p.match.ratingSnapshots[0];
    if (snap) snapshotRatingByMatchId.set(p.match.id, snap.rating);
  }
  const histAsc = [...historyParticipants].sort(
    (a, b) => a.match.matchDate.getTime() - b.match.matchDate.getTime(),
  );
  // ratingHistory — chronological, from histAsc + snapshotRatingByMatchId
  const ratingHistory: CommandData["ratingHistory"] = histAsc
    .map((p) => {
      const snap = snapshotRatingByMatchId.get(p.match.id);
      if (snap == null) return null;
      const myTeam = p.team;
      let t1w = 0, t2w = 0;
      for (const g of p.match.games) {
        if (g.team1Score > g.team2Score) t1w++;
        else if (g.team2Score > g.team1Score) t2w++;
      }
      const won = myTeam === 1 ? t1w > t2w : t2w > t1w;
      return { date: p.match.matchDate.toISOString(), rating: snap, outcome: (won ? "win" : "loss") as "win" | "loss" };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const ratingDeltaByMatchId = new Map<string, number | null>();
  for (let i = 0; i < histAsc.length; i++) {
    const matchId = histAsc[i]!.match.id;
    const curr = snapshotRatingByMatchId.get(matchId);
    if (curr == null) { ratingDeltaByMatchId.set(matchId, null); continue; }
    let prev: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const s = snapshotRatingByMatchId.get(histAsc[j]!.match.id);
      if (s != null) { prev = s; break; }
    }
    ratingDeltaByMatchId.set(matchId, prev != null ? curr - prev : null);
  }

  // Match history — filtered window, last 20
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
      tag: match.tag ?? null,
      ratingDelta: ratingDeltaByMatchId.get(match.id) ?? null,
    };
  });

  // Situation state — computed from recentMatchHistory (most recent first)
  let situationState: CommandData["situationState"] = null;
  let situationDetail = "";
  if (recentMatchHistory.length >= 3) {
    const last5 = recentMatchHistory.slice(0, Math.min(5, recentMatchHistory.length));
    const winsIn5 = last5.filter((m) => m.outcome === "win").length;
    let consecutiveWins = 0;
    for (const m of recentMatchHistory) {
      if (m.outcome === "win") consecutiveWins++;
      else break;
    }
    if (consecutiveWins >= 5) {
      situationState = "hot_streak";
      situationDetail = `${consecutiveWins} wins in a row`;
    } else if (winsIn5 >= 4) {
      situationState = "improving";
      situationDetail = `${winsIn5} wins in last ${last5.length} matches`;
    } else if (winsIn5 <= 1) {
      situationState = "declining";
      situationDetail = `${last5.length - winsIn5} losses in last ${last5.length} matches`;
    } else {
      situationState = "stable";
      situationDetail = `${winsIn5} wins in last ${last5.length} matches`;
    }
  }

  // CI + Drift — computed from filtered snapshots
  const snapsAsc = [...filteredSnapshots].sort(
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

  // Driver history — sliding windows for sparklines
  const winRateHistory: number[] = [];
  for (let i = 4; i <= Math.min(9, histAsc.length - 1); i++) {
    const window = histAsc.slice(i - 4, i + 1);
    let wWins = 0;
    for (const p of window) {
      const myTeam = p.team;
      let t1w = 0, t2w = 0;
      for (const g of p.match.games) {
        if (g.team1Score > g.team2Score) t1w++;
        else if (g.team2Score > g.team1Score) t2w++;
      }
      if (myTeam === 1 ? t1w > t2w : t2w > t1w) wWins++;
    }
    winRateHistory.push(wWins / 5);
  }

  const ciHistoryArr: number[] = [];
  if (snapsAsc.length >= 10) {
    for (let i = 9; i <= Math.min(19, snapsAsc.length - 1); i += 2) {
      const windowSnaps = ciSnapshots.slice(i - 9, i + 1);
      ciHistoryArr.push(computeCI(windowSnaps));
    }
  }

  const driftHistoryArr: number[] = [];
  if (snapsAsc.length >= 10) {
    for (let i = 9; i <= Math.min(19, snapsAsc.length - 1); i += 2) {
      const windowSnaps = ciSnapshots.slice(i - 9, i + 1);
      const windowActuals = windowSnaps.map((s, j) =>
        j === 0 ? 0 : (windowSnaps[j]!.rating > windowSnaps[j - 1]!.rating ? 1 : 0),
      );
      driftHistoryArr.push(computeDriftScore(windowSnaps, windowActuals));
    }
  }

  const driverHistory: CommandData["driverHistory"] = {
    winRateHistory,
    ciHistory: ciHistoryArr,
    driftHistory: driftHistoryArr,
  };

  // Driver deltas
  const winRateDelta =
    winRateHistory.length >= 2
      ? winRateHistory[winRateHistory.length - 1]! - winRateHistory[winRateHistory.length - 2]!
      : null;
  const ciDelta =
    ciHistoryArr.length >= 2
      ? ciHistoryArr[ciHistoryArr.length - 1]! - ciHistoryArr[ciHistoryArr.length - 2]!
      : null;
  const driftDelta =
    driftHistoryArr.length >= 2
      ? driftHistoryArr[driftHistoryArr.length - 1]! - driftHistoryArr[driftHistoryArr.length - 2]!
      : null;
  const driverDeltas: CommandData["driverDeltas"] = { winRateDelta, ciDelta, driftDelta };

  // Dominant driver
  let dominantDriver: CommandData["dominantDriver"] = null;
  if (winRateDelta !== null || ciDelta !== null || driftDelta !== null) {
    const absWR = winRateDelta !== null ? Math.abs(winRateDelta * 100) : 0;
    const absCI = ciDelta !== null ? Math.abs(ciDelta) : 0;
    const absDrift = driftDelta !== null ? Math.abs(driftDelta) : 0;
    if (absWR >= absCI && absWR >= absDrift) dominantDriver = "winRate";
    else if (absCI >= absDrift) dominantDriver = "ci";
    else dominantDriver = "drift";
  }

  // Edit timer — always unfiltered
  const editExpiresAt = editableMatch
    ? new Date(editableMatch.createdAt.getTime() + 60 * 60 * 1000).toISOString()
    : null;

  // Upcoming probability — always unfiltered (forward-looking)
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

  // Community stats — always unfiltered
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
    hasPlayer: true,
    emailVerified,
    userDisplayName,
    myPlayerId: myPlayer.id,
    myPlayerDisplayName: myPlayer.displayName,
    rating: myPlayer.rating,
    winPct,
    compoundingIndex,
    driftScore,
    recentMatchHistory,
    editTimer: { expiresAt: editExpiresAt },
    upcomingProbability,
    communityStats,
    ratingHistory,
    situationState,
    situationDetail,
    driverHistory,
    driverDeltas,
    dominantDriver,
  };
}
