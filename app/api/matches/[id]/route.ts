import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/matches/[id]
// ---------------------------------------------------------------------------

interface GameUpdateInput {
  gameOrder: number;
  team1Score: number;
  team2Score: number;
}

interface PatchMatchBody {
  games: GameUpdateInput[];
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

  // Validate games
  if (!Array.isArray(body.games) || body.games.length === 0) {
    return NextResponse.json(
      { error: "At least one game is required" },
      { status: 400 },
    );
  }
  for (const g of body.games) {
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

    // Enforce 60-minute edit window
    const editExpiresAt = new Date(match.createdAt.getTime() + 60 * 60 * 1000);
    if (new Date() > editExpiresAt) {
      return NextResponse.json(
        { error: "Match is locked — 60-minute edit window has expired" },
        { status: 403 },
      );
    }

    // Update game scores in a transaction (delete old games, insert new ones)
    const updated = await prisma.$transaction(async (tx) => {
      await tx.game.deleteMany({ where: { matchId: id } });

      await tx.game.createMany({
        data: body.games.map((g) => ({
          matchId: id,
          gameOrder: g.gameOrder,
          team1Score: g.team1Score,
          team2Score: g.team2Score,
        })),
      });

      return tx.match.findUnique({
        where: { id },
        include: {
          games: { orderBy: { gameOrder: "asc" } },
        },
      });
    });

    return NextResponse.json({
      ok: true,
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
