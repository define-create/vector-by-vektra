import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/admin/players/[id]/link
// Admin: link an unclaimed shadow profile to an existing user account.
// Protected by session check (admin only).
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { userId } = body as Record<string, string>;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const player = await prisma.player.findUnique({ where: { id } });

    if (!player || player.deletedAt) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (player.userId !== null) {
      return NextResponse.json({ error: "Player is already claimed" }, { status: 409 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { player: { select: { id: true, deletedAt: true } } },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (targetUser.player && targetUser.player.deletedAt === null) {
      return NextResponse.json({ error: "User already has an active player profile" }, { status: 409 });
    }

    await prisma.player.update({
      where: { id },
      data: {
        userId,
        claimed: true,
        claimedAt: new Date(),
        trustTier: "verified_email",
      },
    });

    await writeAuditEvent(
      {
        entityType: "Player",
        entityId: id,
        actionType: "claim_profile",
        adminUserId: session.user.id,
        metadata: { linkedByAdmin: true, linkedUserId: userId },
      },
      prisma,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/admin/players/[id]/link] Error:", error);
    return NextResponse.json({ error: "Failed to link profile" }, { status: 500 });
  }
}
