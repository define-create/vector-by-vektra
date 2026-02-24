// ---------------------------------------------------------------------------
// HistoryCard — Head-to-Head History
//
// Styled to match the "Recent Matches" list on the Command screen:
//   - Small-caps section label + meta line
//   - rounded-xl bg-zinc-800 container (no card border)
//   - Two-line rows: date + result / score, then rating delta
// ---------------------------------------------------------------------------

interface HistoryRow {
  date: string;    // "YYYY-MM-DD"
  result: "W" | "L";
  score: string;   // "21–17, 18–21, 11–8"
  delta: number;
}

interface HistoryCardProps {
  history: HistoryRow[];
  record: string;    // "3–2"
  avgMargin: number;
}

function signedDelta(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}` : `${n.toFixed(1)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function HistoryCard({ history, record, avgMargin }: HistoryCardProps) {
  return (
    <div>
      {/* Section label — matches "Recent Matches" style */}
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
        Head-to-Head History
      </p>
      <p className="text-xs text-zinc-500 mb-2">
        Record: {record} · Avg Margin: {signedDelta(avgMargin)}
      </p>

      <div className="rounded-xl bg-zinc-800">
        {history.length === 0 ? (
          <p className="px-4 py-3 text-xs text-zinc-500">No head-to-head history found.</p>
        ) : (
          history.map((row, i) => (
            <div
              key={i}
              className={`px-4 py-2${i > 0 ? " border-t border-zinc-700/50" : ""}`}
            >
              {/* Row 1: date + result (left) · score (right) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {formatDate(row.date)}
                  </span>
                  <span className="text-xs font-semibold text-zinc-200 tabular-nums">
                    {row.result === "W" ? "WIN" : "LOSS"}
                  </span>
                </div>
                <span className="text-xs text-zinc-500 tabular-nums">{row.score}</span>
              </div>

              {/* Row 2: rating delta */}
              <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">
                Rating Δ {signedDelta(row.delta)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
