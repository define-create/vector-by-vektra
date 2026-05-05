export const METRIC_INFO = {
  rating: {
    label: "Rating",
    body: "Your rating is a number that represents your current skill level, calculated from every match you've played. Players start at 1000. Winning against stronger opponents raises it more; losing to weaker opponents drops it more. The higher your rating, the stronger the system considers you.",
  },
  winPct: {
    label: "Win Rate or %",
    body: "The percentage of matches you won. A 50% win rate means you're winning and losing about equally. Above 50% means you're outperforming expectations. Use the filter chip on Home screen to scope this to a specific period or event.",
  },
  ci: {
    label: "Form",
    body: "Measures whether your recent improvements are building on each other or just oscillating. A positive number means your wins are producing increasingly larger rating gains — your momentum is reinforcing. A negative number means losses are outpacing gains. Near zero means your results are flat or random.",
  },
  drift: {
    label: "Stability or Drift Score",
    body: "Measures how much your actual results diverge from what the rating model predicts. A positive Drift means you're consistently winning more than expected — your rating is likely to rise soon. A negative Drift means you're losing more than expected — a rating drop may follow.",
  },
  winProb: {
    label: "Next Match Win Probability",
    body: "An estimate of your chances of winning your next match, based on your rating versus the opponents you've faced recently. For a more precise prediction against a specific lineup, long-press any match in the Recent Matches list, or go to Stats → Matchup and select the teams manually.",
  },
} as const;

export function pct(value: number | null, decimals = 0): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function signedFixed(value: number | null, decimals = 1): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

export function ciToFormState(ci: number | null): { label: string; colorClass: string } {
  if (ci === null) return { label: "—", colorClass: "text-zinc-500" };
  if (ci > 20) return { label: "Strong", colorClass: "text-emerald-400" };
  if (ci < -20) return { label: "Fading", colorClass: "text-rose-400" };
  return { label: "Steady", colorClass: "text-zinc-300" };
}
