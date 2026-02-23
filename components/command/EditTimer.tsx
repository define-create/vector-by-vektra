"use client";

import { useState, useEffect } from "react";

interface EditTimerProps {
  /** ISO timestamp when the edit window expires */
  expiresAt: string;
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "Locked";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Editable for ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function EditTimer({ expiresAt }: EditTimerProps) {
  const expiry = new Date(expiresAt).getTime();

  // null on server/first render to avoid SSR↔client hydration mismatch from Date.now()
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    function tick() {
      const remaining = expiry - Date.now();
      setLabel(formatCountdown(remaining));
      if (remaining <= 0) {
        clearInterval(id);
      }
    }

    const id = setInterval(tick, 1000);
    tick(); // immediate first render on client

    return () => clearInterval(id);
  }, [expiry]);

  if (label === null) return null;

  if (label === "Locked") {
    return (
      <span className="text-sm font-medium text-zinc-500">Locked</span>
    );
  }

  return (
    <span className="text-sm font-medium text-amber-400">{label}</span>
  );
}
