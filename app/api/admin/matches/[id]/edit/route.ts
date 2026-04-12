import { type NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";
import { runRecompute } from "@/lib/services/recompute";
import { computeMatchFingerprint } from "@/lib/services/matchFingerprint";

// ---------------------------------------------------------------------------
// POST /api/admin/matches/[id]/edit
// Admin: atomically void the original match and create a replacement.
// Protected by middleware (admin only).
// ---------------------------------------------------------------------------

interface EditMatchBody {
  team1: [string, string];
  team2: [string, string];
  games: { gameOrder: number; team1Score: number; team2Score: number }[];
  tag?: string | null;
  matchDate: string; // ISO date string e.g. "2026-04-11"
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Fetch original match
  const original = await prisma.match.findUnique({
    where: { id },
    select: { id: true, voidedAt: true, matchDate: true, tag: true },
  });
  if (!original) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (original.voidedAt) {
    return NextResponse.json({ error: "Match is already voided" }, { status: 409 });
  }

  // Parse + validate body
  let body: EditMatchBody;
  try {
    body = (await req.json()) as EditMatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { team1, team2, games, tag, matchDate } = body;

  if (
    !Array.isArray(team1) || team1.length !== 2 ||
    !Array.isArray(team2) || team2.length !== 2 ||
    !Array.isArray(games) || games.length === 0 ||
    !matchDate
  ) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const allPlayerIds = [...team1, ...team2];
  if (new Set(allPlayerIds).size !== 4) {
    return NextResponse.json({ error: "All four player slots must be unique" }, { status: 400 });
  }

  // Parse matchDate — treat as local noon to avoid UTC day boundary shifts
  const newMatchDate = new Date(`${matchDate}T12:00:00.000Z`);
  if (isNaN(newMatchDate.getTime())) {
    return NextResponse.json({ error: "Invalid matchDate" }, { status: 400 });
  }

  // Compute fingerprint for the new match (fingerprint check is skipped for admin edits)
  const fingerprint = computeMatchFingerprint(
    team1,
    team2,
    newMatchDate,
    games,
  );

  // Atomic transaction: void original + create replacement
  let newMatch: { id: string };
  try {
    newMatch = await prisma.$transaction(async (tx) => {
      // 1. Void the original
      await tx.match.update({
        where: { id },
        data: { voidedAt: new Date() },
      });

      // 2. Create the replacement match
      const created = await tx.match.create({
        data: {
          enteredByUserId: session.user.id,
          matchDate: newMatchDate,
          tag: tag?.trim() || null,
          fingerprint,
          replacesMatchId: id,
          participants: {
            create: [
              { playerId: team1[0], team: 1 },
              { playerId: team1[1], team: 1 },
              { playerId: team2[0], team: 2 },
              { playerId: team2[1], team: 2 },
            ],
          },
          games: {
            create: games.map((g) => ({
              gameOrder: g.gameOrder,
              team1Score: g.team1Score,
              team2Score: g.team2Score,
            })),
          },
        },
        select: { id: true },
      });

      return created;
    });
  } catch (err) {
    console.error(`[POST /api/admin/matches/${id}/edit] Transaction failed:`, err);
    return NextResponse.json({ error: "Failed to save edit — no changes were made" }, { status: 500 });
  }

  // Audit event (outside transaction — immutable, best-effort)
  await writeAuditEvent(
    {
      entityType: "Match",
      entityId: id,
      actionType: "edit_match",
      adminUserId: session.user.id,
      metadata: { replacementMatchId: newMatch.id, matchDate, tag: tag ?? null },
    },
    prisma,
  ).catch((err) => {
    console.error(`[POST /api/admin/matches/${id}/edit] Audit write failed:`, err);
  });

  // Recompute from the earlier of original and new match dates
  const fromDate = original.matchDate < newMatchDate ? original.matchDate : newMatchDate;
  let ratingsDeferred = false;
  try {
    const result = await runRecompute("admin", `auto: match edit (replaced ${id})`, fromDate);
    ratingsDeferred = result.ratingsDeferred ?? false;
  } catch (err) {
    console.error(`[POST /api/admin/matches/${id}/edit] Recompute failed:`, err);
    // Recompute failure does NOT roll back the edit — data is consistent, ratings will drift
    // until the next nightly recompute or manual admin recompute.
  }

  revalidateTag("command", "default");
  if (original.tag || tag) {
    revalidateTag("event", "default");
  }

  return NextResponse.json({ ok: true, newMatchId: newMatch.id, ratingsDeferred });
}
