import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/admin/recompute/runs
// Admin: list the most recent 20 rating runs (for the recompute status page).
// Protected by middleware (admin only).
// ---------------------------------------------------------------------------

export async function GET() {
  const runs = await prisma.ratingRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ runs });
}
