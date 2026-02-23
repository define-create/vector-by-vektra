"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchPlayer {
  id: string;
  displayName: string;
}

interface GameScore {
  id: string;
  gameOrder: number;
  team1Score: number;
  team2Score: number;
}

interface AdminMatch {
  id: string;
  matchDate: string;
  createdAt: string;
  voidedAt: string | null;
  team1: MatchPlayer[];
  team2: MatchPlayer[];
  games: GameScore[];
  enteredBy: { id: string; handle: string };
}

// ---------------------------------------------------------------------------
// AdminMatchesPage
// ---------------------------------------------------------------------------

export default function AdminMatchesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Confirm dialog state
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchMatches = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (debouncedQ) params.set("q", debouncedQ);

    fetch(`/api/admin/matches?${params}`)
      .then((r) => r.json())
      .then((data: { matches: AdminMatch[]; pagination: { total: number } }) => {
        setMatches(data.matches ?? []);
        setTotal(data.pagination?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedQ, page]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  async function voidMatch(id: string) {
    setVoidingId(id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/matches/${id}/void`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to void match");
      } else {
        fetchMatches();
      }
    } catch {
      setErrorMsg("Network error");
    } finally {
      setVoidingId(null);
      setConfirmId(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function gameScore(games: GameScore[]) {
    return games
      .sort((a, b) => a.gameOrder - b.gameOrder)
      .map((g) => `${g.team1Score}–${g.team2Score}`)
      .join(", ");
  }

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-zinc-50">Void Matches</h1>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by player name…"
        className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none"
      />

      {errorMsg && (
        <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-rose-400">{errorMsg}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900">
            <tr>
              {["Date", "Team 1", "Team 2", "Score", "Entered by", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : matches.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No matches found
                </td>
              </tr>
            ) : (
              matches.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className="px-4 py-3 text-zinc-300">{formatDate(m.matchDate)}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {m.team1.map((p) => p.displayName).join(" & ")}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {m.team2.map((p) => p.displayName).join(" & ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{gameScore(m.games)}</td>
                  <td className="px-4 py-3 text-zinc-400">{m.enteredBy.handle}</td>
                  <td className="px-4 py-3">
                    {m.voidedAt ? (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                        Voided
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!m.voidedAt && (
                      <button
                        type="button"
                        onClick={() => setConfirmId(m.id)}
                        className="rounded-lg border border-rose-800 px-3 py-1 text-xs text-rose-400 hover:bg-rose-900/30"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-50">Void this match?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              This cannot be undone without an admin recompute. The match will be excluded
              from all future rating calculations.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="flex-1 rounded-xl border border-zinc-600 py-2 text-sm text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!voidingId}
                onClick={() => voidMatch(confirmId)}
                className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {voidingId ? "Voiding…" : "Void Match"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
