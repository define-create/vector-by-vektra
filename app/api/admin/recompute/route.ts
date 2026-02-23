import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  replayAllMatches,
  computeRatingConfidence,
  computeRatingVolatility,
  type MatchRecord,
} from "@/lib/rating-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTeam1Won(games: { team1Score: number; team2Score: number }[]): boolean {
  let w1 = 0;
  let w2 = 0;
  for (const g of games) {
    if (g.team1Score > g.team2Score) w1++;
    else if (g.team2Score > g.team1Score) w2++;
  }
  return w1 > w2;
}

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

  // (d) Create RatingRun record
  const run = await prisma.ratingRun.create({
    data: {
      runType,
      status: "running",
      notes: body.notes ?? null,
    },
  });

  try {
    // (e) AuditEvent for admin triggers
    if (runType === "admin" && session?.user?.id) {
      await prisma.auditEvent.create({
        data: {
          entityType: "RatingRun",
          entityId: run.id,
          actionType: "trigger_recompute",
          adminUserId: session.user.id,
          metadata: { notes: body.notes, runId: run.id },
        },
      });
    }

    // (f) Fetch all non-voided matches with participants and game scores
    const matches = await prisma.match.findMany({
      where: { voidedAt: null },
      include: {
        participants: { select: { playerId: true, team: true } },
        games: { select: { team1Score: true, team2Score: true } },
      },
      orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }],
    });

    const matchRecords: MatchRecord[] = matches.map((m) => ({
      matchId: m.id,
      matchDate: m.matchDate,
      createdAt: m.createdAt,
      team1PlayerIds: m.participants.filter((p) => p.team === 1).map((p) => p.playerId),
      team2PlayerIds: m.participants.filter((p) => p.team === 2).map((p) => p.playerId),
      team1Won: computeTeam1Won(m.games),
    }));

    // Run the full replay
    const { snapshots, finalRatings } = replayAllMatches(matchRecords, run.id);

    // (g) Bulk-insert all RatingSnapshot records
    await prisma.ratingSnapshot.createMany({
      data: snapshots.map((s) => ({
        runId: s.runId,
        playerId: s.playerId,
        matchId: s.matchId,
        matchDate: s.matchDate,
        rating: s.rating,
        effectiveK: s.effectiveK,
        expectedScore: s.expectedScore,
      })),
    });

    // (h) Compute confidence and volatility, then update all players in a transaction
    const allPlayerIds = [...finalRatings.keys()];

    const playerUpdates = allPlayerIds.map((playerId) => {
      const rating = finalRatings.get(playerId)!;
      const ratingConfidence = computeRatingConfidence(playerId, matchRecords, snapshots);
      const ratingVolatility = computeRatingVolatility(playerId, snapshots);
      return prisma.player.update({
        where: { id: playerId },
        data: { rating, ratingConfidence, ratingVolatility },
      });
    });

    await prisma.$transaction(playerUpdates);

    // (i) Mark run as succeeded
    await prisma.ratingRun.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });

    return NextResponse.json(
      {
        ok: true,
        runId: run.id,
        matchesReplayed: matchRecords.length,
        snapshotsWritten: snapshots.length,
        playersUpdated: allPlayerIds.length,
      },
      { status: 200 },
    );
  } catch (error) {
    // (j) On any error: mark run as failed
    await prisma.ratingRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date() },
    }).catch(() => {
      // Ignore secondary failure — original error is more important
    });

    console.error("[recompute] Error during rating run:", error);
    return NextResponse.json({ error: "Recompute failed" }, { status: 500 });
  }
}
