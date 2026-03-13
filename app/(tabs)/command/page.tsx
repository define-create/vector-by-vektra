import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import EditTimer from "@/components/command/EditTimer";
import { MetricInfoSheet } from "@/components/command/MetricInfoSheet";
import { RatingContext } from "@/components/command/RatingContext";
import { MatchHistoryList } from "@/components/command/MatchHistoryList";
import { ClaimProfilePrompt } from "@/components/command/ClaimProfilePrompt";
import { FilterChip } from "@/components/command/FilterChip";
import { getCommandData, type CommandFilter } from "@/lib/services/command";
import { DisplayNameEdit } from "@/components/command/DisplayNameEdit";
import { SituationBanner } from "@/components/command/SituationBanner";
import { TrajectoryGraph } from "@/components/command/TrajectoryGraph";
import { RecentPerformanceDots } from "@/components/command/RecentPerformanceDots";
import { DriverTile } from "@/components/command/DriverTile";

export const dynamic = "force-dynamic";

const METRIC_INFO = {
  rating: {
    label: "Rating",
    body: "Your rating is a number that represents your current skill level, calculated from every match you've played. Players start at 1000. Winning against stronger opponents raises it more; losing to weaker opponents drops it more. The higher your rating, the stronger the system considers you.",
  },
  winPct: {
    label: "Win %",
    body: "The percentage of matches you won. A 50% win rate means you're winning and losing about equally. Above 50% means you're outperforming expectations. Use the filter chip to scope this to a specific period or event.",
  },
  ci: {
    label: "Form",
    body: "Measures whether your recent improvements are building on each other or just oscillating. A positive CI means your wins are producing increasingly larger rating gains — your momentum is reinforcing. A negative CI means losses are outpacing gains. Near zero means your results are flat or random.",
  },
  drift: {
    label: "Drift Score",
    body: "Measures how much your actual results diverge from what the rating model predicts. A positive Drift means you're consistently winning more than expected — your rating is likely to rise soon. A negative Drift means you're losing more than expected — a rating drop may follow.",
  },
} as const;

function pct(value: number | null, decimals = 0): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

function signedFixed(value: number | null, decimals = 1): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

function ciToFormState(ci: number | null): { label: string; colorClass: string } {
  if (ci === null) return { label: "—", colorClass: "text-zinc-500" };
  if (ci > 20) return { label: "Strong", colorClass: "text-emerald-400" };
  if (ci < -20) return { label: "Fading", colorClass: "text-rose-400" };
  return { label: "Steady", colorClass: "text-zinc-300" };
}

export default async function CommandPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tag?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const params = await searchParams;

  const filter: CommandFilter | undefined =
    params.from || params.to || params.tag
      ? {
          from: params.from ? new Date(params.from) : undefined,
          to: params.to ? new Date(params.to) : undefined,
          tag: params.tag,
        }
      : undefined;

  const data = await getCommandData(session.user.id, filter);

  if (!data.hasPlayer) {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-5">
        <ClaimProfilePrompt emailVerified={data.emailVerified} userDisplayName={data.userDisplayName} userEmail={session.user.email ?? undefined} />
      </div>
    );
  }

  const formState = ciToFormState(data.compoundingIndex);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Pinned above the fold */}
      <SituationBanner state={data.situationState ?? null} detail={data.situationDetail ?? ""} />

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

      {/* Key Drivers */}
      <div className="px-5 pb-3">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">Key Drivers</p>
        <div className="grid grid-cols-3 gap-2">
          <DriverTile
            label="Win Rate"
            value={pct(data.winPct, 0)}
            delta={data.driverDeltas.winRateDelta !== null ? data.driverDeltas.winRateDelta * 100 : null}
            deltaUnit="%"
            history={data.driverHistory.winRateHistory}
            highlighted={data.dominantDriver === "winRate"}
            info={METRIC_INFO.winPct}
          />
          <DriverTile
            label="Form"
            value={formState.label}
            valueColor={formState.colorClass}
            secondaryValue={signedFixed(data.compoundingIndex)}
            delta={data.driverDeltas.ciDelta}
            history={data.driverHistory.ciHistory}
            highlighted={data.dominantDriver === "ci"}
            info={METRIC_INFO.ci}
          />
          <DriverTile
            label="Stability"
            value={signedFixed(data.driftScore)}
            delta={data.driverDeltas.driftDelta}
            history={data.driverHistory.driftHistory}
            highlighted={data.dominantDriver === "drift"}
            info={METRIC_INFO.drift}
          />
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-zinc-800/40" />

      {/* Scrollable section */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-4 pt-4">
        <FilterChip filter={filter} />

        {data.recentMatchHistory.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Recent Performance</p>
            <RecentPerformanceDots matches={data.recentMatchHistory} />
          </div>
        )}

        <MatchHistoryList matches={data.recentMatchHistory} myPlayerId={data.myPlayerId} />

        {data.editTimer.expiresAt && (
          <div className="rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">Last match</span>
            <EditTimer expiresAt={data.editTimer.expiresAt} />
          </div>
        )}

        {data.upcomingProbability !== null && (
          <div className="rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">Next match win prob.</span>
            <span className="text-sm font-semibold text-zinc-200">
              {pct(data.upcomingProbability, 0)}
            </span>
          </div>
        )}

        {data.myPlayerDisplayName && (
          <div className="rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">Display name</span>
            <DisplayNameEdit displayName={data.myPlayerDisplayName} />
          </div>
        )}
      </div>
    </div>
  );
}
