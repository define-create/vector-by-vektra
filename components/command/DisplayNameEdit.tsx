"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  displayName: string;
}

export function DisplayNameEdit({ displayName }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setValue(displayName);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/players/me/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: value }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Save failed. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-300">{displayName}</span>
        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit display name"
          className="text-zinc-500 hover:text-zinc-300 text-base leading-none"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          maxLength={50}
          autoFocus
          className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !value.trim() || value.trim() === displayName}
          className="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-amber-400">{error}</p>}
    </div>
  );
}
