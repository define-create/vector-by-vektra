import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runRecompute } from "@/lib/services/recompute";

// ---------------------------------------------------------------------------
// POST /api/admin/recompute
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // (a) Authenticate — accept either a valid admin session OR a CRON_SECRET header.
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin";

  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isAdmin && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (b) Parse body
  let body: { runType?: string; notes?: string } = {};
  try {
    body = (await req.json()) as { runType?: string; notes?: string };
  } catch {
    // Empty body is fine for nightly cron calls
  }

  const runType: "nightly" | "admin" = body.runType === "admin" ? "admin" : "nightly";

  // (c) Admin-trigger guards
  if (runType === "admin") {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "An active admin session is required for admin-triggered recomputes" },
        { status: 403 },
      );
    }

    // Concurrency lock — reject if a run is already in progress
    const running = await prisma.ratingRun.findFirst({ where: { status: "running" } });
    if (running) {
      return NextResponse.json({ error: "Recompute already running" }, { status: 409 });
    }

    // 10-minute cooldown (admin-triggered runs only)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentAdminRun = await prisma.ratingRun.findFirst({
      where: { runType: "admin", startedAt: { gt: tenMinAgo } },
      orderBy: { startedAt: "desc" },
    });
    if (recentAdminRun) {
      return NextResponse.json(
        { error: "Cooldown: wait 10 minutes between admin recomputes" },
        { status: 429 },
      );
    }

    // Notes required for admin runs
    if (!body.notes || body.notes.trim().length === 0) {
      return NextResponse.json(
        { error: "notes is required for admin-triggered recomputes" },
        { status: 400 },
      );
    }
    if (body.notes.length > 120) {
      return NextResponse.json(
        { error: "notes must be 120 characters or fewer" },
        { status: 400 },
      );
    }
  }

  // (d) Audit event for admin triggers (before run, so we have session context)
  let auditUserId: string | undefined;
  if (runType === "admin" && session?.user?.id) {
    auditUserId = session.user.id;
  }

  try {
    const result = await runRecompute(runType, body.notes);

    // Audit event recorded after successful run
    if (auditUserId) {
      await prisma.auditEvent.create({
        data: {
          entityType: "RatingRun",
          entityId: result.runId,
          actionType: "trigger_recompute",
          adminUserId: auditUserId,
          metadata: { notes: body.notes, runId: result.runId },
        },
      });
    }

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    console.error("[recompute] Error during rating run:", error);
    return NextResponse.json({ error: "Recompute failed" }, { status: 500 });
  }
}
