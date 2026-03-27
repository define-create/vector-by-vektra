import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/admin/players/duplicates
// Returns groups of shadow profiles sharing the same displayName (case-insensitive).
// Only groups with 2+ members are returned.
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all active shadow profiles with match counts
  const shadows = await prisma.player.findMany({
    where: {
      userId: null,
      claimed: false,
      deletedAt: null,
    },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      _count: { select: { matchParticipants: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by lowercase displayName in JS
  const grouped = new Map<string, typeof shadows>();
  for (const p of shadows) {
    const key = p.displayName.toLowerCase().trim().replace(/\s+/g, " ");
    const existing = grouped.get(key) ?? [];
    existing.push(p);
    grouped.set(key, existing);
  }

  // Keep only groups with duplicates
  const groups = [...grouped.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      displayName: g[0]!.displayName,
      players: g.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        createdAt: p.createdAt.toISOString(),
        matchCount: p._count.matchParticipants,
      })),
    }));

  return NextResponse.json({ groups });
}
