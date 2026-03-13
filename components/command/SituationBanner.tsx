import Link from "next/link";

type SituationState = "hot_streak" | "improving" | "stable" | "declining";

interface Props {
  state: SituationState | null;
  detail?: string;
}

const stateMap: Record<SituationState, { icon: string; label: string }> = {
  hot_streak: { icon: "🔥", label: "Hot streak" },
  improving: { icon: "▲", label: "Momentum improving" },
  stable: { icon: "─", label: "Momentum stable" },
  declining: { icon: "▼", label: "Momentum declining" },
};

export function SituationBanner({ state, detail }: Props) {
  const situation = state ? stateMap[state] : null;

  return (
    <div
      className={`mx-5 mt-3 rounded-xl bg-zinc-800/60 px-4 py-2.5 flex items-center gap-3 ${
        situation ? "justify-between" : "justify-end"
      }`}
    >
      {situation && (
        <div className="flex items-center gap-3">
          <span className="text-xl leading-none">{situation.icon}</span>
          <div>
            <p className="text-sm font-semibold text-zinc-100 leading-tight">{situation.label}</p>
            {detail && <p className="text-xs text-zinc-500 leading-tight">{detail}</p>}
          </div>
        </div>
      )}
      <Link href="/profile" aria-label="Profile" className="text-zinc-400 hover:text-zinc-200 flex-shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </Link>
    </div>
  );
}
