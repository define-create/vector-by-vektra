import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// PATCH /api/players/me/display-name
// Authenticated user: change their own player's display name.
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const player = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
  });

  if (!player) {
    return NextResponse.json({ error: "No linked player found" }, { status: 404 });
  }

  let body: { displayName?: unknown };
  try {
    body = (await req.json()) as { displayName?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { displayName } = body;
  if (typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json(
      { error: "displayName must be a non-empty string" },
      { status: 400 },
    );
  }

  const trimmed = displayName.trim();

  if (trimmed.length > 50) {
    return NextResponse.json(
      { error: "displayName must be 50 characters or fewer" },
      { status: 400 },
    );
  }

  if (trimmed === player.displayName) {
    return NextResponse.json({ error: "Display name is unchanged" }, { status: 400 });
  }

  await prisma.player.update({
    where: { id: player.id },
    data: { displayName: trimmed },
  });

  await writeAuditEvent(
    {
      entityType: "Player",
      entityId: player.id,
      actionType: "edit_player_identity",
      metadata: {
        before: { displayName: player.displayName },
        after: { displayName: trimmed },
        source: "self_service",
      },
    },
    prisma,
  );

  return NextResponse.json({ ok: true, displayName: trimmed });
}
