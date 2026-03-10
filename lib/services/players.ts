/**
 * Player service: shadow profile management and player stats.
 */

import { type PrismaClient } from "@/app/generated/prisma/client";

/**
 * Compute win percentage for a player across all non-voided matches.
 * Returns null if the player has fewer than 3 matches.
 */
export async function computeWinPct(
  playerId: string,
  prisma: PrismaClient,
): Promise<number | null> {
  const participations = await prisma.matchParticipant.findMany({
    where: {
      playerId,
      match: { voidedAt: null },
    },
    select: {
      team: true,
      match: { select: { games: { select: { team1Score: true, team2Score: true } } } },
    },
  });

  if (participations.length < 3) return null;

  let wins = 0;
  for (const p of participations) {
    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of p.match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    if (p.team === 1 ? t1Wins > t2Wins : t2Wins > t1Wins) wins++;
  }

  return wins / participations.length;
}

/**
 * Find an existing unclaimed shadow player by displayName (case-insensitive),
 * or create a new one if none exists.
 *
 * "Shadow player" = Player with userId = null and claimed = false.
 * If multiple unclaimed matches exist the first one (by createdAt) is returned.
 */
export async function findOrCreateShadowPlayer(
  displayName: string,
  prisma: PrismaClient,
) {
  const normalised = displayName.trim();

  const existing = await prisma.player.findFirst({
    where: {
      displayName: { equals: normalised, mode: "insensitive" },
      userId: null,
      claimed: false,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  try {
    return await prisma.player.create({
      data: {
        displayName: normalised,
        userId: null,
        claimed: false,
        trustTier: "unverified",
        rating: 1000,
      },
    });
  } catch (err: unknown) {
    // Handle race condition: another request created the same shadow between our
    // findFirst and create. Re-fetch and return the winner.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      const winner = await prisma.player.findFirst({
        where: {
          displayName: { equals: normalised, mode: "insensitive" },
          userId: null,
          claimed: false,
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
      });
      if (winner) return winner;
    }
    throw err;
  }
}
