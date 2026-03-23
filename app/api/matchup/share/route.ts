import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeWinProbability, computeMoneyline } from "@/lib/matchup";
import { computeMomentum } from "@/lib/metrics/momentum";
import { computeVolatilityBand } from "@/lib/metrics/volatility-band";

// ---------------------------------------------------------------------------
// Momentum label — same thresholds as ProjectionCard.tsx
// ---------------------------------------------------------------------------
function momentumLabel(n: number): string {
  if (n >= 15)  return "↑↑ Hot";
  if (n >= 5)   return "↑ Rising";
  if (n > -5)   return "→ Steady";
  if (n > -15)  return "↓ Fading";
  return "↓↓ Cold";
}

// ---------------------------------------------------------------------------
// POST /api/matchup/share
//
// Authenticated. Computes a matchup projection snapshot and stores it as a
// frozen record (so the share link shows the rating at share time, not live).
// Returns { token, url } where token is the raw 32-byte hex token.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse and validate body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { player1Id, player2Id, player3Id, player4Id } = body as Record<string, string>;
  if (!player1Id || !player2Id || !player3Id || !player4Id) {
    return NextResponse.json(
      { error: "Missing required fields: player1Id, player2Id, player3Id, player4Id" },
      { status: 400 },
    );
  }

  // -------------------------------------------------------------------------
  // Fetch all 4 players
  // -------------------------------------------------------------------------
  const players = await prisma.player.findMany({
    where: { id: { in: [player1Id, player2Id, player3Id, player4Id] }, deletedAt: null },
  });

  if (players.length !== 4) {
    const foundIds = new Set(players.map((p) => p.id));
    const missingId = [player1Id, player2Id, player3Id, player4Id].find((id) => !foundIds.has(id));
    return NextResponse.json({ error: `Player not found: ${missingId}` }, { status: 404 });
  }

  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const p1 = byId[player1Id]!;
  const p2 = byId[player2Id]!;
  const p3 = byId[player3Id]!;
  const p4 = byId[player4Id]!;

  // -------------------------------------------------------------------------
  // Compute projection
  // -------------------------------------------------------------------------
  const probability = computeWinProbability(p1.rating, p2.rating, p3.rating, p4.rating);
  const moneyline = computeMoneyline(probability);
  const ratingDiff = Math.round(((p1.rating + p2.rating) / 2 - (p3.rating + p4.rating) / 2) * 10) / 10;

  const volBand = computeVolatilityBand(
    probability,
    (p1.ratingConfidence + p2.ratingConfidence) / 2,
    (p3.ratingConfidence + p4.ratingConfidence) / 2,
    (p1.ratingVolatility + p2.ratingVolatility) / 2,
    (p3.ratingVolatility + p4.ratingVolatility) / 2,
  );
  const volatility = `±${Math.round(volBand.width * 100)}%`;

  const minConfidence = Math.min(
    p1.ratingConfidence, p2.ratingConfidence,
    p3.ratingConfidence, p4.ratingConfidence,
  );

  // Momentum: fetch p1 snapshots
  const p1Snapshots = await prisma.ratingSnapshot.findMany({
    where: { playerId: player1Id },
    select: { matchId: true, matchDate: true, rating: true, effectiveK: true, expectedScore: true, runId: true, playerId: true },
    orderBy: { matchDate: "asc" },
  });

  const momentumValue = computeMomentum(
    p1Snapshots.map((s) => ({ ...s, playerId: player1Id })),
  );
  const momentum = momentumLabel(momentumValue);

  // -------------------------------------------------------------------------
  // Build snapshot JSON — display names only, no IDs
  // -------------------------------------------------------------------------
  const snapshotJson = {
    probability,
    moneyline,
    ratingDiff,
    volatility,
    momentum,
    minConfidence,
    players: {
      p1Name: p1.displayName,
      p2Name: p2.displayName,
      p3Name: p3.displayName,
      p4Name: p4.displayName,
    },
  };

  // -------------------------------------------------------------------------
  // Generate token (raw = returned, hash = stored)
  // -------------------------------------------------------------------------
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await prisma.matchupShare.create({
    data: {
      tokenHash,
      createdByUserId: session.user.id,
      snapshotJson,
    },
  });

  return NextResponse.json({ token: rawToken, url: `/s/${rawToken}` });
}
