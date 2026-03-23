import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";
import { sendInviteClaimedEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// POST /api/invite/[token]/claim
// Authenticated — claims the shadow player via invite token.
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const invite = await prisma.inviteToken.findUnique({
      where: { tokenHash },
      include: {
        player: true,
        invitedBy: true,
      },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
    }

    // Validate token
    if (invite.claimedAt) {
      return NextResponse.json({ error: "This invite has already been used." }, { status: 409 });
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invite link has expired." }, { status: 400 });
    }

    // Validate shadow player is still unclaimed
    const shadowPlayer = invite.player;
    if (shadowPlayer.userId !== null || shadowPlayer.claimed) {
      return NextResponse.json(
        { error: "This profile has already been claimed." },
        { status: 409 },
      );
    }

    // Check current user doesn't already have a player
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { player: true },
    });
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (currentUser.player && !currentUser.player.deletedAt) {
      return NextResponse.json(
        { error: "You already have a profile linked to your account." },
        { status: 409 },
      );
    }

    // Claim the shadow player
    await prisma.player.update({
      where: { id: shadowPlayer.id },
      data: {
        userId: session.user.id,
        claimed: true,
        claimedAt: new Date(),
        trustTier: "verified_email",
      },
    });

    // Mark the invite token as claimed
    await prisma.inviteToken.update({
      where: { id: invite.id },
      data: {
        claimedAt: new Date(),
        claimedByUserId: session.user.id,
      },
    });

    // Write audit event
    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: shadowPlayer.id,
        actionType: "claim_via_invite",
        adminUserId: undefined,
        metadata: { claimedByUserId: session.user.id, inviteTokenId: invite.id },
      },
      prisma,
    );

    // Notify inviter (fire-and-forget)
    sendInviteClaimedEmail(
      invite.invitedBy.email,
      invite.invitedBy.displayName,
      shadowPlayer.displayName,
    ).catch((err) => console.error("[claim invite] Failed to send claimed email:", err));

    revalidateTag("command", "default");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/invite/[token]/claim] Error:", error);
    return NextResponse.json({ error: "Failed to claim profile" }, { status: 500 });
  }
}
