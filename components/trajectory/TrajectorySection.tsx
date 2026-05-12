"use client";

import { useState, useEffect } from "react";
import RatingChart from "@/components/trajectory/RatingChart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Horizon = "10games" | "7days" | "30days";

export interface TrajectoryData {
  ratingSeries: { matchDate: string; rating: number }[];
  winRate: number | null;
  record: { wins: number; losses: number };
  pointDifferential: number;
}

const HORIZONS: { value: Horizon; label: string }[] = [
  { value: "10games", label: "10 Games" },
  { value: "7days", label: "7 Days" },
  { value: "30days", label: "1 Month" },
];

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-zinc-800/60 px-3 py-4 gap-1">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-xl font-bold tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrajectorySection — reusable client component
// ---------------------------------------------------------------------------

export function TrajectorySection({ previewOverride }: { previewOverride?: TrajectoryData } = {}) {
  const [horizon, setHorizon] = useState<Horizon>("10games");
  const [fetched, setFetched] = useState<TrajectoryData | null>(null);
  const [loading, setLoading] = useState(previewOverride ? false : true);

  useEffect(() => {
    if (previewOverride) return;
    setLoading(true);
    fetch(`/api/trajectory?horizon=${horizon}`)
      .then((r) => r.json())
      .then((d: TrajectoryData) => {
        setFetched(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [horizon, previewOverride]);

  const data = previewOverride ?? fetched;

  function pct(value: number | null): string {
    if (value === null) return "—";
    return `${(value * 100).toFixed(0)}%`;
  }

  function sign(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  return (
    <div className="flex flex-col p-5 gap-5">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">Match Statistics</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Select a time range to see how your results have changed across recent matches.</p>
      </div>

      {/* Segmented control */}
      <div className="flex rounded-xl bg-zinc-800 p-1 gap-1">
        {HORIZONS.map((h) => (
          <button
            key={h.value}
            type="button"
            onClick={() => setHorizon(h.value)}
            className={[
              "flex-1 rounded-lg py-2 text-base font-medium transition-colors",
              horizon === h.value
                ? "bg-zinc-200 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl bg-zinc-800/60 px-2 py-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-zinc-500 text-sm">
            Loading…
          </div>
        ) : (
          <RatingChart ratingSeries={data?.ratingSeries ?? []} />
        )}
      </div>

      {/* Under-chart stats */}
      {!loading && data && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Win %"
            value={pct(data.winRate)}
          />
          <StatCard
            label="Record"
            value={`${data.record.wins}–${data.record.losses}`}
          />
          <StatCard
            label="Pt Diff"
            value={sign(data.pointDifferential)}
          />
        </div>
      )}
    </div>
  );
}
