// ---------------------------------------------------------------------------
// HistoryCard — Head-to-Head History
//
// Styled to match the "Recent Matches" list on the Command screen:
//   - Small-caps section label + meta line
//   - rounded-xl bg-zinc-800 container (no card border)
//   - Single-line rows: date · WIN/LOSS (colored) · score
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
      <p className="text-sm uppercase tracking-widest text-zinc-500 mb-1">
        Head-to-Head History
      </p>
      <p className="text-sm text-zinc-500 mb-2">
        Record: {record} · Avg Margin: {avgMargin >= 0 ? `+${avgMargin.toFixed(1)}` : `${avgMargin.toFixed(1)}`}
      </p>

      <div className="rounded-xl bg-zinc-800">
        {history.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500">No head-to-head history found.</p>
        ) : (
          history.map((row, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-4 py-2${i > 0 ? " border-t border-zinc-700/50" : ""}`}
            >
              <span className="text-sm text-zinc-500 tabular-nums shrink-0">
                {formatDate(row.date)}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums shrink-0 ${
                  row.result === "W" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {row.result === "W" ? "WIN" : "LOSS"}
              </span>
              <span className="flex-1" />
              <span className="text-sm text-zinc-500 tabular-nums shrink-0">{row.score}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
