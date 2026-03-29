// ---------------------------------------------------------------------------
// ProjectionCard — PRD §4.6
//
// Layout (Duel Bar):
//   [Primary team + % (left)] | [vs] | [Opponent team + % (right)]
//   [Split probability bar]
//   [Moneyline pill]
//   [Metric chips — 2 rows of 3]
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { MetricInfoSheet, type MetricInfo } from "@/components/command/MetricInfoSheet";

// ---------------------------------------------------------------------------
// Metric explanation copy
// ---------------------------------------------------------------------------

const METRIC_INFO = {
  ratingDiff: {
    label: "Δ Rating",
    body: "The combined rating difference between your team and the opposing team. Positive means your side has a higher total rating and is the statistical favorite. Negative means the opponents are rated higher overall.",
  },
  confidence: {
    label: "Confidence",
    body: "How reliable the model's win probability is, shown as a percentage. Near 100% means both teams have many matches and stable ratings — the projection is well-grounded. Below 50% means at least one player is new or rarely plays, so treat the forecast as a rough estimate.",
  },
  volatility: {
    label: "Volatility",
    body: "The uncertainty band around the win probability, shown as ±N%. It ranges from ±3% (very predictable — ratings are stable and consistent) to ±20% (highly unpredictable — one or more players have few matches or erratic recent results). A ±5% band means the true probability likely sits within 5 points of the displayed figure.",
  },
  momentum: {
    label: "Momentum",
    body: "Compares your team's recent rating trajectory to the opponents'. ↑↑ Hot or ↑ Rising means your side has been gaining ground; → Steady means no meaningful trend; ↓ Fading or ↓↓ Cold means the opponents have been trending upward. The number in parentheses is the raw score (typically −30 to +30).",
  },
  expectationGap: {
    label: "Expectation Gap",
    body: "How much your team has over- or under-performed the model's expectations in recent head-to-head matches, typically ranging from −15 to +15. Positive means you've beaten expectations consistently; negative means you've fallen short. Shown dimmed when fewer than 3 qualifying matches are on record — the value is unreliable at that point.",
  },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Players {
  player1: { id: string; displayName: string };
  player2: { id: string; displayName: string };
  player3: { id: string; displayName: string };
  player4: { id: string; displayName: string };
}

interface ProjectionCardProps {
  probability: number;
  moneyline: number | "Even";
  ratingDiff: number;
  confidence: number;
  minConfidence: number;
  volatility: string;
  momentum: number;
  expectationGap: number;
  expectationGapLowSample: boolean;
  players: Players;
  /** If provided, player1 is labelled "You" in the Teams Block. */
  myPlayerId?: string;
  /** Optional footer rendered below a divider (e.g. ShareButton). */
  footer?: ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signedNum(n: number, decimals = 1): string {
  const rounded = parseFloat(n.toFixed(decimals));
  return rounded >= 0 ? `+${rounded.toFixed(decimals)}` : `${rounded.toFixed(decimals)}`;
}

function formatMoneyline(ml: number | "Even"): string {
  if (ml === "Even") return "Even";
  return ml >= 0 ? `+${ml}` : `${ml}`;
}

function formatMomentum(n: number): string {
  const label =
    n >= 15  ? "↑↑ Hot"   :
    n >= 5   ? "↑ Rising" :
    n > -5   ? "→ Steady" :
    n > -15  ? "↓ Fading" :
               "↓↓ Cold";
  const rounded = Math.round(n);
  const sign = rounded >= 0 ? "+" : "";
  return `${label} (${sign}${rounded})`;
}

// ---------------------------------------------------------------------------
// MetricChip
// ---------------------------------------------------------------------------

interface MetricChipProps {
  label: string;
  value: string;
  info: MetricInfo;
  dimmed?: boolean;
}

function MetricChip({ label, value, info, dimmed }: MetricChipProps) {
  return (
    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600 leading-none truncate">
          {label}
        </span>
        <MetricInfoSheet metric={info} />
      </div>
      <span
        className={`text-sm font-semibold tabular-nums leading-snug ${dimmed ? "text-zinc-600" : "text-zinc-200"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectionCard
// ---------------------------------------------------------------------------

export default function ProjectionCard({
  probability,
  moneyline,
  ratingDiff,
  confidence,
  minConfidence,
  volatility,
  momentum,
  expectationGap,
  expectationGapLowSample,
  players,
  myPlayerId,
  footer,
}: ProjectionCardProps) {
  const pct = Math.round(probability * 100);
  const oppPct = 100 - pct;
  const lowConfidence = minConfidence < 0.40;

  const p1Label = myPlayerId && players.player1.id === myPlayerId
    ? "You"
    : players.player1.displayName;
  const primaryPair = `${p1Label} / ${players.player2.displayName}`;
  const oppPair = `${players.player3.displayName} / ${players.player4.displayName}`;

  return (
    <div className="rounded-xl border border-[#374155] overflow-hidden">
      <div className="p-5 flex flex-col gap-4">

        {/* Duel Row — teams + probabilities side by side */}
        <div className="flex items-start">
          {/* Primary team (left) */}
          <div className="flex-1 flex flex-col gap-1">
            <p className="text-sm font-semibold text-zinc-200 leading-snug">{primaryPair}</p>
            <span
              className={`text-4xl font-bold tracking-tight leading-none tabular-nums ${
                lowConfidence ? "text-zinc-400" : "text-zinc-50"
              }`}
            >
              {lowConfidence ? `~${pct}%` : `${pct}%`}
            </span>
          </div>

          {/* VS label */}
          <div className="px-3 pt-2 flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">vs</span>
          </div>

          {/* Opponent team (right) */}
          <div className="flex-1 flex flex-col gap-1 items-end">
            <p className="text-sm font-medium text-zinc-500 leading-snug text-right">{oppPair}</p>
            <span className="text-4xl font-bold tracking-tight leading-none tabular-nums text-zinc-700">
              {oppPct}%
            </span>
          </div>
        </div>

        {/* Split probability bar */}
        <div className="flex flex-col gap-1.5">
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                lowConfidence ? "bg-zinc-600" : "bg-zinc-300"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">Win probability</span>
        </div>

        {/* Moneyline pill */}
        <div className="flex items-center gap-2">
          <span className="bg-zinc-800 rounded-full px-3 py-1 text-sm font-bold text-zinc-400 tabular-nums">
            {formatMoneyline(moneyline)}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">Model Line</span>
        </div>

        {/* Divider */}
        <div className="border-t border-[#374155]" />

        {/* Metric chips — 2 rows of 3 */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <MetricChip label="Δ Rating"    value={signedNum(ratingDiff, 1)}           info={METRIC_INFO.ratingDiff} />
            <MetricChip label="Confidence"  value={`${Math.round(confidence * 100)}%`} info={METRIC_INFO.confidence} />
            <MetricChip label="Volatility"  value={volatility}                          info={METRIC_INFO.volatility} />
          </div>
          <div className="flex gap-2">
            <MetricChip label="Momentum"  value={formatMomentum(momentum)}          info={METRIC_INFO.momentum} />
            <MetricChip label="Exp. Gap"  value={signedNum(expectationGap, 1)}      info={METRIC_INFO.expectationGap} dimmed={expectationGapLowSample} />
            {/* Empty spacer keeps row aligned with row above */}
            <div className="flex-1" />
          </div>
        </div>

        {lowConfidence && (
          <p className="text-xs text-zinc-500">Low confidence — fewer than ~10 matches on record</p>
        )}
      </div>

      {footer && (
        <>
          <div className="border-t border-[#374155]" />
          {footer}
        </>
      )}
    </div>
  );
}
