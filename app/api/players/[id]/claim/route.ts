import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/players/[id]/claim
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: playerId } = await params;

  try {
    // Look up the requesting user (need emailVerifiedAt)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { player: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Email must be verified
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Email verification required to claim a profile" },
        { status: 403 },
      );
    }

    // User must not already have a player profile
    if (user.player) {
      return NextResponse.json(
        { error: "You already have a player profile" },
        { status: 409 },
      );
    }

    // Target player must exist and be unclaimed
    const targetPlayer = await prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!targetPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (targetPlayer.userId !== null) {
      return NextResponse.json(
        { error: "This profile has already been claimed" },
        { status: 409 },
      );
    }
    if (targetPlayer.deletedAt !== null) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 },
      );
    }

    // Claim the profile
    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        userId: session.user.id,
        claimed: true,
        claimedAt: new Date(),
        trustTier: "verified_email",
      },
    });

    // Write immutable audit event
    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: playerId,
        actionType: "claim_profile",
        adminUserId: undefined,
        metadata: { claimedByUserId: session.user.id },
      },
      prisma,
    );

    return NextResponse.json({ ok: true, player: updatedPlayer });
  } catch (error) {
    console.error("[POST /api/players/[id]/claim] Error:", error);
    return NextResponse.json({ error: "Failed to claim profile" }, { status: 500 });
  }
}
