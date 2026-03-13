## Relevant Files

- `lib/services/command.ts` - Data service: add `ratingHistory`, `situationState`, `situationDetail`, `driverHistory`, `driverDeltas`, `dominantDriver` to `CommandData`.
- `app/(tabs)/command/page.tsx` - Main page: restructure pinned + scrollable layout, wire up all new components.
- `components/command/SituationBanner.tsx` - **NEW** — banner showing performance state (improving / declining / hot streak / stable).
- `components/command/TrajectoryGraph.tsx` - **NEW** — client component: smooth bezier SVG sparkline with glow filter and rating labels.
- `components/command/RecentPerformanceDots.tsx` - **NEW** — SVG W/L dot pattern with glow, shown in scrollable section.
- `components/command/DriverTile.tsx` - **NEW** — replaces `MetricCard`; includes inline `MiniSparkline`. Used for Win Rate, Form (CI), and Stability (Drift) tiles.
- `components/command/RatingContext.tsx` - **MODIFIED** — remove progress bar; replace with two plain-text lines.
- `components/nav/BottomNav.tsx` - **MODIFIED** — add icons above labels; Enter tab brighter; Trajectory tab gets inline SVG wavy-line icon.

### Notes

- Unit tests are not required for visual SVG components in this task. Focus is on correctness verified manually in the browser.
- Run the dev server with `npm run dev` and open the app on a 375px-wide viewport (use Chrome DevTools device toolbar).
- Reference mockup: open `mockups/command-screen.html` in a browser for side-by-side comparison.
- PRD: `tasks/prd-command-screen-ux-improvements.md`
- Use `npx jest` to run any existing tests and confirm nothing is broken after changes.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after completing a parent task.

---

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/command-screen-ux`

- [x] 1.0 Extend the data service with new computed fields
  - [x] 1.1 In `lib/services/command.ts`, add the following to the `CommandData` interface:
    ```ts
    ratingHistory: { date: string; rating: number; outcome: "win" | "loss" }[];
    situationState: "hot_streak" | "improving" | "stable" | "declining" | null;
    situationDetail: string;
    driverHistory: {
      winRateHistory: number[];
      ciHistory: number[];
      driftHistory: number[];
    };
    driverDeltas: {
      winRateDelta: number | null;
      ciDelta: number | null;
      driftDelta: number | null;
    };
    dominantDriver: "winRate" | "ci" | "drift" | null;
    ```
  - [x] 1.2 Add all new fields to the `empty` object with safe defaults (`[]`, `null`, `""`, `{ winRateHistory: [], ciHistory: [], driftHistory: [] }`, `{ winRateDelta: null, ciDelta: null, driftDelta: null }`).
  - [x] 1.3 Build `ratingHistory` (chronological) from the existing `histAsc` array and `snapshotRatingByMatchId` map — no new DB query needed. For each entry in `histAsc`, look up the snapshot rating, compute win/loss outcome using the same game-score logic already used for `recentMatchHistory`, and push `{ date, rating, outcome }`. Filter out entries where the snapshot is missing.
  - [x] 1.4 Compute `situationState` and `situationDetail` from `recentMatchHistory` (already computed above it). Rules (evaluated in order):
    - Count consecutive wins from the start of the array (most recent first)
    - ≥ 5 consecutive wins → `hot_streak`, detail: `"N wins in a row"`
    - ≥ 4 wins in last 5 matches → `improving`, detail: `"N wins in last 5 matches"`
    - ≤ 1 win in last 5 matches (requires ≥ 3 matches total) → `declining`, detail: `"N losses in last 5 matches"`
    - Otherwise → `stable`, detail: `"N wins in last 5 matches"`
    - If fewer than 3 matches total → `situationState = null`, `situationDetail = ""`
  - [x] 1.5 Compute `driverHistory.winRateHistory`: iterate `i` from `4` to `Math.min(9, histAsc.length - 1)`, computing win rate over `histAsc[i-4 .. i]` (5 matches per window). Produces up to 5 values (0–1 scale).
  - [x] 1.6 Compute `driverHistory.ciHistory`: iterate `i` from `9` to `Math.min(19, snapsAsc.length - 1)` stepped by 2, calling `computeCI(snapsAsc.slice(i - 9, i + 1))` per window. Produces up to 5 values. Skip if `snapsAsc.length < 10`.
  - [x] 1.7 Compute `driverHistory.driftHistory`: same sliding window as 1.6 but calling `computeDriftScore(snapsAsc.slice(i-9, i+1), actuals)` where `actuals` is the binary win/loss array for that window slice. Produces up to 5 values.
  - [x] 1.8 Compute `driverDeltas`: for each history array, delta = `last - secondToLast`. Set to `null` if the array has fewer than 2 values.
  - [x] 1.9 Compute `dominantDriver`: compare `Math.abs(winRateDelta * 100)`, `Math.abs(ciDelta)`, `Math.abs(driftDelta)` (treat null as 0). Return the key with the largest value, or `null` if all deltas are null.
  - [x] 1.10 Add all new fields (`ratingHistory`, `situationState`, `situationDetail`, `driverHistory`, `driverDeltas`, `dominantDriver`) to the `return` statement at the bottom of `getCommandData`.

- [x] 2.0 Create new UI components
  - [x] 2.1 Create `components/command/SituationBanner.tsx` (server-renderable):
    - Props: `state: "hot_streak" | "improving" | "stable" | "declining"`, `detail: string`
    - Render: icon + state label (headline) + detail (subline) inside a rounded card
    - Icon/label map: `hot_streak` → 🔥 "Hot streak", `improving` → ▲ "Momentum improving", `stable` → ─ "Momentum stable", `declining` → ▼ "Momentum declining"
    - Style: `mx-5 mt-3 rounded-xl bg-zinc-800/60 px-4 py-2.5 flex items-center gap-3`
  - [x] 2.2 Create `components/command/TrajectoryGraph.tsx` (`"use client"`):
    - Props: `history: { rating: number; outcome: "win" | "loss" }[]`
    - Show last 10 entries (`history.slice(-10)`)
    - SVG `viewBox="0 0 220 70"`, `width="100%"`, `height="70"`
    - Reserve x `[30, 190]` for the graph area; x `[0, 30]` and `[190, 220]` for rating labels
    - Normalise Y: `y = 62 - ((rating - min) / Math.max(1, range)) * 52`; if `range === 0` set all points to `y = 35`
    - Space X evenly across `[30, 190]`
    - Add SVG glow filter in `<defs>`: `<filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    - Build a smooth bezier path using catmull-rom → cubic bezier conversion (tension `0.4`): a helper `smoothPath(pts: {x,y}[])` returns an SVG `d` string using `M` + repeated `C` commands. Apply `filter="url(#glow)"` to the `<path>`.
    - For each point, render a `<circle>` with `r="4"`, fill emerald-500 (win) or rose-500 (loss), `filter="url(#glow)"`. Last point: `r="5.5"`, fill emerald-400 or rose-400.
    - Render rating labels: oldest rating at `x="2"` aligned to first point's y (clamped to `[12, 65]`), current rating at `x="218"` aligned to last point's y (clamped). Both `fontSize="10"`, `fill="#71717a"`.
  - [x] 2.3 Create `components/command/RecentPerformanceDots.tsx` (server-renderable):
    - Props: `matches: LastMatch[]` (import type from `lib/services/command`)
    - Show first 7 entries (`matches.slice(0, 7)`)
    - Single SVG `viewBox="0 0 220 32"`, `width="100%"`, `height="32"`
    - Add glow filter in `<defs>` with `id="glow-dots"` (same structure as TrajectoryGraph but `stdDeviation="1.8"` — use a different id to avoid collision)
    - Space 7 dot x-positions evenly across `[15, 205]`
    - For each dot: `<circle>` at `y="11"`, `r="5"`, fill emerald-500 (win) / rose-500 (loss); last dot fill emerald-400 / rose-400. Apply `filter="url(#glow-dots)"`.
    - Between adjacent dots: `<line>` at `y1="11" y2="11"`, `stroke="#3f3f46"`, `strokeWidth="1"`
    - Below each dot at `y="28"`: `<text>` "W" or "L", `fontSize="9"`, `textAnchor="middle"`, fill matching the dot colour
  - [x] 2.4 Create `components/command/DriverTile.tsx` (server-renderable):
    - Props: `label: string`, `value: string`, `valueColor?: string` (Tailwind class, defaults to `text-zinc-100`), `secondaryValue?: string`, `delta: number | null`, `deltaUnit?: string`, `history: number[]`, `highlighted: boolean`, `info: { label: string; body: string }`
    - Layout (top to bottom): label row (label + ⓘ icon), primary value, optional secondary value, delta row, mini sparkline
    - Border: `border border-zinc-500` if `highlighted`, else `border border-transparent`
    - Delta display: `↑` + `text-emerald-500` if `delta > 0`; `↓` + `text-rose-400` if `delta < 0`; `─` + `text-zinc-500` if `delta === 0 || delta === null`. Show signed value + optional unit.
    - Inline `MiniSparkline`: only rendered if `history.length >= 2`. SVG `viewBox="0 0 40 14"`, `width="40"`, `height="14"`. Normalise values to y range `[2, 12]`. `<polyline>`, stroke `#52525b`, strokeWidth `1.5`, no glow.

- [x] 3.0 Update existing components
  - [x] 3.1 Update `components/command/RatingContext.tsx`:
    - Add prop: `ratingHistory: { rating: number }[]` (optional, defaults to `[]`)
    - Compute `trendDelta`: `ratingHistory.length >= 2 ? Math.round(ratingHistory[ratingHistory.length - 1].rating - ratingHistory[Math.max(0, ratingHistory.length - 11)].rating) : null`
    - Remove all bar rendering (the `<div>` with fill color, the track div, and the thumb div)
    - Replace the single text line with two lines:
      - Line 1 (only if `trendDelta !== null`): `+28 in last 10 matches` (use signed integer formatting)
      - Line 2: existing community context text (keep `relativeText` logic unchanged)
    - Style both lines as `text-xs`; Line 2 colour: emerald-600 if above avg, else zinc-500
  - [x] 3.2 Update `components/nav/BottomNav.tsx`:
    - Change the `tabs` array to include an `icon` field. For Trajectory, use a JSX element (inline SVG) rather than a string — restructure the array type accordingly or use a render function.
    - Trajectory icon SVG: `<svg width="16" height="10" viewBox="0 0 16 10"><path d="M0 5 Q2 1 4 5 Q6 9 8 5 Q10 1 12 5 Q14 9 16 5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>`
    - Render icon above label in each tab: `<span className="leading-none">{tab.icon}</span>` then `<span className="text-xs uppercase tracking-widest">{tab.label}</span>`
    - Enter tab: when inactive, use `text-zinc-300` instead of `text-zinc-500` (one shade brighter to signal primary action)

- [x] 4.0 Restructure the Command page layout
  - [x] 4.1 In `app/(tabs)/command/page.tsx`, add imports for all new components: `SituationBanner`, `TrajectoryGraph`, `RecentPerformanceDots`, `DriverTile`.
  - [x] 4.2 Update `METRIC_INFO.ci.label` from `"Compounding Index"` (or whatever it currently is) to `"Form"` so the info sheet header matches the tile label.
  - [x] 4.3 Add a `ciToFormState` helper inline in the page file:
    ```ts
    function ciToFormState(ci: number | null): { label: string; colorClass: string } {
      if (ci === null) return { label: "—", colorClass: "text-zinc-500" };
      if (ci > 20)  return { label: "Strong", colorClass: "text-emerald-400" };
      if (ci < -20) return { label: "Fading",  colorClass: "text-rose-400" };
      return { label: "Steady", colorClass: "text-zinc-300" };
    }
    ```
  - [x] 4.4 Replace the existing pinned rating `<div className="flex flex-col items-center py-4 px-5">` block with the new pinned structure:
    1. `{data.situationState && <SituationBanner state={data.situationState} detail={data.situationDetail} />}`
    2. Rating number + `<TrajectoryGraph>` + `<RatingContext>` in a centred flex column
    3. Key Drivers section: "Key Drivers" label + `grid-cols-3` row of three `<DriverTile>` components
       - Win Rate tile: `label="Win Rate"`, `value={pct(data.winPct, 0)}`, `delta={winRateDelta * 100}`, `deltaUnit="%"`, `history={data.driverHistory.winRateHistory}`, `highlighted={data.dominantDriver === "winRate"}`, `info={METRIC_INFO.winPct}`
       - Form tile: compute `formState = ciToFormState(data.compoundingIndex)`, then `label="Form"`, `value={formState.label}`, `valueColor={formState.colorClass}`, `secondaryValue={signedFixed(data.compoundingIndex)}`, `delta={data.driverDeltas.ciDelta}`, `history={data.driverHistory.ciHistory}`, `highlighted={data.dominantDriver === "ci"}`, `info={METRIC_INFO.ci}`
       - Stability tile: `label="Stability"`, `value={signedFixed(data.driftScore)}`, `delta={data.driverDeltas.driftDelta}`, `history={data.driverHistory.driftHistory}`, `highlighted={data.dominantDriver === "drift"}`, `info={METRIC_INFO.drift}`
  - [x] 4.5 Add a thin border separator between pinned and scrollable: `<div className="border-t border-zinc-800/40" />`
  - [x] 4.6 Replace the existing `flex-1 overflow-y-auto` scrollable block contents with:
    1. `<FilterChip filter={filter} />`
    2. `{data.recentMatchHistory.length > 0 && (<div><p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Recent Performance</p><RecentPerformanceDots matches={data.recentMatchHistory} /></div>)}`
    3. `<MatchHistoryList matches={data.recentMatchHistory} myPlayerId={data.myPlayerId} />`
    4. Edit timer row (unchanged, move here if it was previously above)
    5. Upcoming probability row (unchanged, move here)
    6. Display name edit row (unchanged, move here)
  - [x] 4.7 Remove the old `grid-cols-3` metric card row (`<MetricCard>` usages for Win %, CI, Drift) and the old `<RatingContext>` usage that included the bar. Confirm `MetricCard` sub-component is no longer referenced — it can be deleted or left as dead code for now.
  - [x] 4.8 Pass `ratingHistory={data.ratingHistory}` to the updated `<RatingContext>` component.

- [ ] 5.0 Verify layout and behaviour
  - [ ] 5.1 Open the app in Chrome DevTools at 375×667 (iPhone SE). Confirm all pinned content (banner, rating, graph, context, drivers) is visible without scrolling.
  - [ ] 5.2 Scroll down and confirm the filter chip, Recent Performance dots, and match history are all accessible.
  - [ ] 5.3 Test the situation banner with a known W/L sequence: enter 5 consecutive wins and confirm "🔥 Hot streak" appears; a mixed sequence shows "Momentum stable" or "improving"; fewer than 3 matches shows no banner.
  - [ ] 5.4 Verify the Form tile: confirm "Strong" shows in emerald for CI > 20, "Steady" in zinc for CI near 0, "Fading" in rose for CI < −20.
  - [ ] 5.5 Verify the dominant driver tile: confirm the tile with the largest absolute delta has `border-zinc-500`; if all deltas are null (new user), no tile is highlighted.
  - [ ] 5.6 Test with a new user account (0–2 matches): no banner, no trajectory graph, no performance dots, driver tiles show "—" for all values. No crashes or blank screen.
  - [ ] 5.7 Confirm the trajectory graph renders: glow is visible around nodes and line, most recent node is noticeably larger, rating labels appear at both ends.
  - [ ] 5.8 Run `npx jest` and confirm all existing tests still pass.
