import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/admin/players/merge
// Admin: merge two player profiles. All of mergeId's history moves to keepId.
// Protected by middleware (admin only).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { keepId?: string; mergeId?: string };
  try {
    body = (await req.json()) as { keepId?: string; mergeId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { keepId, mergeId } = body;
  if (!keepId || !mergeId) {
    return NextResponse.json(
      { error: "keepId and mergeId are required" },
      { status: 400 },
    );
  }
  if (keepId === mergeId) {
    return NextResponse.json(
      { error: "keepId and mergeId must be different players" },
      { status: 400 },
    );
  }

  const [keepPlayer, mergePlayer] = await Promise.all([
    prisma.player.findUnique({ where: { id: keepId } }),
    prisma.player.findUnique({ where: { id: mergeId } }),
  ]);

  if (!keepPlayer) {
    return NextResponse.json({ error: "keepId player not found" }, { status: 404 });
  }
  if (!mergePlayer) {
    return NextResponse.json({ error: "mergeId player not found" }, { status: 404 });
  }
  if (mergePlayer.deletedAt) {
    return NextResponse.json(
      { error: "mergeId player is already deleted" },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    // Reassign all MatchParticipant records from mergeId → keepId
    await tx.matchParticipant.updateMany({
      where: { playerId: mergeId },
      data: { playerId: keepId },
    });

    // Reassign all RatingSnapshot records
    await tx.ratingSnapshot.updateMany({
      where: { playerId: mergeId },
      data: { playerId: keepId },
    });

    // Soft-delete the merged player
    await tx.player.update({
      where: { id: mergeId },
      data: { deletedAt: new Date() },
    });
  });

  await writeAuditEvent(
    {
      entityType: "Player",
      entityId: keepId,
      actionType: "merge_player",
      adminUserId: session.user.id,
      metadata: { keepId, mergeId, mergeDisplayName: mergePlayer.displayName },
    },
    prisma,
  );

  return NextResponse.json({ ok: true, keepId, mergeId });
}
