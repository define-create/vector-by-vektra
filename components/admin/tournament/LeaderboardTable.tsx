import { type TournamentPlayer } from "@/lib/services/tournament";

interface LeaderboardTableProps {
  players: TournamentPlayer[];
}

export function LeaderboardTable({ players }: LeaderboardTableProps) {
  return (
    <div>
      <p className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Leaderboard</p>
      <div className="rounded-xl bg-zinc-800">
        {players.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500">No players yet.</p>
        ) : (
          players.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-4 py-2.5${i > 0 ? " border-t border-zinc-700/50" : ""}`}
            >
              {/* Rank */}
              <span className="text-sm tabular-nums text-zinc-500 w-6 shrink-0 text-right">
                {player.rank}
              </span>

              {/* Name */}
              <span className="text-sm text-zinc-200 flex-1 truncate">
                {player.displayName}
              </span>

              {/* W / L */}
              <span className="text-sm tabular-nums text-emerald-400 shrink-0">
                {player.wins}W
              </span>
              <span className="text-sm tabular-nums text-rose-400 shrink-0">
                {player.losses}L
              </span>

              {/* Rating */}
              <span className="text-sm tabular-nums text-zinc-400 shrink-0 w-12 text-right">
                {Math.round(player.rating)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
