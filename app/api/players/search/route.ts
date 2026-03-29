import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/players/search?q=<query>[&unclaimed=true][&includeStats=true]
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const unclaimedOnly = searchParams.get("unclaimed") === "true";
  const includeStats = searchParams.get("includeStats") === "true";

  if (!q) {
    return NextResponse.json({ players: [] });
  }

  // Get the current user's player id (for playedWithMe detection)
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { player: { select: { id: true } } },
  });
  const myPlayerId = currentUser?.player?.id ?? null;

  const where = {
    displayName: { contains: q, mode: "insensitive" as const },
    deletedAt: null,
    ...(unclaimedOnly ? { userId: null } : {}),
  };

  if (!includeStats) {
    const players = await prisma.player.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        rating: true,
        claimed: true,
        optOutPredictions: true,
        _count: { select: { matchParticipants: true } },
      },
      orderBy: { displayName: "asc" },
      take: 10,
    });

    // Check playedWithMe for each result
    const playerIds = players.map((p) => p.id);
    const playedWithSet = await getPlayedWithSet(myPlayerId, playerIds);

    return NextResponse.json({
      players: players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        rating: p.rating,
        claimed: p.claimed,
        optOutPredictions: p.optOutPredictions,
        matchCount: p._count.matchParticipants,
        playedWithMe: playedWithSet.has(p.id),
      })),
    });
  }

  // includeStats=true: also return lastMatchDate and winPct
  const players = await prisma.player.findMany({
    where,
    select: {
      id: true,
      displayName: true,
      rating: true,
      claimed: true,
      optOutPredictions: true,
      winPct: true,
      _count: { select: { matchParticipants: true } },
      matchParticipants: {
        select: { match: { select: { matchDate: true } } },
        orderBy: { match: { matchDate: "desc" } },
        take: 1,
      },
    },
    orderBy: { displayName: "asc" },
    take: 10,
  });

  const playerIds = players.map((p) => p.id);
  const playedWithSet = await getPlayedWithSet(myPlayerId, playerIds);

  const enriched = players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    rating: p.rating,
    claimed: p.claimed,
    optOutPredictions: p.optOutPredictions,
    matchCount: p._count.matchParticipants,
    lastMatchDate: p.matchParticipants[0]?.match.matchDate.toISOString() ?? null,
    winPct: p.winPct ?? null,
    playedWithMe: playedWithSet.has(p.id),
  }));

  return NextResponse.json({ players: enriched });
}

async function getPlayedWithSet(
  myPlayerId: string | null,
  targetPlayerIds: string[],
): Promise<Set<string>> {
  if (!myPlayerId || targetPlayerIds.length === 0) return new Set();

  // Find all matches the current user's player participated in
  const myMatchIds = await prisma.matchParticipant.findMany({
    where: { playerId: myPlayerId, match: { voidedAt: null } },
    select: { matchId: true },
  });
  const matchIdSet = new Set(myMatchIds.map((m) => m.matchId));
  if (matchIdSet.size === 0) return new Set();

  // Find which target players share any of those matches
  const sharedParticipants = await prisma.matchParticipant.findMany({
    where: {
      playerId: { in: targetPlayerIds },
      matchId: { in: Array.from(matchIdSet) },
    },
    select: { playerId: true },
  });
  return new Set(sharedParticipants.map((p) => p.playerId));
}
