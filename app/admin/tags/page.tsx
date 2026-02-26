"use client";

import { useState, useEffect, useCallback } from "react";

interface TagRow {
  tag: string;
  count: number;
}

export default function AdminTagsPage() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Rename form state
  const [fromTag, setFromTag] = useState("");
  const [toTag, setToTag] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameResult, setRenameResult] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tags");
      const data = await res.json() as { tags: TagRow[] };
      setTags(data.tags ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTags(); }, [loadTags]);

  async function handleRename() {
    if (!fromTag.trim() || !toTag.trim()) return;
    setRenaming(true);
    setRenameResult(null);
    setRenameError(null);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromTag.trim(), to: toTag.trim() }),
      });
      const data = await res.json() as { ok?: boolean; matchesUpdated?: number; error?: string };
      if (!res.ok) {
        setRenameError(data.error ?? "Rename failed");
      } else {
        setRenameResult(`Done — ${data.matchesUpdated ?? 0} match(es) updated`);
        setFromTag("");
        setToTag("");
        await loadTags();
      }
    } catch {
      setRenameError("Network error");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Tags</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage event tags across all matches. Renaming a tag updates every match that carries it.
          To merge two tags, rename the source to the target name.
        </p>
      </div>

      {/* Tag list */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="px-4 py-3 font-medium text-zinc-400">Tag</th>
              <th className="px-4 py-3 font-medium text-zinc-400 text-right">Matches</th>
              <th className="px-4 py-3 font-medium text-zinc-400">
                <span className="sr-only">Use</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && tags.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                  No tags yet. Tags are added when players enter matches.
                </td>
              </tr>
            )}
            {!loading && tags.map((row) => (
              <tr key={row.tag} className="border-t border-zinc-800/60">
                <td className="px-4 py-3 text-zinc-200">{row.tag}</td>
                <td className="px-4 py-3 text-zinc-400 text-right tabular-nums">{row.count}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setFromTag(row.tag)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Rename →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rename / merge form */}
      <div className="rounded-xl border border-zinc-800 p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">
          Rename / Merge
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">From</label>
            <input
              type="text"
              value={fromTag}
              onChange={(e) => { setFromTag(e.target.value); setRenameResult(null); setRenameError(null); }}
              placeholder="Existing tag name"
              list="tag-list"
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">To</label>
            <input
              type="text"
              value={toTag}
              onChange={(e) => { setToTag(e.target.value); setRenameResult(null); setRenameError(null); }}
              placeholder="New tag name"
              list="tag-list"
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Datalist for autocomplete */}
        <datalist id="tag-list">
          {tags.map((row) => <option key={row.tag} value={row.tag} />)}
        </datalist>

        <button
          type="button"
          onClick={handleRename}
          disabled={renaming || !fromTag.trim() || !toTag.trim() || fromTag.trim() === toTag.trim()}
          className="self-start rounded-lg bg-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
        >
          {renaming ? "Renaming…" : "Apply Rename"}
        </button>

        {renameResult && <p className="text-sm text-emerald-400">{renameResult}</p>}
        {renameError && <p className="text-sm text-amber-400">{renameError}</p>}
      </div>
    </div>
  );
}
