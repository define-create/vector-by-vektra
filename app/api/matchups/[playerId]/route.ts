import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { expectedScore } from "@/lib/rating-engine/elo";
import { computeVolatilityBand } from "@/lib/metrics/volatility-band";

// ---------------------------------------------------------------------------
// GET /api/matchups/[playerId]
//
// Returns matchup data between the current user and another player.
// Pro plan check: free users can only access data for direct opponents.
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playerId: targetPlayerId } = await params;

  // Fetch current user and their player profile
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { player: true },
  });

  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const myPlayer = me.player;

  // Fetch target player
  const targetPlayer = await prisma.player.findUnique({
    where: { id: targetPlayerId },
  });

  if (!targetPlayer || targetPlayer.deletedAt) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Pro plan gate: free users can only view direct opponents
  // -------------------------------------------------------------------------

  const isPro = me.plan === "pro";

  if (!isPro && myPlayer) {
    // Check if this player has ever been an opponent
    const hasPlayed = await prisma.matchParticipant.findFirst({
      where: {
        playerId: myPlayer.id,
        match: {
          voidedAt: null,
          participants: {
            some: { playerId: targetPlayerId },
          },
        },
      },
    });

    if (!hasPlayed) {
      return NextResponse.json(
        { error: "Pro plan required to view matchup data for players you haven't faced" },
        { status: 403 },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Head-to-head stats
  // -------------------------------------------------------------------------

  let h2hWins = 0;
  let h2hLosses = 0;

  if (myPlayer) {
    const h2hMatches = await prisma.matchParticipant.findMany({
      where: {
        playerId: myPlayer.id,
        match: {
          voidedAt: null,
          participants: { some: { playerId: targetPlayerId } },
        },
      },
      include: {
        match: {
          include: {
            participants: { select: { playerId: true, team: true } },
            games: true,
          },
        },
      },
    });

    for (const participation of h2hMatches) {
      const myTeam = participation.team;
      let t1Wins = 0;
      let t2Wins = 0;
      for (const g of participation.match.games) {
        if (g.team1Score > g.team2Score) t1Wins++;
        else if (g.team2Score > g.team1Score) t2Wins++;
      }
      const myTeamWon = myTeam === 1 ? t1Wins > t2Wins : t2Wins > t1Wins;
      if (myTeamWon) h2hWins++;
      else h2hLosses++;
    }
  }

  // -------------------------------------------------------------------------
  // Win probability and volatility band
  // -------------------------------------------------------------------------

  const myRating = myPlayer?.rating ?? 1000;
  const winProbability = expectedScore(myRating, targetPlayer.rating);

  const myConfidence = myPlayer?.ratingConfidence ?? 0;
  const myVolatility = myPlayer?.ratingVolatility ?? 0;

  const volatilityBand = computeVolatilityBand(
    winProbability,
    myConfidence,
    targetPlayer.ratingConfidence,
    myVolatility,
    targetPlayer.ratingVolatility,
  );

  return NextResponse.json({
    player: {
      id: targetPlayer.id,
      displayName: targetPlayer.displayName,
      rating: targetPlayer.rating,
      ratingConfidence: targetPlayer.ratingConfidence,
    },
    h2h: { wins: h2hWins, losses: h2hLosses },
    winProbability,
    volatilityBand,
  });
}
