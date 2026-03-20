import { MetricInfoSheet } from "@/components/command/MetricInfoSheet";

interface Props {
  label: string;
  value: string;
  valueColor?: string;
  secondaryValue?: string;
  delta: number | null;
  deltaUnit?: string;
  history: number[];
  highlighted: boolean;
  info: { label: string; body: string };
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 36 + 2;
      const y = range === 0 ? 7 : 12 - ((v - min) / range) * 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 40 14" width="40" height="14">
      <polyline
        points={pts}
        fill="none"
        stroke="#52525b"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DriverTile({
  label,
  value,
  valueColor = "text-zinc-100",
  secondaryValue,
  delta,
  deltaUnit = "",
  history,
  highlighted,
  info,
}: Props) {
  const borderClass = highlighted ? "border border-zinc-500" : "border border-transparent";

  let deltaIcon = "─";
  let deltaColorClass = "text-zinc-500";
  let deltaText = "";
  if (delta !== null && delta !== 0) {
    if (delta > 0) {
      deltaIcon = "↑";
      deltaColorClass = "text-emerald-500";
      deltaText = `+${delta.toFixed(1)}${deltaUnit}`;
    } else {
      deltaIcon = "↓";
      deltaColorClass = "text-rose-400";
      deltaText = `${delta.toFixed(1)}${deltaUnit}`;
    }
  }

  return (
    <div
      className={`rounded-xl bg-zinc-800/60 px-2.5 py-2.5 flex flex-col gap-1 ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 leading-tight">{label}</span>
        <MetricInfoSheet metric={info} />
      </div>
      <p className={`text-xl font-bold leading-tight tabular-nums ${valueColor}`}>{value}</p>
      {secondaryValue !== undefined && (
        <p className="text-xs text-zinc-500 leading-none -mt-0.5">{secondaryValue}</p>
      )}
      <p className={`text-xs leading-none ${deltaColorClass}`}>
        {deltaIcon}{deltaText ? ` ${deltaText}` : ""}
      </p>
      <MiniSparkline values={history} />
    </div>
  );
}
