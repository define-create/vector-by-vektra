export default function MatchupsLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-5 pb-5 animate-pulse">
      {/* Player pair selector */}
      <div className="flex items-center gap-3">
        {/* Team A cards */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-14 rounded-xl bg-zinc-800/40" />
          <div className="h-14 rounded-xl bg-zinc-800/40" />
        </div>

        {/* VS divider */}
        <div className="h-5 w-8 rounded bg-zinc-700 shrink-0" />

        {/* Team B cards */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-14 rounded-xl bg-zinc-800/40" />
          <div className="h-14 rounded-xl bg-zinc-800/40" />
        </div>
      </div>

      {/* Results area */}
      <div className="h-40 rounded-2xl bg-zinc-800/40" />
    </div>
  );
}
