import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/trajectory?horizon=10games|7days|30days
// ---------------------------------------------------------------------------

type Horizon = "10games" | "7days" | "30days";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawHorizon = req.nextUrl.searchParams.get("horizon") ?? "10games";
  const horizon: Horizon =
    rawHorizon === "7days" || rawHorizon === "30days" ? rawHorizon : "10games";

  const myPlayer = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
  });

  if (!myPlayer) {
    return NextResponse.json({
      ratingSeries: [],
      winRate: null,
      record: { wins: 0, losses: 0 },
      pointDifferential: 0,
    });
  }

  // -------------------------------------------------------------------------
  // Fetch match participations within the horizon
  // -------------------------------------------------------------------------

  const now = new Date();
  let matchParticipations;

  if (horizon === "10games") {
    matchParticipations = await prisma.matchParticipant.findMany({
      where: { playerId: myPlayer.id, match: { voidedAt: null } },
      include: {
        match: {
          include: {
            games: { orderBy: { gameOrder: "asc" } },
          },
        },
      },
      orderBy: { match: { matchDate: "desc" } },
      take: 10,
    });
  } else {
    const cutoff = new Date(
      now.getTime() - (horizon === "7days" ? 7 : 30) * 24 * 60 * 60 * 1000,
    );
    matchParticipations = await prisma.matchParticipant.findMany({
      where: {
        playerId: myPlayer.id,
        match: { voidedAt: null, matchDate: { gte: cutoff } },
      },
      include: {
        match: {
          include: {
            games: { orderBy: { gameOrder: "asc" } },
          },
        },
      },
      orderBy: { match: { matchDate: "desc" } },
    });
  }

  // Sort ascending for chart
  const sorted = [...matchParticipations].sort(
    (a, b) => a.match.matchDate.getTime() - b.match.matchDate.getTime(),
  );

  // -------------------------------------------------------------------------
  // Fetch rating snapshots for the same matches
  // -------------------------------------------------------------------------

  const matchIds = sorted.map((p) => p.matchId);

  const snapshots = matchIds.length
    ? await prisma.ratingSnapshot.findMany({
        where: { playerId: myPlayer.id, matchId: { in: matchIds } },
        orderBy: { matchDate: "asc" },
      })
    : [];

  const snapshotByMatchId = new Map(snapshots.map((s) => [s.matchId, s]));

  // -------------------------------------------------------------------------
  // Build ratingSeries and compute record / point differential
  // -------------------------------------------------------------------------

  let wins = 0;
  let losses = 0;
  let pointDifferential = 0;
  const ratingSeries: { matchDate: string; rating: number }[] = [];

  for (const participation of sorted) {
    const match = participation.match;
    const myTeam = participation.team;

    // Determine win/loss from game scores
    let t1Wins = 0;
    let t2Wins = 0;
    let myPoints = 0;
    let theirPoints = 0;

    for (const g of match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;

      if (myTeam === 1) {
        myPoints += g.team1Score;
        theirPoints += g.team2Score;
      } else {
        myPoints += g.team2Score;
        theirPoints += g.team1Score;
      }
    }

    const myTeamWon = myTeam === 1 ? t1Wins > t2Wins : t2Wins > t1Wins;
    if (myTeamWon) wins++;
    else losses++;

    pointDifferential += myPoints - theirPoints;

    // Rating series: use snapshot rating if available, else current player rating
    const snap = snapshotByMatchId.get(match.id);
    if (snap) {
      ratingSeries.push({
        matchDate: match.matchDate.toISOString(),
        rating: snap.rating,
      });
    }
  }

  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? wins / totalGames : null;

  return NextResponse.json({
    ratingSeries,
    winRate,
    record: { wins, losses },
    pointDifferential,
  });
}
