"use client";

import { useState, useEffect } from "react";

interface TagSelectorProps {
  value: string | null;
  onChange: (tag: string) => void;
}

export function TagSelector({ value, onChange }: TagSelectorProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data: { tags: string[] }) => setTags(data.tags ?? []))
      .catch(() => {});
  }, []);

  const filtered = query
    ? tags.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : tags;

  function select(tag: string) {
    setQuery(tag);
    setOpen(false);
    onChange(tag);
  }

  return (
    <div className="relative">
      <label className="text-sm uppercase tracking-widest text-zinc-500 mb-2 block">
        Event Tag
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search or select an event…"
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
      />

      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 py-1 shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onMouseDown={() => select(tag)}
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
