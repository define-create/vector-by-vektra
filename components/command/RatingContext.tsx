import { type CommunityStats } from "@/lib/services/command";

interface Props {
  rating: number;
  communityStats: CommunityStats;
}

/**
 * Progress bar + relative-context text displayed under the large rating number.
 * Server-renderable — no client state needed.
 */
export function RatingContext({ rating, communityStats }: Props) {
  const { avg, min, max } = communityStats;
  const range = max - min;
  // Clamp position to [0, 100]%
  const pct = range > 0 ? Math.max(0, Math.min(100, ((rating - min) / range) * 100)) : 50;
  const aboveAvg = rating > avg;
  const delta = Math.round(Math.abs(rating - avg));
  const near = delta <= 30;

  const relativeText = near
    ? "Near community average"
    : aboveAvg
      ? `+${delta} above average`
      : `−${delta} below average`;

  const fillColor = aboveAvg ? "bg-emerald-500" : "bg-zinc-400";

  return (
    <div className="w-full mt-2 mb-1">
      {/* Progress bar */}
      <div className="relative w-full h-1 bg-zinc-700 rounded-full">
        {/* Filled portion */}
        <div
          className={`absolute left-0 top-0 h-1 rounded-full ${fillColor}`}
          style={{ width: `${pct}%` }}
        />
        {/* Thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${fillColor}`}
          style={{ left: `${pct}%` }}
        />
      </div>

      {/* Relative text */}
      <p className="mt-1.5 text-xs text-zinc-500 text-center">{relativeText}</p>
    </div>
  );
}
