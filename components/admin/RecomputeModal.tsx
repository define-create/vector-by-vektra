"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Reason options (stored in RatingRuns.notes)
// ---------------------------------------------------------------------------

const REASONS = [
  "Merge",
  "Void match",
  "Identity correction",
  "Other",
] as const;

type Reason = (typeof REASONS)[number];

interface RecomputeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecomputeModal({ onClose, onSuccess }: RecomputeModalProps) {
  const [reason, setReason] = useState<Reason | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    if (!reason) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runType: "admin", notes: reason }),
      });
      const data = (await res.json()) as { error?: string; runId?: string };

      if (!res.ok) {
        setError(data.error ?? "Recompute failed to start");
      } else {
        onSuccess();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-50">Trigger Recompute</h2>
        <p className="mt-1 text-sm text-zinc-400">
          This rewrites ratings and snapshots for all players.
        </p>

        {/* Reason dropdown */}
        <div className="mt-5 flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-400">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as Reason | "")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 focus:border-zinc-400 focus:outline-none"
          >
            <option value="">Select a reason…</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-900/30 px-3 py-2 text-sm text-rose-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-600 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason || loading}
            onClick={trigger}
            className="flex-1 rounded-xl bg-zinc-100 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Starting…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
