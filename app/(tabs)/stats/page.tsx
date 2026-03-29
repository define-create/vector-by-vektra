import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import StatsTabView from "@/components/stats/StatsTabView";
import { type SlotPlayer } from "@/components/matchups/PlayerPairSelector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  matchCount: number;
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
    take: 50,
  });

  const seen = new Set<string>();
  const opponents: RecentPlayer[] = [];

  for (const participation of participations) {
    for (const p of participation.match.participants) {
      if (p.playerId === myPlayerId) continue;
      if (!seen.has(p.player.id) && opponents.length < 8) {
        seen.add(p.player.id);
        opponents.push({
          id: p.player.id,
          displayName: p.player.displayName,
          rating: p.player.rating,
          claimed: p.player.claimed,
          matchCount: p.player._count.matchParticipants,
        });
      }
    }
    if (opponents.length >= 8) break;
  }

  return opponents;
}

// ---------------------------------------------------------------------------
// Page — server component
// ---------------------------------------------------------------------------

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const isAdmin = session.user.role === "admin";

  const myPlayer = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { id: true },
  });

  const tagMatchRows = await prisma.match.findMany({
    where: {
      voidedAt: null,
      tag: { not: null },
      ...(isAdmin ? {} : myPlayer ? { participants: { some: { playerId: myPlayer.id } } } : { id: "none" }),
    },
    select: { tag: true, matchDate: true },
    orderBy: [{ matchDate: "desc" }, { tag: "asc" }],
  });
  // Deduplicate preserving first-seen order: latest match date first, then alphabetical
  const seenTags = new Set<string>();
  const tournamentTags: string[] = [];
  for (const m of tagMatchRows) {
    if (m.tag && !seenTags.has(m.tag)) {
      seenTags.add(m.tag);
      tournamentTags.push(m.tag);
    }
  }

  const params = await searchParams;
  const p2Id = typeof params.player2 === "string" ? params.player2 : undefined;
  const p3Id = typeof params.player3 === "string" ? params.player3 : undefined;
  const p4Id = typeof params.player4 === "string" ? params.player4 : undefined;

  let recentOpponents: RecentPlayer[] = [];
  let initialPartner: SlotPlayer | null = null;
  let initialOpp1: SlotPlayer | null = null;
  let initialOpp2: SlotPlayer | null = null;

  if (myPlayer) {
    recentOpponents = await getRecentOpponents(myPlayer.id);

    const idsToFetch = [p2Id, p3Id, p4Id].filter(Boolean) as string[];
    const playerMap = new Map<string, { id: string; displayName: string; claimed: boolean }>();

    if (idsToFetch.length > 0) {
      const players = await prisma.player.findMany({
        where: { id: { in: idsToFetch }, deletedAt: null },
        select: { id: true, displayName: true, claimed: true },
      });
      for (const p of players) playerMap.set(p.id, p);
    }

    function toSlot(id: string | undefined): SlotPlayer | null {
      if (!id) return null;
      const p = playerMap.get(id);
      return p ? { id: p.id, name: p.displayName, claimed: p.claimed } : null;
    }

    initialPartner = toSlot(p2Id);
    initialOpp1 = toSlot(p3Id);
    initialOpp2 = toSlot(p4Id);
  }

  return (
    <StatsTabView
      myPlayerId={myPlayer?.id ?? null}
      recentOpponents={recentOpponents}
      initialPartner={initialPartner}
      initialOpp1={initialOpp1}
      initialOpp2={initialOpp2}
      initialTab={p2Id || p3Id || p4Id ? "matchup" : "stats"}
      isAdmin={isAdmin}
      eventTags={tournamentTags}
    />
  );
}
