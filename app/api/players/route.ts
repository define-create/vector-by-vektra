import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/players — create a fresh player profile linked to the current user
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
        { error: "Email verification required to create a profile" },
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

    const body = await req.json() as { displayName?: unknown };
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }

    const player = await prisma.player.create({
      data: {
        userId: session.user.id,
        displayName,
        claimed: true,
        claimedAt: new Date(),
        trustTier: "verified_email",
        rating: 1000,
      },
    });

    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: player.id,
        actionType: "claim_profile",
        metadata: { createdByUserId: session.user.id, type: "fresh_profile" },
      },
      prisma,
    );

    return NextResponse.json({ ok: true, player }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/players] Error:", error);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}
