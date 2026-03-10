import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/admin/players?q=&page=
// Admin: list players with optional displayName search. Protected by middleware.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const filter = searchParams.get("filter");

  // Orphaned filter: unclaimed shadows with zero match history
  if (filter === "orphaned") {
    const players = await prisma.player.findMany({
      where: {
        userId: null,
        claimed: false,
        deletedAt: null,
        matchParticipants: { none: {} },
      },
      select: {
        id: true,
        displayName: true,
        rating: true,
        ratingConfidence: true,
        claimed: true,
        trustTier: true,
        userId: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { matchParticipants: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      players: players.map((p) => ({ ...p, matchCount: p._count.matchParticipants })),
      pagination: { page: 1, pageSize: players.length, total: players.length },
    });
  }

  const where = q
    ? { displayName: { contains: q, mode: "insensitive" as const }, deletedAt: null }
    : { deletedAt: null };

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        rating: true,
        ratingConfidence: true,
        claimed: true,
        trustTier: true,
        userId: true,
        deletedAt: true,
        createdAt: true,
      },
      orderBy: { displayName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.player.count({ where }),
  ]);

  return NextResponse.json({
    players,
    pagination: { page, pageSize: PAGE_SIZE, total },
  });
}
