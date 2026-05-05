export default function StatsLoading() {
  return (
    <div className="flex flex-col animate-pulse">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 px-5">
        {[0, 1].map((i) => (
          <div key={i} className="flex-1 py-3 flex justify-center">
            <div className="h-4 w-16 rounded bg-zinc-700" />
          </div>
        ))}
      </div>

      <div className="px-5 pt-5 flex flex-col gap-4">
        {/* Stat cards */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-zinc-800/40 px-4 py-4">
            <div className="h-3 w-20 rounded bg-zinc-700 mb-3" />
            <div className="h-8 w-24 rounded bg-zinc-700/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
