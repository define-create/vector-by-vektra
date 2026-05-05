export default function ProfileLoading() {
  return (
    <div className="flex flex-col animate-pulse">
      {/* Title */}
      <div className="px-5 pt-6 pb-4">
        <div className="h-7 w-24 rounded-xl bg-zinc-700" />
      </div>

      {/* Settings rows */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="mx-5 mb-3 rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between"
        >
          <div className="h-4 w-28 rounded bg-zinc-700" />
          <div className="h-4 w-20 rounded bg-zinc-700/60" />
        </div>
      ))}
    </div>
  );
}
