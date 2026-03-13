import { type LastMatch } from "@/lib/services/command";

interface Props {
  matches: LastMatch[];
}

export function RecentPerformanceDots({ matches }: Props) {
  const slice = matches.slice(0, 7);
  if (slice.length === 0) return null;

  const xs = slice.map((_, i) =>
    slice.length === 1 ? 110 : 15 + (i / (slice.length - 1)) * 190,
  );

  return (
    <svg viewBox="0 0 220 32" width="100%" height="32">
      <defs>
        <filter id="glow-dots">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {slice.map((m, i) => {
        if (i === 0) return null;
        const x1 = xs[i - 1]!;
        const x2 = xs[i]!;
        return (
          <line
            key={`line-${i}`}
            x1={x1}
            y1="11"
            x2={x2}
            y2="11"
            stroke="#3f3f46"
            strokeWidth="1"
          />
        );
      })}
      {slice.map((m, i) => {
        const isLast = i === slice.length - 1;
        const isWin = m.outcome === "win";
        const fill = isLast
          ? isWin ? "#34d399" : "#fb7185"
          : isWin ? "#10b981" : "#f43f5e";
        const x = xs[i]!;
        return (
          <g key={`dot-${i}`}>
            <circle cx={x} cy="11" r="5" fill={fill} filter="url(#glow-dots)" />
            <text x={x} y="28" fontSize="9" textAnchor="middle" fill={fill}>
              {isWin ? "W" : "L"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
