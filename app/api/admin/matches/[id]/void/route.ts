import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

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

  const match = await prisma.match.findUnique({ where: { id } });
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

  return NextResponse.json({ ok: true, match: updated });
}
