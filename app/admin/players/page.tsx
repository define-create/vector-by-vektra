"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  trustTier: string;
}

// ---------------------------------------------------------------------------
// Player search hook
// ---------------------------------------------------------------------------

function usePlayerSearch(q: string) {
  const [results, setResults] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ q });
    fetch(`/api/admin/players?${params}`)
      .then((r) => r.json())
      .then((d: { players: AdminPlayer[] }) => setResults(d.players ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  return { results, loading };
}

// ---------------------------------------------------------------------------
// AdminPlayersPage — two panels: Merge + Identity Edit
// ---------------------------------------------------------------------------

export default function AdminPlayersPage() {
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-bold text-zinc-50">Merge / Edit Players</h1>
      <MergePanel />
      <IdentityEditPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 1: Merge
// ---------------------------------------------------------------------------

function MergePanel() {
  const [keepQ, setKeepQ] = useState("");
  const [mergeQ, setMergeQ] = useState("");
  const [keepPlayer, setKeepPlayer] = useState<AdminPlayer | null>(null);
  const [mergePlayer, setMergePlayer] = useState<AdminPlayer | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { results: keepResults } = usePlayerSearch(keepPlayer ? "" : keepQ);
  const { results: mergeResults } = usePlayerSearch(mergePlayer ? "" : mergeQ);

  async function doMerge() {
    if (!keepPlayer || !mergePlayer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/players/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId: keepPlayer.id, mergeId: mergePlayer.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Merge failed");
      } else {
        setSuccess(`Merged "${mergePlayer.displayName}" into "${keepPlayer.displayName}"`);
        setKeepPlayer(null);
        setMergePlayer(null);
        setKeepQ("");
        setMergeQ("");
        setConfirming(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-zinc-100">Merge Players</h2>
      <p className="text-sm text-zinc-400">
        All match history from the merged profile is reassigned to the kept profile.
        The merged profile is soft-deleted.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <PlayerPickField
          label="Keep (primary)"
          query={keepQ}
          onQueryChange={setKeepQ}
          selected={keepPlayer}
          onSelect={setKeepPlayer}
          onClear={() => { setKeepPlayer(null); setKeepQ(""); }}
          results={keepResults}
          excludeId={mergePlayer?.id}
        />
        <PlayerPickField
          label="Merge (will be deleted)"
          query={mergeQ}
          onQueryChange={setMergeQ}
          selected={mergePlayer}
          onSelect={setMergePlayer}
          onClear={() => { setMergePlayer(null); setMergeQ(""); }}
          results={mergeResults}
          excludeId={keepPlayer?.id}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-sm text-rose-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-900/30 px-4 py-3 text-sm text-emerald-400">{success}</p>
      )}

      {keepPlayer && mergePlayer && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-xl bg-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-600"
        >
          Preview merge →
        </button>
      )}

      {confirming && keepPlayer && mergePlayer && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-4 flex flex-col gap-3">
          <p className="text-sm text-amber-300">
            Merge <strong>{mergePlayer.displayName}</strong> into{" "}
            <strong>{keepPlayer.displayName}</strong>?
            This reassigns all match history and soft-deletes the merged profile.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={doMerge}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {loading ? "Merging…" : "Confirm Merge"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel 2: Identity Edit
// ---------------------------------------------------------------------------

function IdentityEditPanel() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminPlayer | null>(null);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { results } = usePlayerSearch(selected ? "" : q);

  async function saveIdentity() {
    if (!selected || !newName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/players/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newName.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
      } else {
        setSuccess(`Updated "${selected.displayName}" → "${newName.trim()}"`);
        setSelected(null);
        setQ("");
        setNewName("");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-zinc-100">Edit Player Identity</h2>

      <PlayerPickField
        label="Select player"
        query={q}
        onQueryChange={setQ}
        selected={selected}
        onSelect={(p) => { setSelected(p); setNewName(p.displayName); }}
        onClear={() => { setSelected(null); setQ(""); setNewName(""); }}
        results={results}
      />

      {selected && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-zinc-400">New display name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-50 focus:border-zinc-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={loading || !newName.trim() || newName.trim() === selected.displayName}
            onClick={saveIdentity}
            className="self-start rounded-xl bg-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-sm text-rose-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-900/30 px-4 py-3 text-sm text-emerald-400">{success}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared player-pick field sub-component
// ---------------------------------------------------------------------------

function PlayerPickField({
  label,
  query,
  onQueryChange,
  selected,
  onSelect,
  onClear,
  results,
  excludeId,
}: {
  label: string;
  query: string;
  onQueryChange: (v: string) => void;
  selected: AdminPlayer | null;
  onSelect: (p: AdminPlayer) => void;
  onClear: () => void;
  results: AdminPlayer[];
  excludeId?: string;
}) {
  const filtered = results.filter((p) => p.id !== excludeId);

  return (
    <div className="flex flex-col gap-2 relative">
      <label className="text-sm font-medium text-zinc-400">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2">
          <span className="text-zinc-200">{selected.displayName}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-zinc-500 hover:text-zinc-300 ml-2"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search player…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none"
          />
          {filtered.length > 0 && (
            <ul className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
              {filtered.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    <span>{p.displayName}</span>
                    <span className="text-xs text-zinc-500">{Math.round(p.rating)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
