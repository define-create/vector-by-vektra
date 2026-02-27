// ---------------------------------------------------------------------------
// ProjectionCard — PRD §4.6
//
// Layout (side-by-side, matches reference design):
//   [Teams Block — full width]
//   [Forecast Block (left-dominant)] | [Structural Metrics Grid (right)]
//
// Forecast: probability with %, moneyline, "Model Line" label.
// Metrics: 2×2 grid + Expectation Gap spanning full width on last row.
// Each metric label has an ⓘ icon that opens a bottom-sheet explanation.
// ---------------------------------------------------------------------------

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
  volatility: string;
  momentum: number;
  expectationGap: number;
  expectationGapLowSample: boolean;
  players: Players;
  /** If provided, player1 is labelled "You" in the Teams Block. */
  myPlayerId?: string;
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
// MetricCell
// ---------------------------------------------------------------------------

interface MetricCellProps {
  label: string;
  value: string;
  info: MetricInfo;
  dimmed?: boolean;
}

function MetricCell({ label, value, info, dimmed }: MetricCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-sm text-zinc-500 leading-none">{label}</span>
        <MetricInfoSheet metric={info} />
      </div>
      <span
        className={`text-base font-medium tabular-nums leading-none ${dimmed ? "text-zinc-500" : "text-zinc-50"}`}
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
  volatility,
  momentum,
  expectationGap,
  expectationGapLowSample,
  players,
  myPlayerId,
}: ProjectionCardProps) {
  const pct = Math.round(probability * 100);

  const p1Label = myPlayerId && players.player1.id === myPlayerId
    ? "You"
    : players.player1.displayName;
  const primaryPair = `${p1Label} / ${players.player2.displayName}`;
  const oppPair = `${players.player3.displayName} / ${players.player4.displayName}`;

  return (
    <div className="rounded-xl border border-[#374155] p-5 flex flex-col gap-4">
      {/* Teams Block */}
      <div>
        <p className="text-base font-medium text-zinc-50 leading-snug">{primaryPair}</p>
        <p className="text-base text-zinc-500 leading-snug">vs {oppPair}</p>
      </div>

      {/* Forecast Block (left) + Metrics column (right) — side by side */}
      <div className="flex items-start gap-5">
        {/* Forecast Block */}
        <div className="flex flex-col flex-none">
          <span className="text-[64px] font-bold tracking-tight leading-none tabular-nums text-zinc-50">
            {pct}%
          </span>
          <span className="text-[40px] font-bold leading-none tabular-nums text-zinc-200 mt-1">
            {formatMoneyline(moneyline)}
          </span>
          <span className="text-sm text-zinc-500 mt-2">Model Line</span>
        </div>

        {/* Structural Metrics — single column */}
        <div className="flex-1 flex flex-col gap-3 pl-3">
          <MetricCell label="Δ Rating"        value={signedNum(ratingDiff, 1)}            info={METRIC_INFO.ratingDiff} />
          <MetricCell label="Confidence"      value={`${Math.round(confidence * 100)}%`}  info={METRIC_INFO.confidence} />
          <MetricCell label="Volatility"      value={volatility}                           info={METRIC_INFO.volatility} />
          <MetricCell label="Momentum"        value={formatMomentum(momentum)}             info={METRIC_INFO.momentum} />
          <MetricCell label="Expectation Gap" value={signedNum(expectationGap, 1)}         info={METRIC_INFO.expectationGap} dimmed={expectationGapLowSample} />
        </div>
      </div>
    </div>
  );
}
