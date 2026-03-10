import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/admin/players/bulk-delete
// Admin: soft-delete multiple orphaned shadow profiles (no match history).
// Protected by middleware (admin only).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of up to 200 strings" },
      { status: 400 },
    );
  }
  if (!ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "All ids must be strings" }, { status: 400 });
  }

  // Server-side validation: every ID must be an unclaimed shadow with zero matches
  const players = await prisma.player.findMany({
    where: { id: { in: ids as string[] } },
    select: {
      id: true,
      displayName: true,
      claimed: true,
      userId: true,
      deletedAt: true,
      _count: { select: { matchParticipants: true } },
    },
  });

  const found = new Map(players.map((p) => [p.id, p]));

  for (const id of ids as string[]) {
    const p = found.get(id);
    if (!p) {
      return NextResponse.json({ error: `Player ${id} not found` }, { status: 404 });
    }
    if (p.deletedAt) {
      return NextResponse.json(
        { error: `Player ${id} is already deleted` },
        { status: 409 },
      );
    }
    if (p.claimed || p.userId !== null) {
      return NextResponse.json(
        { error: `Player ${id} is claimed and cannot be bulk-deleted` },
        { status: 409 },
      );
    }
    if (p._count.matchParticipants > 0) {
      return NextResponse.json(
        { error: `Player ${id} has match history and cannot be bulk-deleted` },
        { status: 409 },
      );
    }
  }

  const now = new Date();

  await prisma.player.updateMany({
    where: { id: { in: ids as string[] } },
    data: { deletedAt: now },
  });

  for (const id of ids as string[]) {
    const p = found.get(id)!;
    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: id,
        actionType: "delete_player",
        adminUserId: session.user.id,
        metadata: { displayName: p.displayName, reason: "orphaned_bulk_cleanup" },
      },
      prisma,
    );
  }

  return NextResponse.json({ ok: true, deleted: (ids as string[]).length });
}
