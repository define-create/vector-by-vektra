import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function signedInt(n: number): string {
  const r = Math.round(n);
  return r >= 0 ? `+${r}` : `${r}`;
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      participants: { include: { player: true }, orderBy: { team: "asc" } },
      games: { orderBy: { gameOrder: "asc" } },
      enteredBy: { select: { displayName: true } },
    },
  });

  if (!match) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <p className="text-zinc-400">Match not found.</p>
        <Link href="/" className="mt-4 text-sm text-zinc-500 underline">← Back</Link>
      </div>
    );
  }

  if (match.voidedAt) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <p className="text-zinc-400">This match is no longer available.</p>
        <Link href="/" className="mt-4 text-sm text-zinc-500 underline">← Back</Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ELO delta computation
  // ---------------------------------------------------------------------------
  const latestRun = await prisma.ratingRun.findFirst({ orderBy: { startedAt: "desc" } });

  const deltaByPlayerId = new Map<string, number | null>();

  if (latestRun) {
    const thisSnapshots = await prisma.ratingSnapshot.findMany({
      where: { matchId: match.id, runId: latestRun.id },
    });

    await Promise.all(
      thisSnapshots.map(async (s) => {
        const prev = await prisma.ratingSnapshot.findFirst({
          where: {
            playerId: s.playerId,
            runId: latestRun.id,
            matchDate: { lt: match.matchDate },
          },
          orderBy: { matchDate: "desc" },
        });
        deltaByPlayerId.set(s.playerId, prev != null ? s.rating - prev.rating : null);
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const team1 = match.participants.filter((p) => p.team === 1);
  const team2 = match.participants.filter((p) => p.team === 2);

  const team1Wins = match.games.filter((g) => g.team1Score > g.team2Score).length;
  const team2Wins = match.games.filter((g) => g.team2Score > g.team1Score).length;
  const winningTeam = team1Wins > team2Wins ? 1 : team2Wins > team1Wins ? 2 : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-4 pt-5 pb-2">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back
        </Link>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-6">
        {/* Header */}
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            {formatDate(match.matchDate)}
          </p>
          {match.tag && (
            <p className="mt-0.5 text-xs text-zinc-400">{match.tag}</p>
          )}
        </div>

        {/* Teams */}
        <div className="flex flex-col gap-3">
          {[
            { team: team1, teamNum: 1 },
            { team: team2, teamNum: 2 },
          ].map(({ team, teamNum }) => (
            <div
              key={teamNum}
              className={[
                "rounded-2xl border bg-zinc-800/40 px-4 py-3",
                winningTeam === teamNum
                  ? "border-emerald-500/70"
                  : winningTeam !== null
                  ? "border-zinc-700/30"
                  : "border-zinc-700/60",
              ].join(" ")}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                  Team {teamNum}
                </p>
                {winningTeam === teamNum && (
                  <span className="text-xs font-semibold text-emerald-400">WIN</span>
                )}
              </div>
              {team.map((p) => {
                const delta = deltaByPlayerId.get(p.playerId);
                return (
                  <div key={p.playerId} className="flex items-center justify-between py-0.5">
                    <span className="text-sm text-zinc-200">{p.player.displayName}</span>
                    {delta != null && (
                      <span
                        className={[
                          "text-sm tabular-nums",
                          delta >= 0 ? "text-emerald-400" : "text-rose-400",
                        ].join(" ")}
                      >
                        {signedInt(delta)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Scores */}
        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-800/40 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Scores</p>
          <div className="flex flex-col gap-1">
            {match.games.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm text-zinc-300">
                <span>Game {g.gameOrder}</span>
                <span className="tabular-nums">
                  {g.team1Score} – {g.team2Score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-zinc-500">
          Entered by {match.enteredBy.displayName} on {formatDate(match.createdAt)}
        </p>
      </div>
    </div>
  );
}
