import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeWinPct } from "@/lib/services/players";

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
        _count: { select: { matchParticipants: true } },
      },
      orderBy: { displayName: "asc" },
      take: 10,
    });

    return NextResponse.json({
      players: players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        rating: p.rating,
        claimed: p.claimed,
        matchCount: p._count.matchParticipants,
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

  const enriched = await Promise.all(
    players.map(async (p) => ({
      id: p.id,
      displayName: p.displayName,
      rating: p.rating,
      claimed: p.claimed,
      matchCount: p._count.matchParticipants,
      lastMatchDate: p.matchParticipants[0]?.match.matchDate.toISOString() ?? null,
      winPct: await computeWinPct(p.id, prisma),
    })),
  );

  return NextResponse.json({ players: enriched });
}
