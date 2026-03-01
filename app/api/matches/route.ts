import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOrCreateShadowPlayer } from "@/lib/services/players";
import { runRecompute } from "@/lib/services/recompute";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GameInput {
  gameOrder: number;
  team1Score: number;
  team2Score: number;
}

interface CreateMatchBody {
  matchDate: string; // ISO datetime string
  adminMode?: boolean; // when true, admin is entering on behalf of all players
  team1Player1Id?: string; // admin mode: explicit team 1 player 1
  team1Player1Name?: string; // admin mode: explicit team 1 player 1 (shadow)
  partnerId?: string;
  partnerName?: string;
  opponent1Id?: string;
  opponent1Name?: string;
  opponent2Id?: string;
  opponent2Name?: string;
  outcome: "win" | "loss"; // team 1's perspective
  games: GameInput[];
  tag?: string; // optional event/league label
}

// ---------------------------------------------------------------------------
// POST /api/matches
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateMatchBody;
  try {
    body = (await req.json()) as CreateMatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate matchDate
  const matchDate = new Date(body.matchDate);
  if (isNaN(matchDate.getTime())) {
    return NextResponse.json({ error: "Invalid matchDate" }, { status: 400 });
  }

  // Admin mode: validate team1Player1
  if (body.adminMode && !body.team1Player1Id && !body.team1Player1Name) {
    return NextResponse.json(
      { error: "team1Player1Id or team1Player1Name is required in admin mode" },
      { status: 400 },
    );
  }

  // Validate partner
  if (!body.partnerId && !body.partnerName) {
    return NextResponse.json(
      { error: "Partner is required (partnerId or partnerName)" },
      { status: 400 },
    );
  }

  // Validate opponents
  if (!body.opponent1Id && !body.opponent1Name) {
    return NextResponse.json(
      { error: "Opponent 1 is required (opponent1Id or opponent1Name)" },
      { status: 400 },
    );
  }
  if (!body.opponent2Id && !body.opponent2Name) {
    return NextResponse.json(
      { error: "Opponent 2 is required (opponent2Id or opponent2Name)" },
      { status: 400 },
    );
  }

  // Validate outcome
  if (body.outcome !== "win" && body.outcome !== "loss") {
    return NextResponse.json(
      { error: "outcome must be 'win' or 'loss'" },
      { status: 400 },
    );
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
    // ---------------------------------------------------------------------------
    // Resolve Team 1 Player 1
    // ---------------------------------------------------------------------------
    let team1P1;

    if (body.adminMode) {
      // Admin mode: explicit player provided — skip session user resolution
      if (body.team1Player1Id) {
        team1P1 = await prisma.player.findUnique({ where: { id: body.team1Player1Id } });
        if (!team1P1) {
          return NextResponse.json({ error: "Team 1 Player 1 not found" }, { status: 404 });
        }
      } else {
        team1P1 = await findOrCreateShadowPlayer(body.team1Player1Name!, prisma);
      }
    } else {
      // Normal mode: session user is team 1 player 1 (auto-created if no player record)
      const userRecord = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { player: true },
      });
      if (!userRecord) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      let myPlayer = userRecord.player;
      if (!myPlayer) {
        myPlayer = await prisma.player.create({
          data: {
            userId: session.user.id,
            displayName: userRecord.displayName,
            claimed: true,
            claimedAt: new Date(),
            trustTier: userRecord.emailVerifiedAt ? "verified_email" : "unverified",
            rating: 1000,
          },
        });
      }
      team1P1 = myPlayer;
    }

    // Resolve partner (team 1 player 2)
    let partnerPlayer;
    if (body.partnerId) {
      partnerPlayer = await prisma.player.findUnique({
        where: { id: body.partnerId },
      });
      if (!partnerPlayer) {
        return NextResponse.json(
          { error: "Partner player not found" },
          { status: 404 },
        );
      }
    } else {
      partnerPlayer = await findOrCreateShadowPlayer(body.partnerName!, prisma);
    }

    // Resolve opponents
    let opp1Player;
    if (body.opponent1Id) {
      opp1Player = await prisma.player.findUnique({
        where: { id: body.opponent1Id },
      });
      if (!opp1Player) {
        return NextResponse.json(
          { error: "Opponent 1 player not found" },
          { status: 404 },
        );
      }
    } else {
      opp1Player = await findOrCreateShadowPlayer(body.opponent1Name!, prisma);
    }

    let opp2Player;
    if (body.opponent2Id) {
      opp2Player = await prisma.player.findUnique({
        where: { id: body.opponent2Id },
      });
      if (!opp2Player) {
        return NextResponse.json(
          { error: "Opponent 2 player not found" },
          { status: 404 },
        );
      }
    } else {
      opp2Player = await findOrCreateShadowPlayer(body.opponent2Name!, prisma);
    }

    // Guard: all four players must be distinct
    const playerIds = [team1P1.id, partnerPlayer.id, opp1Player.id, opp2Player.id];
    if (new Set(playerIds).size !== 4) {
      return NextResponse.json(
        { error: "All four players in a match must be distinct" },
        { status: 400 },
      );
    }

    // Sanitize tag
    const tag = typeof body.tag === "string" ? body.tag.trim() || null : null;

    // Create match + participants + games in a transaction
    const match = await prisma.$transaction(async (tx) => {
      const created = await tx.match.create({
        data: {
          enteredByUserId: session.user.id,
          matchDate,
          tag,
          dataSource: "manual",
        },
      });

      // Team 1: player 1 + partner
      await tx.matchParticipant.createMany({
        data: [
          { matchId: created.id, playerId: team1P1.id, team: 1 },
          { matchId: created.id, playerId: partnerPlayer.id, team: 1 },
        ],
      });

      // Team 2: two opponents
      await tx.matchParticipant.createMany({
        data: [
          { matchId: created.id, playerId: opp1Player.id, team: 2 },
          { matchId: created.id, playerId: opp2Player.id, team: 2 },
        ],
      });

      // Games
      await tx.game.createMany({
        data: body.games.map((g) => ({
          matchId: created.id,
          gameOrder: g.gameOrder,
          team1Score: g.team1Score,
          team2Score: g.team2Score,
        })),
      });

      return created;
    });

    const editExpiresAt = new Date(match.createdAt.getTime() + 60 * 60 * 1000);

    // Trigger a full rating recompute so Player.rating reflects the new match immediately.
    // If recompute fails the match is still created; we log and surface ratingUpdated=false.
    let ratingUpdated = false;
    try {
      await runRecompute("nightly");
      ratingUpdated = true;
      revalidatePath("/command");
    } catch (recomputeErr) {
      console.error("[POST /api/matches] Post-match recompute failed:", recomputeErr);
    }

    return NextResponse.json(
      {
        ok: true,
        match: {
          id: match.id,
          matchDate: match.matchDate,
          createdAt: match.createdAt,
          editExpiresAt,
        },
        ratingUpdated,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/matches] Error:", error);
    return NextResponse.json({ error: "Failed to create match" }, { status: 500 });
  }
}
