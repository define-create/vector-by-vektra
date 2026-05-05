export default function TrajectoryLoading() {
  return (
    <div className="flex h-full flex-col animate-pulse">
      {/* Header row */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="h-6 w-32 rounded-xl bg-zinc-700" />
        <div className="h-8 w-24 rounded-full bg-zinc-800/40" />
      </div>

      {/* Chart placeholder */}
      <div className="mx-5 flex-1 rounded-2xl bg-zinc-800/40 min-h-64" />

      <div className="pb-5" />
    </div>
  );
}
