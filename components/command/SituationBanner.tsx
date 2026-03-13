type SituationState = "hot_streak" | "improving" | "stable" | "declining";

interface Props {
  state: SituationState;
  detail: string;
}

const stateMap: Record<SituationState, { icon: string; label: string }> = {
  hot_streak: { icon: "🔥", label: "Hot streak" },
  improving: { icon: "▲", label: "Momentum improving" },
  stable: { icon: "─", label: "Momentum stable" },
  declining: { icon: "▼", label: "Momentum declining" },
};

export function SituationBanner({ state, detail }: Props) {
  const { icon, label } = stateMap[state];
  return (
    <div className="mx-5 mt-3 rounded-xl bg-zinc-800/60 px-4 py-2.5 flex items-center gap-3">
      <span className="text-xl leading-none">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-zinc-100 leading-tight">{label}</p>
        <p className="text-xs text-zinc-500 leading-tight">{detail}</p>
      </div>
    </div>
  );
}
