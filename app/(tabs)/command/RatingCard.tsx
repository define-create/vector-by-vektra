import { getCommandData, type CommandFilter, type CommandData } from "@/lib/services/command";
import { MetricInfoSheet } from "@/components/command/MetricInfoSheet";
import { TrajectoryGraph } from "@/components/command/TrajectoryGraph";
import { RatingContext } from "@/components/command/RatingContext";
import { METRIC_INFO } from "./helpers";

export default async function RatingCard({
  userId,
  filter,
  previewOverride,
}: {
  userId: string;
  filter?: CommandFilter;
  previewOverride?: CommandData;
}) {
  const data = previewOverride ?? (await getCommandData(userId, filter));

  return (
    <div className="flex flex-col items-center pt-3 pb-1 px-5">
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Rating</p>
        <MetricInfoSheet metric={METRIC_INFO.rating} />
      </div>
      <p className="text-7xl font-bold tabular-nums text-zinc-50 leading-none mt-1">
        {data.rating !== null ? Math.round(data.rating) : "—"}
      </p>
      {data.ratingHistory.length >= 2 && (
        <TrajectoryGraph history={data.ratingHistory} />
      )}
      {data.rating !== null && data.communityStats !== null && (
        <RatingContext
          rating={data.rating}
          communityStats={data.communityStats}
          ratingHistory={data.ratingHistory}
        />
      )}
    </div>
  );
}
