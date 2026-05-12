/**
 * Sticky banner shown to new users while the demo preview is active.
 * Locked styling per PRD §6. The banner is non-dismissable — it disappears
 * automatically once the user crosses the match threshold (PRD §4.5).
 */
export function PreviewBanner() {
  return (
    <div className="sticky top-0 z-20 mx-4 mt-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 flex items-start gap-3">
      <span className="text-amber-400 text-base leading-none mt-0.5">✦</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-100 leading-tight">Example dashboard</p>
        <p className="text-xs text-amber-200/70 leading-snug mt-0.5">
          This is what your dashboard will look like after a few matches. Start playing to make it yours.
        </p>
      </div>
    </div>
  );
}
