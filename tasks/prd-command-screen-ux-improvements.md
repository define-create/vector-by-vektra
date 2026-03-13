# PRD: Command Screen UX Improvements

## 1. Introduction / Overview

The Command screen is the primary dashboard users see after signing in. Currently it shows a flat list of stats that scrolls immediately — there is no hierarchy, no interpretation, and no visual trend. Users must read numbers and draw their own conclusions.

This feature restructures the Command screen into a **performance cockpit**: a prioritised, above-the-fold layout that answers four questions within two seconds of opening the app:

1. What is my rating?
2. Is it improving?
3. Why is it changing?
4. What just happened?

The screen is redesigned around a clear visual hierarchy — situation first, then trend, then drivers, then history — using a trajectory sparkline graph, a situation banner, redesigned driver tiles with trend indicators, and a glowing W/L performance pattern. The scrollable section (filter, match history) moves below the fold.

**Reference mockup:** `mockups/command-screen.html`

---

## 2. Goals

- All key intelligence (rating, trend, drivers) is visible without scrolling on a standard mobile viewport (375×667)
- Users can understand their performance state at a glance, without needing to interpret raw numbers alone
- The "Form" metric uses plain language ("Strong / Steady / Fading") instead of an unexplained number
- Visual consistency: the trajectory graph and performance dots share the same glow aesthetic, making the screen feel cohesive
- Match history and filter remain accessible via scrolling below the fold
- Animations (post-match feedback) are designed for a future phase without blocking this build

---

## 3. User Stories

- **As a player**, I want to open the app and instantly see if my performance is trending up or down, so I don't have to think about what the numbers mean.
- **As a player**, I want to see the trajectory of my rating as a visual graph, so I can identify momentum and turning points.
- **As a player**, I want to understand what is driving my rating change (win rate, form, stability), so I know what to focus on.
- **As a player**, I want a quick summary of my recent W/L pattern, so I can recognise streaks at a glance.
- **As a player with few matches**, I want the screen to degrade gracefully — showing only the elements that have enough data to be meaningful.

---

## 4. Functional Requirements

### 4.1 Layout — Pinned Above the Fold

The following sections are pinned (not scrollable) and must fit within the visible viewport above the bottom navigation bar:

**FR-1** The pinned area must contain, in order from top to bottom:
1. Situation banner (conditional — see FR-4)
2. Rating number + trajectory graph + rating context text
3. Key Drivers row (3 tiles)

**FR-2** The layout must not require vertical scrolling to see all pinned content on a 375×667px viewport with an 80px bottom nav.

---

### 4.2 Situation Banner

**FR-3** A banner appears above the rating when a situation state can be computed. It displays:
- An icon and a state label (headline)
- A detail string explaining the state (subline)

**FR-4** The banner is only shown when the player has **≥ 3 matches**. If fewer than 3 matches exist, the banner is hidden.

**FR-5** The situation state is computed from `recentMatchHistory` as follows:
| Condition | State | Icon | Label |
|---|---|---|---|
| ≥ 5 consecutive wins | `hot_streak` | 🔥 | "Hot streak" |
| ≥ 4 wins in last 5 | `improving` | ▲ | "Momentum improving" |
| ≤ 1 win in last 5 (min 3 matches) | `declining` | ▼ | "Momentum declining" |
| Otherwise | `stable` | ─ | "Momentum stable" |

**FR-6** The detail string is a plain-language description, e.g.: "4 wins in last 5 matches", "6 wins in a row", "3 losses in last 5 matches".

---

### 4.3 Rating + Trajectory Graph

**FR-7** The large rating number (existing, `text-7xl`) remains centred immediately below the situation banner.

**FR-8** A trajectory sparkline SVG graph is rendered below the rating number. It shows the last 10 rated matches (or fewer if not enough data). The graph is only rendered when the player has **≥ 2 matches with rating snapshots**.

**FR-9** The trajectory graph must:
- Use a **smooth bezier curve** (not straight-line polyline segments) for the connecting line
- Apply an **SVG glow filter** (`feGaussianBlur` + `feMerge`) to both the line and the nodes
- Show each match as a coloured circle node: emerald (win), rose (loss)
- Make the **most recent node slightly larger** (`r="5.5"` vs `r="4"`) and brighter (emerald-400 / rose-400) to draw the eye to the latest result
- Show the **oldest displayed rating** as a small text label at the left end of the graph
- Show the **current rating** as a small text label at the right end of the graph

**FR-10** Below the trajectory graph, two lines of plain text replace the existing progress bar:
- Line 1: `"+28 in last 10 matches"` (signed delta between current rating and rating 10 matches ago). Only shown if `ratingHistory` has ≥ 2 entries.
- Line 2: Community comparison (existing logic): `"+132 above league avg"` / `"Near league average"` / `"−35 below league avg"`
- The progress bar (`RatingContext` filled bar) is **removed entirely**.

---

### 4.4 Key Drivers Row

**FR-11** Three equal-sized driver tiles appear in a 3-column grid labelled "KEY DRIVERS". The tiles are:
1. **Win Rate** — shows win percentage
2. **Form** — shows a state word (see FR-14) with raw CI number below
3. **Stability** — shows the Drift score as a signed number

**FR-12** Each tile displays:
- A label (`text-xs`, zinc-500)
- A primary value (`text-xl font-bold`)
- An optional secondary value — smaller zinc-500 text (used for Form tile only)
- A delta indicator with directional arrow: `↑` (emerald) / `↓` (rose) / `─` (zinc)
- A mini sparkline (40×14px SVG polyline, no glow, zinc-600 stroke) showing the rolling history of that metric over the last 5 computed windows. **Hidden entirely if `history.length < 2`** — no flat line shown for new players.

**FR-13** The tile with the **largest absolute delta** across the three metrics gets a subtle highlighted border (`border-zinc-500`). All other tiles have a transparent border. If no deltas are available, no tile is highlighted.

**FR-14** The **Form tile** (CI) uses plain-language state words as the primary value:
| CI value | State word | Text colour |
|---|---|---|
| > 20 | "Strong" | emerald-400 |
| −20 to 20 | "Steady" | zinc-300 |
| < −20 | "Fading" | rose-400 |
| null | "—" | zinc-500 |

> CI is computed on a −100 to +100 scale (`100 × (0.7M + 0.3A)` — see `lib/metrics/compounding-index.ts`). Thresholds of ±20 represent a meaningful but not extreme signal.

The raw CI number (e.g. `"+2.1"`) is shown as a smaller secondary value below the state word. The tile label is **"Form"** (not "CI" or "Momentum"). The info sheet label for this metric also updates to "Form".

**FR-15** The **Stability tile** (Drift) shows the raw Drift score as a signed number (existing format). No state word. Label is "Stability".

---

### 4.5 Scrollable Section

**FR-16** Everything below the Key Drivers row is scrollable. A thin border separates the pinned and scrollable zones.

**FR-17** The scrollable section contains, in order:
1. Filter chip (existing)
2. Recent Performance section (see FR-18)
3. Match history list (existing `MatchHistoryList`)
4. Edit timer row (existing, conditional)
5. Upcoming probability row (existing, conditional)
6. Display name edit row (existing, conditional)

**FR-18** The Recent Performance section shows a W/L dot pattern for the last 7 matches. It is only shown when the player has **≥ 1 match**.
- Rendered as a single SVG (`viewBox="0 0 220 32"`) with an SVG glow filter
- Each of the 7 dots is a coloured `<circle>`: emerald (win), rose (loss); the latest dot is slightly brighter (emerald-400 / rose-400)
- Thin lines connect adjacent dots
- W / L text labels appear below each dot
- The visual style (glow effect) matches the trajectory graph for a coherent aesthetic

**FR-19** The active filter (date range or event tag) continues to affect all metrics and match history, consistent with the existing behaviour. Above-fold content (drivers, trajectory) responds to the active filter — this preserves the existing filtering behaviour.

---

### 4.6 Data Service (`lib/services/command.ts`)

**FR-20** The following fields are added to `CommandData`:

| Field | Type | Description |
|---|---|---|
| `ratingHistory` | `{ date: string; rating: number; outcome: "win" \| "loss" }[]` | Per-match absolute rating + outcome, chronological order. Derived from existing `histAsc` + `snapshotRatingByMatchId` — no new DB query needed. |
| `situationState` | `"hot_streak" \| "improving" \| "stable" \| "declining" \| null` | Computed from `recentMatchHistory`. Null if < 3 matches. |
| `situationDetail` | `string` | Plain-language detail for the banner, e.g. "4 wins in last 5 matches". |
| `driverHistory` | `{ winRateHistory: number[]; ciHistory: number[]; driftHistory: number[] }` | Up to 5 rolling values per metric, used for the mini sparklines. |
| `driverDeltas` | `{ winRateDelta: number \| null; ciDelta: number \| null; driftDelta: number \| null }` | Change between the last two rolling windows. Null if < 2 windows. |
| `dominantDriver` | `"winRate" \| "ci" \| "drift" \| null` | Which driver has the largest absolute delta. |

**FR-21** All new fields must be included in the `empty` object (returned when the player has no profile) with safe defaults: `[]`, `null`, `""`.

**FR-22** Rolling window computation:
- **Win rate history**: sliding windows of 5 matches over `histAsc`. Step through `i = 4` to `min(9, histAsc.length - 1)`, computing win rate over `[i-4 .. i]`. Produces up to 5 values.
- **CI history**: sliding windows of 10 snapshots over `snapsAsc`, stepped by 2. Produces up to 5 values by calling `computeCI()` per window.
- **Drift history**: same window approach using `computeDriftScore()`.
- If there is insufficient data for a full window, return a shorter array (do not crash).

**FR-23** `dominantDriver` is whichever of the three has the largest `|delta|`, with `winRateDelta` normalised by `×100` to be on a comparable scale to CI and Drift. Returns `null` if all deltas are null.

---

### 4.7 Bottom Navigation

**FR-24** Each tab in `BottomNav` gains an icon rendered above the label text:
- Command → `⌘`
- Enter → `⊕`
- Matchups → `⚔`
- Trajectory → a small inline SVG wavy-line icon (do not use `∿` U+223F — it has poor support on Android system fonts). Suggested SVG path: `<svg width="16" height="10" viewBox="0 0 16 10"><path d="M0 5 Q2 1 4 5 Q6 9 8 5 Q10 1 12 5 Q14 9 16 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`

**FR-25** The Enter tab is rendered one shade brighter than the inactive Matchups/Trajectory tabs (`text-zinc-300` vs `text-zinc-500`) to draw attention to the primary action without a floating action button.

---

## 5. Non-Goals (Out of Scope — Phase 1)

The following are intentionally excluded from this build:

- **Post-match animations**: outcome flash overlay, animated rating counter, trajectory line extension, banner state transition. These are Phase 2 and will be specified in a separate PRD.
- **Push notifications or background data refresh**
- **Changing the filter chip's position** (it stays in the scrollable section)
- **Any changes to the Trajectory tab, Matchups tab, or Enter tab content**
- **New API endpoints** — all data changes are additions to the existing `getCommandData` service and `GET /api/command` response

---

## 6. Design Considerations

- **Mockup:** `mockups/command-screen.html` — side-by-side comparison of new and current layout. Open in a browser to review.
- **Reference screenshot:** `C:\Users\AT\Downloads\CommandScreeen1Mar12.png`
- **Glow aesthetic:** Both the trajectory graph and the performance dots use the same SVG glow filter pattern (`feGaussianBlur stdDeviation + feMerge`). Use separate `filter id` values to avoid SVG id collision (`"glow"` for trajectory, `"glow-dots"` for performance dots).
- **Colour tokens used:**
  - Win: `#10b981` (emerald-500), latest win: `#34d399` (emerald-400)
  - Loss: `#f43f5e` (rose-500), latest loss: `#fb7185` (rose-400)
  - Graph line: `#78716c` (stone-500) with glow
  - Mini sparkline (tiles): `#52525b` (zinc-600), no glow
- **Typography hierarchy in driver tiles:** primary value `text-xl font-bold`, secondary CI number `text-xs text-zinc-500`, delta `text-xs`
- **Viewport budget (pinned content):**

| Section | Approx height |
|---|---|
| Status bar | 28px |
| Situation banner | 56px |
| Rating number | 80px |
| Trajectory graph | 70px |
| Rating context text | 30px |
| "KEY DRIVERS" label + tiles | 120px |
| Bottom nav | 56px |
| **Total** | **~440px** |

This comfortably fits a 667px viewport. On shorter devices (600px), the tiles may be slightly tighter but remain visible without scroll.

---

## 7. Technical Considerations

- **Server vs. client components:**
  - `SituationBanner` — server-renderable (no state needed)
  - `TrajectoryGraph` — `"use client"` required (SVG coordinate calculations in JS)
  - `RecentPerformanceDots` — server-renderable (static SVG)
  - `DriverTile` — server-renderable
  - `RatingContext` — server-renderable (simplified to text-only)

- **No new DB queries** — `ratingHistory`, `driverHistory`, and `situationState` are all derived from data already fetched by the existing parallel query block in `getCommandData`. This keeps the single round-trip to the DB.

- **Bezier curve generation:** The trajectory graph uses a smooth cubic bezier path. A helper function `smoothPath(points: {x,y}[])` computes control points using the catmull-rom to bezier conversion: for each segment, the control points are `prev + (next - prev) * tension / 3`. Tension = `0.4` is a reasonable default.

- **SVG scaling:** All SVGs use `viewBox` with `width="100%"` so they scale correctly across device widths.

- **TypeScript:** The new `CommandData` fields should be properly typed. The `driverHistory` object is always present (not nullable) but its arrays may be empty.

---

## 8. Success Metrics

- The pinned above-fold content renders correctly (no clipping, no scroll needed) on viewport sizes: 375×667, 390×844, 414×896
- All new `CommandData` fields populate correctly with real match data; no `null`/`undefined` rendering errors
- The situation banner shows the correct state for a player with a known win/loss sequence
- The Form tile shows "Strong" for a player with CI > 5, "Steady" for CI near 0, "Fading" for CI < −5
- The dominant driver tile highlights the correct tile (or none if no deltas available)
- The trajectory graph renders a visible glow and smooth curve; the latest node is visibly larger

---

## 9. Open Questions

All questions from the initial draft have been resolved:

| Question | Resolution |
|---|---|
| `∿` rendering on Android | Replaced with an inline SVG wavy path — see FR-24 |
| CI output range and thresholds | CI is −100 to +100. Thresholds updated to ±20 — see FR-14 |
| Empty sparklines for new players | Hide sparkline entirely when `history.length < 2` — see FR-12 |
