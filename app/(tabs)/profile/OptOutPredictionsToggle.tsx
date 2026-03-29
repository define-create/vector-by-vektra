"use client";

import { useState } from "react";
import { MetricInfoSheet } from "@/components/command/MetricInfoSheet";

const PREDICTION_INFO = {
  label: "Match Predictions",
  body: "When enabled, other players can include you in Matchup Predictions to see win probabilities. If you turn this off, your profile will still appear in search results but cannot be added to others' predictions. Your own Command screen projections are unaffected.",
};

interface Props {
  optOutPredictions: boolean;
}

export function OptOutPredictionsToggle({ optOutPredictions }: Props) {
  const [optedOut, setOptedOut] = useState(optOutPredictions);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !optedOut;
    setOptedOut(next);
    setSaving(true);
    try {
      await fetch("/api/players/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optOutPredictions: next }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="predictions-opt-in"
        checked={!optedOut}
        onChange={toggle}
        disabled={saving}
        className="h-4 w-4 rounded accent-zinc-300 cursor-pointer"
      />
      <label
        htmlFor="predictions-opt-in"
        className="text-sm text-zinc-200 cursor-pointer select-none"
      >
        Include me in predictions
      </label>
      <MetricInfoSheet metric={PREDICTION_INFO} />
    </div>
  );
}
