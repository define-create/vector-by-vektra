import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/admin/audit-events?page=
// Admin: read-only paginated audit log. Protected by middleware (admin only).
// NEVER expose update or delete endpoints for this table.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const page = Math.max(
    1,
    parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10),
  );

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        admin: { select: { id: true, handle: true } },
      },
    }),
    prisma.auditEvent.count(),
  ]);

  return NextResponse.json({
    events,
    pagination: { page, pageSize: PAGE_SIZE, total },
  });
}
