import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// PATCH /api/admin/players/[id]
// Admin: edit player identity fields. Protected by middleware (admin only).
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { displayName?: string };
  try {
    body = (await req.json()) as { displayName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { displayName } = body;
  if (!displayName || displayName.trim().length === 0) {
    return NextResponse.json(
      { error: "displayName is required" },
      { status: 400 },
    );
  }

  const player = await prisma.player.findUnique({ where: { id } });
  if (!player || player.deletedAt) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const before = { displayName: player.displayName };
  const after = { displayName: displayName.trim() };

  const updated = await prisma.player.update({
    where: { id },
    data: { displayName: after.displayName },
  });

  await writeAuditEvent(
    {
      entityType: "Player",
      entityId: id,
      actionType: "edit_player_identity",
      adminUserId: session.user.id,
      metadata: { before, after },
    },
    prisma,
  );

  return NextResponse.json({ ok: true, player: updated });
}
