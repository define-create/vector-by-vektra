import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/admin/tags
// Returns all distinct tags with their match counts.
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.match.groupBy({
    by: ["tag"],
    where: { tag: { not: null }, voidedAt: null },
    _count: { id: true },
    orderBy: { tag: "asc" },
  });

  const tags = rows
    .filter((r) => r.tag !== null)
    .map((r) => ({ tag: r.tag as string, count: r._count.id }));

  return NextResponse.json({ tags });
}

// ---------------------------------------------------------------------------
// POST /api/admin/tags
// Body: { from: string; to: string }
// Renames all matches with tag `from` to tag `to`.
// If `to` already exists the two tags are effectively merged.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { from?: unknown; to?: unknown };
  const fromTag = typeof body.from === "string" ? body.from.trim() : "";
  const toTag = typeof body.to === "string" ? body.to.trim() : "";

  if (!fromTag || !toTag) {
    return NextResponse.json({ error: "Both 'from' and 'to' tags are required" }, { status: 400 });
  }
  if (fromTag === toTag) {
    return NextResponse.json({ error: "'from' and 'to' must be different" }, { status: 400 });
  }

  const { count } = await prisma.match.updateMany({
    where: { tag: fromTag, voidedAt: null },
    data: { tag: toTag },
  });

  await writeAuditEvent(
    {
      entityType: "Match",
      entityId: "bulk",
      actionType: "rename_tag",
      adminUserId: session.user.id,
      metadata: { from: fromTag, to: toTag, matchesUpdated: count },
    },
    prisma,
  );

  return NextResponse.json({ ok: true, matchesUpdated: count });
}
