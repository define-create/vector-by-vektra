import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import EditTimer from "@/components/command/EditTimer";
import { getCommandData } from "@/lib/services/command";

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

export default async function CommandPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const data = await getCommandData(session.user.id);

  return (
    <div className="flex h-full flex-col overflow-hidden p-5 gap-4">
      {/* Rating */}
      <div className="flex flex-col items-center py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Rating</p>
        <p className="text-7xl font-bold tabular-nums text-zinc-50 leading-none mt-1">
          {data.rating !== null ? Math.round(data.rating) : "—"}
        </p>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Win % (90d)"
          value={pct(data.winPct90d, 0)}
        />
        <MetricCard
          label="CI"
          value={signedFixed(data.compoundingIndex)}
        />
        <MetricCard
          label="Drift"
          value={signedFixed(data.driftScore)}
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

      {/* Last match */}
      {data.lastMatch && (
        <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Last match</span>
            <span
              className={[
                "text-xs font-semibold",
                data.lastMatch.outcome === "win" ? "text-emerald-400" : "text-rose-400",
              ].join(" ")}
            >
              {data.lastMatch.outcome.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-zinc-300">
            vs. {data.lastMatch.opponentNames.join(" & ")}
          </p>
          <p className="text-xs text-zinc-500">{data.lastMatch.score}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-zinc-800/60 px-3 py-4 gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xl font-bold tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}
