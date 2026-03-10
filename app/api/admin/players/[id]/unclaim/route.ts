import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/admin/players/[id]/unclaim
// Admin: revert a claimed player profile back to unclaimed shadow state.
// Protected by middleware (admin only).
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const player = await prisma.player.findUnique({ where: { id } });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (player.deletedAt) {
      return NextResponse.json({ error: "Player is already deleted" }, { status: 409 });
    }
    if (!player.claimed || player.userId === null) {
      return NextResponse.json({ error: "Player is not claimed" }, { status: 409 });
    }

    const unclaimedUserId = player.userId;

    await prisma.player.update({
      where: { id },
      data: {
        userId: null,
        claimed: false,
        claimedAt: null,
        trustTier: "unverified",
      },
    });

    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: id,
        actionType: "unclaim_profile",
        adminUserId: session.user.id,
        metadata: { unclaimedUserId },
      },
      prisma,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/admin/players/[id]/unclaim] Error:", error);
    return NextResponse.json({ error: "Failed to unclaim profile" }, { status: 500 });
  }
}
