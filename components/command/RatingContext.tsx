import { type CommunityStats } from "@/lib/services/command";

interface Props {
  rating: number;
  communityStats: CommunityStats;
  ratingHistory?: { rating: number }[];
}

export function RatingContext({ rating, communityStats, ratingHistory = [] }: Props) {
  const { avg } = communityStats;
  const aboveAvg = rating > avg;
  const delta = Math.round(Math.abs(rating - avg));
  const near = delta <= 30;

  const relativeText = near
    ? "Near community average"
    : aboveAvg
      ? `+${delta} above average`
      : `−${delta} below average`;

  const trendDelta =
    ratingHistory.length >= 2
      ? Math.round(
          ratingHistory[ratingHistory.length - 1]!.rating -
            ratingHistory[Math.max(0, ratingHistory.length - 11)]!.rating,
        )
      : null;

  return (
    <div className="w-full mt-1 flex flex-col items-center gap-0.5">
      {trendDelta !== null && (
        <p className="text-xs text-zinc-500">
          {trendDelta >= 0 ? "+" : ""}
          {trendDelta} in last 10 matches
        </p>
      )}
      <p className={`text-xs ${aboveAvg ? "text-emerald-600" : "text-zinc-500"}`}>
        {relativeText}
      </p>
    </div>
  );
}
