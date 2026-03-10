import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/players/recent
// Returns up to 5 distinct recent partners and 5 distinct recent opponents
// for the current user's player (used for chip suggestions in Enter screen).
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the current user's player profile
  const myPlayer = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
  });

  if (!myPlayer) {
    return NextResponse.json({ partners: [], opponents: [] });
  }

  // Fetch the user's last 30 non-voided matches (enough to extract 5 distinct each)
  const myParticipations = await prisma.matchParticipant.findMany({
    where: { playerId: myPlayer.id, match: { voidedAt: null } },
    include: {
      match: {
        include: {
          participants: {
            include: {
              player: {
                select: {
                  id: true,
                  displayName: true,
                  rating: true,
                  claimed: true,
                  _count: { select: { matchParticipants: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { match: { matchDate: "desc" } },
    take: 30,
  });

  const seenPartnerIds = new Set<string>();
  const seenOpponentIds = new Set<string>();
  const partners: { id: string; displayName: string; rating: number; claimed: boolean; matchCount: number }[] = [];
  const opponents: { id: string; displayName: string; rating: number; claimed: boolean; matchCount: number }[] = [];

  for (const participation of myParticipations) {
    const myTeam = participation.team;
    for (const p of participation.match.participants) {
      if (p.playerId === myPlayer.id) continue;

      const player = p.player;
      const playerEntry = {
        id: player.id,
        displayName: player.displayName,
        rating: player.rating,
        claimed: player.claimed,
        matchCount: player._count.matchParticipants,
      };
      if (p.team === myTeam) {
        // Same team = partner
        if (!seenPartnerIds.has(player.id) && partners.length < 5) {
          seenPartnerIds.add(player.id);
          partners.push(playerEntry);
        }
      } else {
        // Opposing team = opponent
        if (!seenOpponentIds.has(player.id) && opponents.length < 5) {
          seenOpponentIds.add(player.id);
          opponents.push(playerEntry);
        }
      }
    }

    if (partners.length >= 5 && opponents.length >= 5) break;
  }

  return NextResponse.json({ partners, opponents });
}
