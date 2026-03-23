import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendInviteEmail } from "@/lib/email";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/invite
// Authenticated — creates an invite token for a shadow player.
// Returns { token, url }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { playerId, email } = body as { playerId?: string; email?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  try {
    // Look up the shadow player
    const targetPlayer = await prisma.player.findUnique({ where: { id: playerId } });
    if (!targetPlayer || targetPlayer.deletedAt) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (targetPlayer.userId !== null || targetPlayer.claimed) {
      return NextResponse.json(
        { error: "This player has already claimed their profile." },
        { status: 400 },
      );
    }

    // Verify the inviter has played with the shadow player
    const inviterUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { player: true },
    });
    if (!inviterUser?.player) {
      return NextResponse.json(
        { error: "You must have a player profile to send invites." },
        { status: 403 },
      );
    }

    // Find shared matches between inviter's player and the shadow player
    const sharedMatch = await prisma.matchParticipant.findFirst({
      where: {
        playerId: inviterUser.player.id,
        match: {
          voidedAt: null,
          participants: { some: { playerId } },
        },
      },
    });
    if (!sharedMatch) {
      return NextResponse.json(
        { error: "You must have played with this player to invite them." },
        { status: 403 },
      );
    }

    // Count shared matches for email context
    const matchCount = await prisma.matchParticipant.count({
      where: {
        playerId: inviterUser.player.id,
        match: {
          voidedAt: null,
          participants: { some: { playerId } },
        },
      },
    });

    // Generate token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.inviteToken.create({
      data: {
        tokenHash,
        playerId,
        invitedByUserId: session.user.id,
        invitedEmail: email ?? null,
        expiresAt,
      },
    });

    // Write audit event
    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: playerId,
        actionType: "send_invite",
        adminUserId: undefined,
        metadata: { invitedByUserId: session.user.id },
      },
      prisma,
    );

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const url = `/invite/${rawToken}`;

    // Optionally send email
    if (email) {
      try {
        await sendInviteEmail(
          email,
          inviterUser.displayName,
          targetPlayer.displayName,
          matchCount,
          `${baseUrl}${url}`,
        );
      } catch (err) {
        console.error("[POST /api/invite] Failed to send invite email:", err);
        // Don't fail the whole request if email fails
      }
    }

    return NextResponse.json({ token: rawToken, url });
  } catch (error) {
    console.error("[POST /api/invite] Error:", error);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
