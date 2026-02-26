"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { type CommandFilter } from "@/lib/services/command";

interface Props {
  open: boolean;
  onClose: () => void;
  currentFilter: CommandFilter | undefined;
}

type Tab = "date" | "tag";

function toDateInput(d: Date | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function FilterSheet({ open, onClose, currentFilter }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(currentFilter?.tag ? "tag" : "date");

  // Date range state
  const [from, setFrom] = useState(toDateInput(currentFilter?.from));
  const [to, setTo] = useState(toDateInput(currentFilter?.to));

  // Tag state
  const [selectedTag, setSelectedTag] = useState(currentFilter?.tag ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  // Reset local state when sheet opens
  useEffect(() => {
    if (open) {
      setTab(currentFilter?.tag ? "tag" : "date");
      setFrom(toDateInput(currentFilter?.from));
      setTo(toDateInput(currentFilter?.to));
      setSelectedTag(currentFilter?.tag ?? "");
    }
  }, [open, currentFilter]);

  // Load tags when sheet opens on the tag tab (lazy)
  useEffect(() => {
    if (open && !tagsLoaded) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data: { tags: string[] }) => {
          setTags(data.tags ?? []);
          setTagsLoaded(true);
        })
        .catch(() => setTagsLoaded(true));
    }
  }, [open, tagsLoaded]);

  function applyFilter() {
    const params = new URLSearchParams();
    if (tab === "date") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    } else {
      if (selectedTag) params.set("tag", selectedTag);
    }
    const qs = params.toString();
    router.push(qs ? `/command?${qs}` : "/command");
    onClose();
  }

  function clearFilter() {
    router.push("/command");
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop — above the fixed bottom nav (z-50) */}
      <div
        className="fixed inset-0 z-[60] bg-black/60"
        onClick={onClose}
      />

      {/* Sheet — above backdrop and nav */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-2xl bg-zinc-900 border-t border-zinc-700 px-5 pt-5 flex flex-col gap-5"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-zinc-600 mx-auto -mt-1" />

        {/* Tab bar */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("date")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === "date"
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            Date Range
          </button>
          <button
            type="button"
            onClick={() => setTab("tag")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === "tag"
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            Event Tag
          </button>
        </div>

        {/* Date Range panel */}
        {tab === "date" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-zinc-50 focus:border-zinc-400 focus:outline-none text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-zinc-50 focus:border-zinc-400 focus:outline-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Event Tag panel */}
        {tab === "tag" && (
          <div className="flex flex-col gap-2">
            {!tagsLoaded && (
              <p className="text-sm text-zinc-500">Loading…</p>
            )}
            {tagsLoaded && tags.length === 0 && (
              <p className="text-sm text-zinc-500">No event tags found. Add a tag when entering a match.</p>
            )}
            {tagsLoaded && tags.length > 0 && (
              <ul className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {tags.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => setSelectedTag(t === selectedTag ? "" : t)}
                      className={`w-full text-left rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                        selectedTag === t
                          ? "bg-zinc-600 text-zinc-100 border border-zinc-500"
                          : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                      }`}
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={clearFilter}
            className="flex-1 rounded-lg border border-zinc-600 px-4 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Clear Filter
          </button>
          <button
            type="button"
            onClick={applyFilter}
            className="flex-1 rounded-lg bg-zinc-700 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-600 active:bg-zinc-500 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
