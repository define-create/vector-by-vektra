import { prisma } from "@/lib/db";

export const DEMO_PREVIEW_MATCH_THRESHOLD = 5;

/**
 * Determines whether the new-user demo preview should be shown for this user.
 *
 * The preview disappears automatically once the user has played
 * DEMO_PREVIEW_MATCH_THRESHOLD non-voided matches. There is no manual dismiss.
 */
export async function shouldShowPreview(userId: string): Promise<boolean> {
  const player = await prisma.player.findFirst({
    where: { userId, deletedAt: null },
    select: {
      _count: {
        select: {
          matchParticipants: { where: { match: { voidedAt: null } } },
        },
      },
    },
  });

  if (!player) return false;
  return player._count.matchParticipants < DEMO_PREVIEW_MATCH_THRESHOLD;
}
