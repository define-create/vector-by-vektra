import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/admin/matches?q=&page=
// Admin: list matches with optional search. Protected by middleware (admin only).
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const matches = await prisma.match.findMany({
    where: q
      ? {
          participants: {
            some: {
              player: { displayName: { contains: q, mode: "insensitive" } },
            },
          },
        }
      : undefined,
    include: {
      participants: {
        include: { player: { select: { id: true, displayName: true } } },
      },
      games: { orderBy: { gameOrder: "asc" } },
      enteredBy: { select: { id: true, handle: true } },
    },
    orderBy: [{ matchDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const total = await prisma.match.count({
    where: q
      ? {
          participants: {
            some: {
              player: { displayName: { contains: q, mode: "insensitive" } },
            },
          },
        }
      : undefined,
  });

  return NextResponse.json({
    matches: matches.map((m) => ({
      id: m.id,
      matchDate: m.matchDate,
      createdAt: m.createdAt,
      voidedAt: m.voidedAt,
      dataSource: m.dataSource,
      enteredBy: m.enteredBy,
      team1: m.participants
        .filter((p) => p.team === 1)
        .map((p) => ({ id: p.player.id, displayName: p.player.displayName })),
      team2: m.participants
        .filter((p) => p.team === 2)
        .map((p) => ({ id: p.player.id, displayName: p.player.displayName })),
      games: m.games,
    })),
    pagination: { page, pageSize: PAGE_SIZE, total },
  });
}
