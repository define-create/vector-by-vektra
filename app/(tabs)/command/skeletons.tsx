export function RatingCardSkeleton() {
  return (
    <div className="flex flex-col items-center pt-3 pb-1 px-5 animate-pulse">
      <div className="h-3 w-12 rounded bg-zinc-700 mb-3" />
      <div className="h-16 w-36 rounded-xl bg-zinc-800/40 mb-3" />
      <div className="h-10 w-full max-w-xs rounded-xl bg-zinc-800/40 mb-2" />
      <div className="h-4 w-48 rounded bg-zinc-700/60" />
    </div>
  );
}

export function DriversGridSkeleton() {
  return (
    <div className="px-5 pb-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-zinc-700 mb-2" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800/40" />
        ))}
      </div>
    </div>
  );
}

export function MatchHistorySectionSkeleton() {
  return (
    <div className="px-5 pb-5 flex flex-col gap-4 pt-4 animate-pulse">
      <div className="h-8 w-28 rounded-full bg-zinc-800/40" />
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 w-5 rounded-full bg-zinc-700" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-zinc-800/40" />
      ))}
    </div>
  );
}

export function EditTimerLinkSkeleton() {
  return (
    <div className="px-5 pb-5 animate-pulse">
      <div className="h-12 rounded-xl bg-zinc-800/40" />
    </div>
  );
}
