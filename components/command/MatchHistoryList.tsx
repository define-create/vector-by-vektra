import { type LastMatch } from "@/lib/services/command";

interface Props {
  matches: LastMatch[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Compact scrollable list of recent matches — two-row layout per entry.
 * Row 1: date + outcome badge (left) · score (right)
 * Row 2: "with Partner · vs. Opp1 & Opp2" — wraps naturally, no truncation.
 * Server-renderable — no client state needed.
 */
export function MatchHistoryList({ matches }: Props) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Recent Matches</p>

      <div className="max-h-64 overflow-y-auto rounded-xl bg-zinc-800">
        {matches.length === 0 ? (
          <p className="px-4 py-3 text-xs text-zinc-500">No matches yet.</p>
        ) : (
          matches.map((m, i) => (
            <div
              key={i}
              className={`px-4 py-2 ${i > 0 ? "border-t border-zinc-700/50" : ""}`}
            >
              {/* Row 1: date + outcome · score */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{formatDate(m.matchDate)}</span>
                  <span
                    className={`text-xs font-semibold ${
                      m.outcome === "win" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {m.outcome === "win" ? "WIN" : "LOSS"}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">{m.score}</span>
              </div>

              {/* Row 2: partner + opponents */}
              <p className="text-xs text-zinc-400 mt-0.5">
                with {m.partnerName} · vs. {m.opponentNames.join(" & ")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
