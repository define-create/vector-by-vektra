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
  userId: string | null;
  matchCount?: number;
  createdAt?: string;
}

interface UserResult {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  emailVerified: boolean;
  hasActivePlayer: boolean;
}

// ---------------------------------------------------------------------------
// Player search hook
// ---------------------------------------------------------------------------

function useUserSearch(q: string) {
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ q });
    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((d: { users: UserResult[] }) => setResults(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  return { results, loading };
}

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
      <OrphanedShadowsPanel />
      <MergePanel />
      <IdentityEditPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 0: Orphaned Shadows
// ---------------------------------------------------------------------------

function OrphanedShadowsPanel() {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchOrphaned = useCallback(() => {
    fetch("/api/admin/players?filter=orphaned")
      .then((r) => r.json())
      .then((d: { players: AdminPlayer[] }) => setPlayers(d.players ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchOrphaned(); }, [fetchOrphaned]);

  async function doBulkDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/players/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: players.map((p) => p.id) }),
      });
      const data = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
      } else {
        setSuccess(`Deleted ${data.deleted ?? players.length} orphaned shadow profiles.`);
        setConfirming(false);
        fetchOrphaned();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (players.length === 0 && !success) return null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-zinc-100">
        Orphaned Shadows{" "}
        {players.length > 0 && (
          <span className="ml-2 rounded-full bg-zinc-700 px-2 py-0.5 text-sm text-zinc-300">
            {players.length}
          </span>
        )}
      </h2>
      <p className="text-sm text-zinc-400">
        Unclaimed shadow profiles with no match history. Safe to delete — these are typically
        typos or test entries.
      </p>

      {players.length > 0 && (
        <ul className="flex flex-col gap-1">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-4 py-2 text-sm">
              <span className="text-zinc-200">{p.displayName}</span>
              <span className="text-zinc-500">
                Created {new Date(p.createdAt as unknown as string).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-sm text-rose-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-900/30 px-4 py-3 text-sm text-emerald-400">{success}</p>
      )}

      {players.length > 0 && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-xl bg-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-600"
        >
          Soft-delete all ({players.length})
        </button>
      )}

      {confirming && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-4 flex flex-col gap-3">
          <p className="text-sm text-amber-300">
            This will soft-delete <strong>{players.length}</strong> shadow profile
            {players.length !== 1 ? "s" : ""} with no match history. This cannot be undone from the UI.
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
              onClick={doBulkDelete}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}
    </section>
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingUnclaim, setConfirmingUnclaim] = useState(false);

  // Link to user state
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [linkConfirming, setLinkConfirming] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  const { results } = usePlayerSearch(selected ? "" : q);
  const { results: userResults, loading: userSearchLoading } = useUserSearch(
    selected && !selected.claimed && !selectedUser ? userQuery : "",
  );

  async function doUnclaim() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/players/${selected.id}/unclaim`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unclaim failed");
      } else {
        setSuccess(`Profile unclaimed successfully`);
        setSelected(null);
        setQ("");
        setNewName("");
        setConfirmingUnclaim(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrphaned() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/players/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [selected.id] }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
      } else {
        setSuccess(`Deleted "${selected.displayName}"`);
        setSelected(null);
        setQ("");
        setNewName("");
        setConfirmingDelete(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function doLink() {
    if (!selected || !selectedUser) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/admin/players/${selected.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setLinkError(data.error ?? "Link failed");
      } else {
        setLinkSuccess(`Linked "${selected.displayName}" to ${selectedUser.email}`);
        setSelected(null);
        setQ("");
        setNewName("");
        setSelectedUser(null);
        setUserQuery("");
        setLinkConfirming(false);
      }
    } catch {
      setLinkError("Network error");
    } finally {
      setLinkLoading(false);
    }
  }

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

          {selected.claimed && (
            <>
              {!confirmingUnclaim ? (
                <button
                  type="button"
                  onClick={() => setConfirmingUnclaim(true)}
                  className="self-start rounded-xl bg-amber-800 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Unclaim
                </button>
              ) : (
                <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-4 flex flex-col gap-3">
                  <p className="text-sm text-amber-300">
                    Remove <strong>{selected.displayName}</strong> from its linked user account?
                    The profile will revert to unclaimed and the user will lose access to their stats
                    until they re-claim it.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmingUnclaim(false)}
                      className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={doUnclaim}
                      className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {loading ? "Unclaiming…" : "Confirm Unclaim"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!selected.claimed && (selected.matchCount === 0 || selected.matchCount === undefined) && (
            <>
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="self-start rounded-xl bg-amber-800 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Delete
                </button>
              ) : (
                <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-4 flex flex-col gap-3">
                  <p className="text-sm text-amber-300">
                    Soft-delete <strong>{selected.displayName}</strong>? This profile has no match history.
                    This cannot be undone from the UI.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={deleteOrphaned}
                      className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {loading ? "Deleting…" : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Link to user account — only for unclaimed profiles */}
          {!selected.claimed && (
            <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800">
              <label className="text-sm font-medium text-zinc-400">Link to user account</label>

              {linkSuccess ? (
                <p className="rounded-lg bg-emerald-900/30 px-4 py-3 text-sm text-emerald-400">{linkSuccess}</p>
              ) : selectedUser ? (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 max-w-sm">
                    <div>
                      <p className="text-sm text-zinc-200">{selectedUser.email}</p>
                      <p className="text-xs text-zinc-500">@{selectedUser.handle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedUser(null); setLinkConfirming(false); setLinkError(null); }}
                      className="text-zinc-500 hover:text-zinc-300 ml-2"
                    >
                      ✕
                    </button>
                  </div>

                  {!linkConfirming ? (
                    <button
                      type="button"
                      onClick={() => setLinkConfirming(true)}
                      className="self-start rounded-xl bg-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-600"
                    >
                      Link profile →
                    </button>
                  ) : (
                    <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-4 flex flex-col gap-3 max-w-sm">
                      <p className="text-sm text-amber-300">
                        Link <strong>{selected.displayName}</strong> to{" "}
                        <strong>{selectedUser.email}</strong>? The profile will be marked as claimed
                        and the user will gain access to this match history.
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setLinkConfirming(false)}
                          className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={linkLoading}
                          onClick={doLink}
                          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          {linkLoading ? "Linking…" : "Confirm Link"}
                        </button>
                      </div>
                    </div>
                  )}

                  {linkError && (
                    <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-sm text-rose-400">{linkError}</p>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search user by email…"
                    className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none"
                  />
                  {userSearchLoading && <p className="text-xs text-zinc-500">Searching…</p>}
                  {!userSearchLoading && userQuery.trim() && userResults.length === 0 && (
                    <p className="text-xs text-zinc-500">No users found.</p>
                  )}
                  {userResults.length > 0 && (
                    <ul className="flex flex-col gap-1 max-w-sm">
                      {userResults.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            disabled={u.hasActivePlayer}
                            onClick={() => { setSelectedUser(u); setUserQuery(""); }}
                            className="flex w-full items-start justify-between rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2 text-left hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <div>
                              <p className="text-sm text-zinc-200">{u.email}</p>
                              <p className="text-xs text-zinc-500">@{u.handle}</p>
                            </div>
                            {u.hasActivePlayer && (
                              <span className="text-xs text-zinc-500 ml-2 shrink-0">(has profile)</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
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
