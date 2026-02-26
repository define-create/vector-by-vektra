"use client";

import { useState } from "react";
import { type CommandFilter } from "@/lib/services/command";
import { FilterSheet } from "./FilterSheet";

interface Props {
  filter: CommandFilter | undefined;
}

function formatFilterLabel(filter: CommandFilter | undefined): string {
  if (!filter) return "All Matches";
  if (filter.tag) return filter.tag;
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (filter.from && filter.to) return `${fmt(filter.from)} – ${fmt(filter.to)}`;
  if (filter.from) return `From ${fmt(filter.from)}`;
  if (filter.to) return `Until ${fmt(filter.to)}`;
  return "All Matches";
}

export function FilterChip({ filter }: Props) {
  const [open, setOpen] = useState(false);
  const label = formatFilterLabel(filter);
  const isFiltered = !!filter;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
          isFiltered
            ? "bg-zinc-700 text-zinc-100 border border-zinc-600"
            : "bg-zinc-800/60 text-zinc-400 border border-zinc-700"
        }`}
      >
        <span>{label}</span>
        <span className="text-zinc-500 text-xs">▼</span>
      </button>

      <FilterSheet open={open} onClose={() => setOpen(false)} currentFilter={filter} />
    </>
  );
}
