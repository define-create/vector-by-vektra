import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeWinProbability, computeMoneyline } from "@/lib/matchup";
import { computeMomentum } from "@/lib/metrics/momentum";
import {
  computeExpectationGap,
  type MatchForGap,
  type SnapshotForGap,
} from "@/lib/metrics/expectation-gap";
import { computeVolatilityBand } from "@/lib/metrics/volatility-band";

// ---------------------------------------------------------------------------
// GET /api/matchup?player1=&player2=&player3=&player4=
//
// Returns the full Matchup Projection payload for a doubles matchup.
// player1+player2 = primary pair ("you + partner")
// player3+player4 = opponent pair
//
// PRD: tasks/prd-matchup-screen.md §4.2
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // 3.1 — Parse and validate query params
  // -------------------------------------------------------------------------
  const { searchParams } = req.nextUrl;
  const player1Id = searchParams.get("player1");
  const player2Id = searchParams.get("player2");
  const player3Id = searchParams.get("player3");
  const player4Id = searchParams.get("player4");

  if (!player1Id || !player2Id || !player3Id || !player4Id) {
    return NextResponse.json(
      { error: "Missing required query params: player1, player2, player3, player4" },
      { status: 400 },
    );
  }

  // -------------------------------------------------------------------------
  // 3.2 — Fetch all 4 players
  // -------------------------------------------------------------------------
  const players = await prisma.player.findMany({
    where: {
      id: { in: [player1Id, player2Id, player3Id, player4Id] },
      deletedAt: null,
    },
  });

  if (players.length !== 4) {
    const foundIds = new Set(players.map((p) => p.id));
    const missingId = [player1Id, player2Id, player3Id, player4Id].find(
      (id) => !foundIds.has(id),
    );
    return NextResponse.json(
      { error: `Player not found: ${missingId}` },
      { status: 404 },
    );
  }

  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const p1 = byId[player1Id]!;
  const p2 = byId[player2Id]!;
  const p3 = byId[player3Id]!;
  const p4 = byId[player4Id]!;

  // -------------------------------------------------------------------------
  // 3.3 — Win probability, moneyline, ratingDiff
  // -------------------------------------------------------------------------
  const probability = computeWinProbability(p1.rating, p2.rating, p3.rating, p4.rating);
  const moneyline = computeMoneyline(probability);
  const ratingDiff = (p1.rating + p2.rating) / 2 - (p3.rating + p4.rating) / 2;

  // -------------------------------------------------------------------------
  // 3.4 — Confidence (player1) and Volatility Band
  // -------------------------------------------------------------------------
  const confidence = p1.ratingConfidence;

  const volBand = computeVolatilityBand(
    probability,
    (p1.ratingConfidence + p2.ratingConfidence) / 2,
    (p3.ratingConfidence + p4.ratingConfidence) / 2,
    (p1.ratingVolatility + p2.ratingVolatility) / 2,
    (p3.ratingVolatility + p4.ratingVolatility) / 2,
  );
  const volatility = `±${Math.round(volBand.width * 100)}%`;

  // -------------------------------------------------------------------------
  // DB fetch 1 of 2 — player1's snapshots (used for Momentum + ExpGap)
  // -------------------------------------------------------------------------
  const p1AllSnapshots = await prisma.ratingSnapshot.findMany({
    where: { playerId: player1Id },
    select: {
      matchId: true,
      matchDate: true,
      rating: true,
      effectiveK: true,
      expectedScore: true,
      runId: true,
      playerId: true,
    },
    orderBy: { matchDate: "asc" },
  });

  // -------------------------------------------------------------------------
  // 3.5 — Momentum (last 11 snapshots → 10 delta pairs)
  // -------------------------------------------------------------------------
  // computeMomentum accepts SnapshotWrite[] and slices internally, so pass all.
  const momentum = computeMomentum(
    p1AllSnapshots.map((s) => ({ ...s, playerId: player1Id })),
  );

  // -------------------------------------------------------------------------
  // DB fetch 2 of 2 — all player1 matches with participants + games
  // Used for: ExpGap scope filtering + H2H history
  // -------------------------------------------------------------------------
  const p1AllMatches = await prisma.match.findMany({
    where: {
      voidedAt: null,
      participants: { some: { playerId: player1Id } },
    },
    include: {
      participants: { select: { playerId: true, team: true } },
      games: { orderBy: { gameOrder: "asc" } },
    },
    orderBy: { matchDate: "desc" },
  });

  // -------------------------------------------------------------------------
  // 3.6 — Expectation Gap
  // -------------------------------------------------------------------------
  const matchesForGap: MatchForGap[] = p1AllMatches.map((match) => {
    const team1PlayerIds = match.participants
      .filter((p) => p.team === 1)
      .map((p) => p.playerId);
    const team2PlayerIds = match.participants
      .filter((p) => p.team === 2)
      .map((p) => p.playerId);

    // Determine winner from game scores
    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }

    return {
      matchId: match.id,
      team1PlayerIds,
      team2PlayerIds,
      team1Won: t1Wins > t2Wins,
    };
  });

  const snapshotsForGap: SnapshotForGap[] = p1AllSnapshots.map((s) => ({
    matchId: s.matchId,
    expectedScore: s.expectedScore,
  }));

  const expectationGapResult = computeExpectationGap(
    player1Id,
    player2Id,
    player3Id,
    player4Id,
    matchesForGap,
    snapshotsForGap,
  );

  // -------------------------------------------------------------------------
  // 3.7 — H2H history (matches where {p1,p2} vs {p3,p4}, order-invariant)
  // -------------------------------------------------------------------------
  const snapshotByMatchId = new Map(
    p1AllSnapshots.map((s) => [s.matchId, s]),
  );

  const h2hMatches = p1AllMatches.filter((match) => {
    const team1Ids = match.participants
      .filter((p) => p.team === 1)
      .map((p) => p.playerId);
    const team2Ids = match.participants
      .filter((p) => p.team === 2)
      .map((p) => p.playerId);

    const pair1OnTeam1 = team1Ids.includes(player1Id) && team1Ids.includes(player2Id);
    const pair2OnTeam2 = team2Ids.includes(player3Id) && team2Ids.includes(player4Id);
    const pair1OnTeam2 = team2Ids.includes(player1Id) && team2Ids.includes(player2Id);
    const pair2OnTeam1 = team1Ids.includes(player3Id) && team1Ids.includes(player4Id);

    return (pair1OnTeam1 && pair2OnTeam2) || (pair1OnTeam2 && pair2OnTeam1);
  });

  // -------------------------------------------------------------------------
  // 3.8 — Format H2H rows
  // -------------------------------------------------------------------------
  const history = h2hMatches.map((match) => {
    const snap = snapshotByMatchId.get(match.id);

    // Determine which team player1 is on
    const p1Team = match.participants.find((p) => p.playerId === player1Id)?.team ?? 1;

    // Determine match winner from game scores
    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    const team1Won = t1Wins > t2Wins;
    const p1Won = p1Team === 1 ? team1Won : !team1Won;

    // Format score string: "21–17, 18–21, 11–8"
    const score = match.games
      .map((g) =>
        p1Team === 1
          ? `${g.team1Score}–${g.team2Score}`
          : `${g.team2Score}–${g.team1Score}`,
      )
      .join(", ");

    // Rating delta for player1: K * (actual - expected)
    const delta = snap
      ? snap.effectiveK * ((p1Won ? 1 : 0) - snap.expectedScore)
      : 0;

    return {
      date: match.matchDate.toISOString().slice(0, 10), // "YYYY-MM-DD"
      result: p1Won ? ("W" as const) : ("L" as const),
      score,
      delta: Math.round(delta * 10) / 10, // 1 decimal place
    };
  });

  // -------------------------------------------------------------------------
  // 3.9 — Record string and average margin
  // -------------------------------------------------------------------------
  const wins = history.filter((r) => r.result === "W").length;
  const losses = history.filter((r) => r.result === "L").length;
  const record = `${wins}–${losses}`;

  const avgMargin =
    history.length > 0
      ? Math.round(
          (history.reduce((sum, r) => sum + r.delta, 0) / history.length) * 10,
        ) / 10
      : 0;

  // -------------------------------------------------------------------------
  // 3.10 — Return full response
  // -------------------------------------------------------------------------
  return NextResponse.json({
    probability,
    moneyline,
    ratingDiff: Math.round(ratingDiff * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    volatility,
    momentum: Math.round(momentum * 10) / 10,
    expectationGap: Math.round(expectationGapResult.value * 10) / 10,
    expectationGapLowSample: expectationGapResult.lowSample,
    history,
    record,
    avgMargin,
    // Player display names for the UI Teams Block
    players: {
      player1: { id: p1.id, displayName: p1.displayName },
      player2: { id: p2.id, displayName: p2.displayName },
      player3: { id: p3.id, displayName: p3.displayName },
      player4: { id: p4.id, displayName: p4.displayName },
    },
  });
}
