import { getCommandData, type CommandFilter, type CommandData } from "@/lib/services/command";
import { FilterChip } from "@/components/command/FilterChip";
import { RecentPerformanceDots } from "@/components/command/RecentPerformanceDots";
import { MatchHistoryList } from "@/components/command/MatchHistoryList";
import { MetricInfoSheet } from "@/components/command/MetricInfoSheet";
import { METRIC_INFO, pct } from "./helpers";

export default async function MatchHistorySection({
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
    <div className="px-5 pb-5 flex flex-col gap-4 pt-4">
      <FilterChip filter={filter} />

      {data.recentMatchHistory.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Recent Performance</p>
          <RecentPerformanceDots matches={data.recentMatchHistory} />
          {data.upcomingProbability !== null && (
            <div className="mt-2 text-sm text-zinc-500 text-center flex items-center justify-center gap-3">
              Next match win probability:{" "}
              <span className="font-semibold text-zinc-200">{pct(data.upcomingProbability, 0)}</span>
              <MetricInfoSheet metric={METRIC_INFO.winProb} />
            </div>
          )}
        </div>
      )}

      <MatchHistoryList matches={data.recentMatchHistory} myPlayerId={data.myPlayerId} />
    </div>
  );
}
