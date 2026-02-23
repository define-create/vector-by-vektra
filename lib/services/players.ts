/**
 * Player service: shadow profile management.
 */

import { type PrismaClient } from "@/app/generated/prisma/client";

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

  return prisma.player.create({
    data: {
      displayName: normalised,
      userId: null,
      claimed: false,
      trustTier: "unverified",
      rating: 1000,
    },
  });
}
