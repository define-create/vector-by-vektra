import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MatchupsClient from "@/components/matchups/MatchupsClient";
import { type SlotPlayer } from "@/components/matchups/PlayerPairSelector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRecentOpponents(myPlayerId: string): Promise<RecentPlayer[]> {
  const participations = await prisma.matchParticipant.findMany({
    where: { playerId: myPlayerId, match: { voidedAt: null } },
    include: {
      match: {
        include: {
          participants: {
            include: {
              player: {
                select: { id: true, displayName: true, rating: true, claimed: true },
              },
            },
          },
        },
      },
    },
    orderBy: { match: { matchDate: "desc" } },
    take: 50,
  });

  const seen = new Set<string>();
  const opponents: RecentPlayer[] = [];

  for (const participation of participations) {
    for (const p of participation.match.participants) {
      if (p.playerId === myPlayerId) continue;
      if (!seen.has(p.player.id) && opponents.length < 8) {
        seen.add(p.player.id);
        opponents.push(p.player);
      }
    }
    if (opponents.length >= 8) break;
  }

  return opponents;
}

// ---------------------------------------------------------------------------
// Page — server component wrapper
// ---------------------------------------------------------------------------

export default async function MatchupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const myPlayer = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { id: true, displayName: true },
  });

  if (!myPlayer) {
    return (
      <div className="flex h-full flex-col p-5">
        <h1 className="text-xl font-bold text-zinc-50 mb-2">Matchup Projection</h1>
        <p className="text-sm text-zinc-500">
          No player profile found. Enter a match first.
        </p>
      </div>
    );
  }

  const recentOpponents = await getRecentOpponents(myPlayer.id);

  // Pre-population from URL params (e.g., long-press from Command screen)
  const params = await searchParams;
  const p2Id = typeof params.player2 === "string" ? params.player2 : undefined;
  const p3Id = typeof params.player3 === "string" ? params.player3 : undefined;
  const p4Id = typeof params.player4 === "string" ? params.player4 : undefined;

  // Fetch display names for any pre-populated player IDs
  const idsToFetch = [p2Id, p3Id, p4Id].filter(Boolean) as string[];
  const playerMap = new Map<string, { id: string; displayName: string }>();

  if (idsToFetch.length > 0) {
    const players = await prisma.player.findMany({
      where: { id: { in: idsToFetch }, deletedAt: null },
      select: { id: true, displayName: true },
    });
    for (const p of players) playerMap.set(p.id, p);
  }

  function toSlot(id: string | undefined): SlotPlayer | null {
    if (!id) return null;
    const p = playerMap.get(id);
    return p ? { id: p.id, name: p.displayName } : null;
  }

  return (
    <MatchupsClient
      myPlayerId={myPlayer.id}
      recentOpponents={recentOpponents}
      initialPartner={toSlot(p2Id)}
      initialOpp1={toSlot(p3Id)}
      initialOpp2={toSlot(p4Id)}
    />
  );
}
