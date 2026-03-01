import { type TournamentMatch } from "@/lib/services/tournament";

interface TournamentMatchListProps {
  matches: TournamentMatch[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TournamentMatchList({ matches }: TournamentMatchListProps) {
  return (
    <div>
      <p className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Matches</p>
      <div className="rounded-xl bg-zinc-800">
        {matches.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500">No matches yet.</p>
        ) : (
          matches.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center gap-2 px-4 py-2.5${i > 0 ? " border-t border-zinc-700/50" : ""}`}
            >
              {/* Date */}
              <span className="text-sm text-zinc-500 tabular-nums shrink-0">
                {formatDate(m.matchDate)}
              </span>

              {/* WIN / LOSS badge */}
              <span
                className={`text-sm font-semibold shrink-0 w-10 ${
                  m.team1Won ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {m.team1Won ? "WIN" : "LOSS"}
              </span>

              {/* Teams — flex-1 middle */}
              <span className="text-sm text-zinc-300 flex-1 min-w-0">
                <span className="text-zinc-200">{m.team1Names.join(" & ")}</span>
                <span className="text-zinc-500"> vs </span>
                <span className="text-zinc-400">{m.team2Names.join(" & ")}</span>
              </span>

              {/* Score */}
              <span className="text-sm text-zinc-500 tabular-nums shrink-0">{m.score}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
