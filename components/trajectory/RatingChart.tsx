"use client";

import { useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { CategoricalChartFunc } from "recharts/types/chart/types";

interface RatingPoint {
  matchDate: string;
  rating: number;
}

interface RatingChartProps {
  ratingSeries: RatingPoint[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function RatingChart({ ratingSeries }: RatingChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (ratingSeries.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500 text-sm">
        No rating data yet
      </div>
    );
  }

  const data = ratingSeries.map((p) => ({
    date: formatDate(p.matchDate),
    rating: Math.round(p.rating),
  }));

  const ratings = data.map((d) => d.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const padding = Math.max(20, (maxRating - minRating) * 0.2);
  const yMin = Math.floor((minRating - padding) / 10) * 10;
  const yMax = Math.ceil((maxRating + padding) / 10) * 10;

  const displayIndex = activeIndex !== null ? activeIndex : data.length - 1;
  const displayPoint = data[displayIndex];

  // Desktop: Recharts events give the exact snapped data index
  const handleMouseMove: CategoricalChartFunc = (state) => {
    const idx = state.activeTooltipIndex;
    if (typeof idx === "number") setActiveIndex(idx);
  };
  const handleMouseLeave: CategoricalChartFunc = () => setActiveIndex(null);

  // Mobile: native touch events on the wrapper div.
  // onTouchMove in Recharts only fires when the finger moves — a simple tap never
  // triggers it. We handle touch here instead and persist the selection after lift
  // (no reset on touchend) so users can read the value without holding their finger.
  function indexFromClientX(clientX: number): number {
    if (!wrapRef.current || data.length <= 1) return data.length - 1;
    const rect = wrapRef.current.getBoundingClientRect();
    // Plot area starts after YAxis (width=40) and ends before margin.right (8)
    const plotLeft = rect.left + 40;
    const plotRight = rect.right - 8;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const fraction = Math.max(0, Math.min(1, (clientX - plotLeft) / plotWidth));
    return Math.round(fraction * (data.length - 1));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Info row — updates on hover/touch; defaults to latest point */}
      <div className="flex items-baseline gap-2 px-2">
        <span className="text-sm text-zinc-500">{displayPoint.date}</span>
        <span className="text-sm text-zinc-500">Rating</span>
        <span className="text-xl font-bold tabular-nums text-zinc-50">
          {displayPoint.rating}
        </span>
      </div>

      <div
        ref={wrapRef}
        onTouchStart={(e) => setActiveIndex(indexFromClientX(e.touches[0].clientX))}
      >
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="#e4e4e7"
              strokeWidth={2}
              dot={ratingSeries.length <= 15}
              activeDot={{ r: 4, fill: "#f4f4f5" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
