"use client";

/** Quiet Pro gate: a disabled search input with a small Pro label. */
export default function ProGate() {
  return (
    <div className="relative">
      <input
        type="text"
        disabled
        placeholder="Search any player…"
        aria-label="Player search (Pro only)"
        className="w-full cursor-not-allowed rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-600 placeholder-zinc-700"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-400">
        Pro
      </span>
    </div>
  );
}
