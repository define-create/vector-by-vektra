"use client";

import { useState, useEffect, useCallback } from "react";
import RecomputeModal from "@/components/admin/RecomputeModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RatingRun {
  id: string;
  runType: "nightly" | "admin";
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
}

interface LastRunsData {
  runs: RatingRun[];
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: RatingRun["status"] }) {
  const styles = {
    running: "bg-amber-900/30 text-amber-400",
    succeeded: "bg-emerald-900/30 text-emerald-400",
    failed: "bg-rose-900/30 text-rose-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AdminRecomputePage
// ---------------------------------------------------------------------------

export default function AdminRecomputePage() {
  const [runs, setRuns] = useState<RatingRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch recent runs from the audit/general admin endpoint
  // We'll query the rating runs directly via a lightweight dedicated query
  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recompute/runs");
      if (res.ok) {
        const data = (await res.json()) as LastRunsData;
        setRuns(data.runs ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Poll while a run is in progress
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running");
    if (!hasRunning) return;
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, [runs, fetchRuns]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function duration(start: string, end: string | null): string {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const hasRunning = runs.some((r) => r.status === "running");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-50">Recompute Ratings</h1>
        <button
          type="button"
          disabled={hasRunning}
          onClick={() => { setSuccessMsg(null); setShowModal(true); }}
          className="rounded-xl bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {hasRunning ? "Run in progress…" : "Trigger Recompute"}
        </button>
      </div>

      {hasRunning && (
        <div className="rounded-xl bg-amber-900/20 border border-amber-800/30 px-4 py-3 text-sm text-amber-300">
          A recompute is currently running. Refreshing every 5 seconds.
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-900/20 border border-emerald-800/30 px-4 py-3 text-sm text-emerald-300">
          {successMsg}
        </div>
      )}

      {/* Recent runs table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900">
            <tr>
              {["Started", "Type", "Status", "Duration", "Notes"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No runs yet
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                    {formatDate(run.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{run.runType}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {duration(run.startedAt, run.finishedAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{run.notes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <RecomputeModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            setSuccessMsg("Recompute started successfully.");
            fetchRuns();
          }}
        />
      )}
    </div>
  );
}
