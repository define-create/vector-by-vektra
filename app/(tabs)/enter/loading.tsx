export default function EnterLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-5 pb-5 animate-pulse">
      {/* Admin toggle row */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-zinc-700" />
        <div className="h-6 w-11 rounded-full bg-zinc-800/40" />
      </div>

      {/* Text-mode toggle row */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-zinc-700" />
        <div className="h-6 w-11 rounded-full bg-zinc-800/40" />
      </div>

      {/* Team A card */}
      <div className="rounded-2xl border border-zinc-700/40 bg-zinc-800/40 px-4 py-4 flex flex-col gap-3">
        <div className="h-3 w-16 rounded bg-zinc-700" />
        <div className="flex gap-2">
          <div className="h-9 flex-1 rounded-xl bg-zinc-700/60" />
          <div className="h-9 flex-1 rounded-xl bg-zinc-700/60" />
        </div>
      </div>

      {/* Score input row */}
      <div className="flex items-center gap-3">
        <div className="h-12 flex-1 rounded-xl bg-zinc-800/40" />
        <div className="h-5 w-5 rounded bg-zinc-700" />
        <div className="h-12 flex-1 rounded-xl bg-zinc-800/40" />
      </div>

      {/* Team B card */}
      <div className="rounded-2xl border border-zinc-700/40 bg-zinc-800/40 px-4 py-4 flex flex-col gap-3">
        <div className="h-3 w-16 rounded bg-zinc-700" />
        <div className="flex gap-2">
          <div className="h-9 flex-1 rounded-xl bg-zinc-700/60" />
          <div className="h-9 flex-1 rounded-xl bg-zinc-700/60" />
        </div>
      </div>

      {/* Submit button */}
      <div className="h-12 rounded-xl bg-zinc-800/40" />
    </div>
  );
}
