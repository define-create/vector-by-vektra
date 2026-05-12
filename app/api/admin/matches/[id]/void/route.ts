import { type NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";
import { runRecompute } from "@/lib/services/recompute";

// ---------------------------------------------------------------------------
// POST /api/admin/matches/[id]/void
// Admin: soft-void a match. Protected by middleware (admin only).
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  // Middleware already enforces admin — this is defense in depth
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    select: { id: true, voidedAt: true, tag: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.voidedAt) {
    return NextResponse.json({ error: "Match is already voided" }, { status: 409 });
  }

  const updated = await prisma.match.update({
    where: { id },
    data: { voidedAt: new Date() },
  });

  await writeAuditEvent(
    {
      entityType: "Match",
      entityId: id,
      actionType: "void_match",
      adminUserId: session.user.id,
    },
    prisma,
  );

  // Trigger full recompute after void — void changes the replay from that match forward.
  // Failure must not affect the void response; errors are logged server-side.
  let ratingsDeferred = false;
  try {
    const result = await runRecompute("admin", "auto: match void");
    ratingsDeferred = result.ratingsDeferred ?? false;
  } catch (err) {
    console.error(`[POST /api/admin/matches/${id}/void] Recompute failed:`, err);
  }

  revalidateTag("command-data", "default");
  if (match.tag) {
    revalidateTag("event", "default");
  }

  return NextResponse.json({ ok: true, match: updated, ratingsDeferred });
}
