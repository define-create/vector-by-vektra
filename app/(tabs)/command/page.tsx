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

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Metric explanation copy
// ---------------------------------------------------------------------------

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
    label: "Compounding Index",
    body: "Measures whether your recent improvements are building on each other or just oscillating. A positive CI means your wins are producing increasingly larger rating gains — your momentum is reinforcing. A negative CI means losses are outpacing gains. Near zero means your results are flat or random.",
  },
  drift: {
    label: "Drift Score",
    body: "Measures how much your actual results diverge from what the rating model predicts. A positive Drift means you're consistently winning more than expected — your rating is likely to rise soon. A negative Drift means you're losing more than expected — a rating drop may follow.",
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(value: number | null, decimals = 0): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

function signedFixed(value: number | null, decimals = 1): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

// ---------------------------------------------------------------------------
// CommandPage — Server Component
// ---------------------------------------------------------------------------

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
        <ClaimProfilePrompt emailVerified={data.emailVerified} userDisplayName={data.userDisplayName} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Rating — always all-time — pinned */}
      <div className="flex flex-col items-center py-4 px-5">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">Rating</p>
          <MetricInfoSheet metric={METRIC_INFO.rating} />
        </div>
        <p className="text-7xl font-bold tabular-nums text-zinc-50 leading-none mt-1">
          {data.rating !== null ? Math.round(data.rating) : "—"}
        </p>
        {/* Community context — only when data.rating and communityStats are available */}
        {data.rating !== null && data.communityStats !== null && (
          <RatingContext rating={data.rating} communityStats={data.communityStats} />
        )}
      </div>

      {/* Scrollable section — Filter chip and everything below */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-4">
      {/* Filter chip — below rating, above metrics */}
      <FilterChip filter={filter} />

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Win %"
          value={pct(data.winPct, 0)}
          info={METRIC_INFO.winPct}
        />
        <MetricCard
          label="CI"
          value={signedFixed(data.compoundingIndex)}
          info={METRIC_INFO.ci}
        />
        <MetricCard
          label="Drift"
          value={signedFixed(data.driftScore)}
          info={METRIC_INFO.drift}
        />
      </div>

      {/* Edit timer */}
      {data.editTimer.expiresAt && (
        <div className="rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-zinc-400">Last match</span>
          <EditTimer expiresAt={data.editTimer.expiresAt} />
        </div>
      )}

      {/* Upcoming probability */}
      {data.upcomingProbability !== null && (
        <div className="rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-zinc-400">Next match win prob.</span>
          <span className="text-sm font-semibold text-zinc-200">
            {pct(data.upcomingProbability, 0)}
          </span>
        </div>
      )}

      {/* Match history list — long-press a row to navigate to matchup projection */}
      <MatchHistoryList matches={data.recentMatchHistory} myPlayerId={data.myPlayerId} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info: { label: string; body: string };
}) {
  return (
    <div className="relative flex flex-col items-center rounded-xl bg-zinc-800/60 px-3 py-4 gap-1">
      {/* ⓘ pinned to top-right corner */}
      <div className="absolute top-2 right-2">
        <MetricInfoSheet metric={info} />
      </div>
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-2xl font-bold tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}
