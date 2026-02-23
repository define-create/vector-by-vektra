"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

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

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
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
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            color: "#f4f4f5",
            fontSize: 12,
          }}
          labelStyle={{ color: "#a1a1aa" }}
          itemStyle={{ color: "#f4f4f5" }}
          formatter={(value: number | undefined) => [value ?? "—", "Rating"]}
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
  );
}
