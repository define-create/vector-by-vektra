"use client";

interface Point {
  x: number;
  y: number;
}

function smoothPath(pts: Point[]): string {
  if (pts.length < 2) return "";
  const t = 0.4;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] ?? pts[i - 1]!;
    const p1 = pts[i - 1]!;
    const p2 = pts[i]!;
    const p3 = pts[i + 1] ?? pts[i]!;
    const cp1x = p1.x + (p2.x - p0.x) * t / 3;
    const cp1y = p1.y + (p2.y - p0.y) * t / 3;
    const cp2x = p2.x - (p3.x - p1.x) * t / 3;
    const cp2y = p2.y - (p3.y - p1.y) * t / 3;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

interface HistoryEntry {
  rating: number;
  outcome: "win" | "loss";
}

interface Props {
  history: HistoryEntry[];
}

export function TrajectoryGraph({ history }: Props) {
  const slice = history.slice(-10);
  if (slice.length < 2) return null;

  const ratings = slice.map((h) => h.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min;

  const pts: Point[] = slice.map((h, i) => {
    const x = slice.length === 1 ? 110 : 30 + (i / (slice.length - 1)) * 160;
    const y = range === 0 ? 35 : 62 - ((h.rating - min) / range) * 52;
    return { x, y };
  });

  const firstPt = pts[0]!;
  const lastPt = pts[pts.length - 1]!;
  const firstRating = Math.round(slice[0]!.rating);
  const lastRating = Math.round(slice[slice.length - 1]!.rating);

  const labelY1 = Math.max(12, Math.min(65, firstPt.y));
  const labelY2 = Math.max(12, Math.min(65, lastPt.y));

  return (
    <svg viewBox="0 0 220 70" width="100%" height="70">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke="#78716c"
        strokeWidth="2"
        filter="url(#glow)"
      />
      {slice.map((h, i) => {
        const pt = pts[i]!;
        const isLast = i === slice.length - 1;
        const isWin = h.outcome === "win";
        const fill = isLast
          ? isWin ? "#34d399" : "#fb7185"
          : isWin ? "#10b981" : "#f43f5e";
        return (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={isLast ? 5.5 : 4}
            fill={fill}
            filter="url(#glow)"
          />
        );
      })}
      <text x="2" y={labelY1} fontSize="10" fill="#71717a" dominantBaseline="middle">
        {firstRating}
      </text>
      <text x="218" y={labelY2} fontSize="10" fill="#71717a" textAnchor="end" dominantBaseline="middle">
        {lastRating}
      </text>
    </svg>
  );
}
