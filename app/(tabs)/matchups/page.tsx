import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ProGate from "@/components/matchups/ProGate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentOpponent {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
}

// ---------------------------------------------------------------------------
// MatchupsPage — Server Component
// ---------------------------------------------------------------------------

export default async function MatchupsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const isPro = session.user.role === "admin"; // admins always have Pro access; real Pro TBD

  // For free users: query recent opponents directly (no HTTP round-trip)
  let recentOpponents: RecentOpponent[] = [];
  if (!isPro) {
    const myPlayer = await prisma.player.findFirst({
      where: { userId: session.user.id, deletedAt: null },
    });

    if (myPlayer) {
      const participations = await prisma.matchParticipant.findMany({
        where: { playerId: myPlayer.id, match: { voidedAt: null } },
        include: {
          match: {
            include: {
              participants: {
                include: { player: { select: { id: true, displayName: true, rating: true, claimed: true } } },
              },
            },
          },
        },
        orderBy: { match: { matchDate: "desc" } },
        take: 30,
      });

      const seen = new Set<string>();
      for (const participation of participations) {
        for (const p of participation.match.participants) {
          if (p.playerId === myPlayer.id || p.team === participation.team) continue;
          if (!seen.has(p.player.id) && recentOpponents.length < 5) {
            seen.add(p.player.id);
            recentOpponents.push(p.player);
          }
        }
        if (recentOpponents.length >= 5) break;
      }
    }
  }

  return (
    <div className="flex h-full flex-col p-5 gap-5">
      <h2 className="text-lg font-semibold text-zinc-50">Matchups</h2>

      {/* Pro gate / search bar */}
      {isPro ? (
        <div className="text-sm text-zinc-400">
          {/* Pro search bar — phase 2 */}
          <p>Pro matchup search coming soon.</p>
        </div>
      ) : (
        <ProGate />
      )}

      {/* Default view: recent opponents for free users */}
      {!isPro && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Recent opponents
          </p>
          {recentOpponents.length === 0 ? (
            <p className="text-sm text-zinc-500">No opponents yet — enter a match first.</p>
          ) : (
            recentOpponents.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center justify-between rounded-xl bg-zinc-800/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{opp.displayName}</p>
                  {!opp.claimed && (
                    <p className="text-xs text-amber-400">Shadow profile</p>
                  )}
                </div>
                <span className="text-sm tabular-nums text-zinc-400">
                  {Math.round(opp.rating)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
