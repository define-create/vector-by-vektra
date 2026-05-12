import { type NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMatchFingerprint } from "@/lib/services/matchFingerprint";
import { runRecompute } from "@/lib/services/recompute";

// ---------------------------------------------------------------------------
// PATCH /api/matches/[id]
// ---------------------------------------------------------------------------

interface GameUpdateInput {
  gameOrder: number;
  team1Score: number;
  team2Score: number;
}

interface PatchMatchBody {
  games?: GameUpdateInput[];
  tag?: string; // optional event/league label update
  force?: boolean; // bypass duplicate check
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: PatchMatchBody;
  try {
    body = (await req.json()) as PatchMatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate: at least games or tag must be present
  const hasGames = Array.isArray(body.games) && body.games.length > 0;
  const hasTag = typeof body.tag === "string";
  if (!hasGames && !hasTag) {
    return NextResponse.json(
      { error: "At least one game or a tag update is required" },
      { status: 400 },
    );
  }
  if (hasGames) {
    for (const g of body.games!) {
      if (
        typeof g.gameOrder !== "number" ||
        typeof g.team1Score !== "number" ||
        typeof g.team2Score !== "number"
      ) {
        return NextResponse.json(
          { error: "Each game must have gameOrder, team1Score, team2Score (numbers)" },
          { status: 400 },
        );
      }
    }
  }

  try {
    const match = await prisma.match.findUnique({
      where: { id },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Verify the match belongs to the session user
    if (match.enteredByUserId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Enforce 20-minute edit window
    const editExpiresAt = new Date(match.createdAt.getTime() + 20 * 60 * 1000);
    if (new Date() > editExpiresAt) {
      return NextResponse.json(
        { error: "Match is locked — 20-minute edit window has expired" },
        { status: 403 },
      );
    }

    // Sanitize tag
    const tagValue = hasTag ? (body.tag!.trim().replace(/\s+/g, " ") || null) : undefined;

    // ---------------------------------------------------------------------------
    // Fingerprint recompute on score edit
    // ---------------------------------------------------------------------------
    // undefined = don't touch; null = clear; string = new value
    let updatedFingerprint: string | null | undefined = undefined;

    if (hasGames && !body.force) {
      const participants = await prisma.matchParticipant.findMany({
        where: { matchId: id },
        orderBy: { team: "asc" },
      });
      const team1 = participants.filter((p) => p.team === 1).map((p) => p.playerId);
      const team2 = participants.filter((p) => p.team === 2).map((p) => p.playerId);

      const newFingerprint = computeMatchFingerprint(
        [team1[0]!, team1[1]!],
        [team2[0]!, team2[1]!],
        new Date(match.matchDate),
        body.games!
      );

      const collision = await prisma.match.findFirst({
        where: { fingerprint: newFingerprint, voidedAt: null, id: { not: id } },
      });

      if (collision) {
        return NextResponse.json(
          { error: "duplicate_match", existingMatchId: collision.id },
          { status: 409 }
        );
      }
      updatedFingerprint = newFingerprint;
    } else if (hasGames && body.force) {
      updatedFingerprint = null;
    }

    // Update games and/or tag in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      if (hasGames) {
        await tx.game.deleteMany({ where: { matchId: id } });
        await tx.game.createMany({
          data: body.games!.map((g) => ({
            matchId: id,
            gameOrder: g.gameOrder,
            team1Score: g.team1Score,
            team2Score: g.team2Score,
          })),
        });
      }

      // Update tag and/or fingerprint if changed
      if (hasTag || updatedFingerprint !== undefined) {
        await tx.match.update({
          where: { id },
          data: {
            ...(hasTag && { tag: tagValue }),
            ...(updatedFingerprint !== undefined && { fingerprint: updatedFingerprint }),
          },
        });
      }

      return tx.match.findUnique({
        where: { id },
        include: {
          games: { orderBy: { gameOrder: "asc" } },
        },
      });
    });

    const recomputeResult = await runRecompute("admin", "auto: score edit", match.matchDate);
    revalidateTag("command-data", "default");

    return NextResponse.json({
      ok: true,
      ratingsDeferred: recomputeResult.ratingsDeferred ?? false,
      match: {
        id: updated!.id,
        matchDate: updated!.matchDate,
        createdAt: updated!.createdAt,
        editExpiresAt,
        games: updated!.games,
      },
    });
  } catch (error) {
    console.error("[PATCH /api/matches/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
