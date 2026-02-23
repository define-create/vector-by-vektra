# PRD: Command Screen Enhancements

**Document version:** 1.0
**Date:** 2026-02-23
**Status:** Ready for development

---

## 1. Introduction / Overview

The Command screen (`/command`) is the primary dashboard for every registered player. Currently it displays a raw rating number (e.g. "1000"), three advanced metrics (Win %, CI, Drift), an edit timer, upcoming win probability, and a single last-match card. For a first-time user the screen is data-rich but context-poor: the number "1000" carries no intuitive meaning, the CI and Drift labels are unexplained, and only the most recent match is visible.

**This feature adds three targeted improvements:**
1. A rating context block (progress bar + community-relative text) placed directly under the large rating number.
2. Info-icon bottom sheets on every metric card so users can tap `ⓘ` to read a plain-English explanation.
3. The single "Last match" card is replaced by a compact, scrollable match history list showing the last 20 matches in the same visual format.

---

## 2. Goals

1. A first-time user looking at "1000" immediately understands what that means relative to the community.
2. Any user can tap `ⓘ` on CI, Drift, Win %, or Rating and get a plain-English explanation without leaving the screen.
3. The full recent match history is accessible on the Command screen via scroll — no separate screen required.
4. Primary metrics (rating, win %, CI, drift, upcoming probability, edit timer) remain visible at the top of the screen without scrolling.
5. No existing data or metric is removed; only context is added.

---

## 3. User Stories

- **As a new player**, I want to see where my rating of 1000 sits relative to other players so I understand whether I'm average, above, or below.
- **As a player**, I want to tap a metric card and read a plain-English explanation of what CI or Drift means without having to leave the screen.
- **As a player**, I want to scroll through my last 20 matches on the Command screen to review recent performance at a glance.

---

## 4. Functional Requirements

### 4.1 Rating Contextualization

1. Directly under the large rating number, the system must display a horizontal progress bar showing where the player's rating sits on the community rating scale (community minimum → community maximum).
2. Directly under the progress bar, the system must display a short relative-context string:
   - If within ±30 points of the community average: **"Near community average"**
   - If more than 30 points above: **"+{delta} above average"** (e.g. "+47 above average")
   - If more than 30 points below: **"−{delta} below average"** (e.g. "−23 below average")
3. Community stats (average, min, max rating of all non-deleted players — including shadow profiles, since they have real ratings from actual matches) must be computed in `getCommandData()` as a new `communityStats` field and passed to the page.
4. If fewer than 3 players exist in the DB, the progress bar and relative text must be hidden (not enough data for context to be meaningful).
5. The progress bar must use the existing zinc/emerald color palette. The filled portion of the bar is emerald when the player is above average, zinc-400 when below or at average.

### 4.2 Match History List (replaces single "Last match" card)

6. The single "Last match" card at the bottom of the page must be replaced by a scrollable list of up to 20 most recent non-voided matches.
7. Each match row must display the following fields:
   - Match date (formatted as e.g. "Feb 20")
   - WIN / LOSS badge (emerald-400 / rose-400 text, same as current)
   - Partner name: "with Name" (same `text-xs text-zinc-400` style as opponents)
   - Opponent names: "vs. Name1 & Name2"
   - Score string: "11–7, 11–9"
8. The match rows must use **compact vertical spacing** (`px-4 py-2`) to allow multiple rows to be visible without excessive scrolling.
9. Individual match rows must remain visually distinct from one another. Use a subtle top border (`border-t border-zinc-700/50`) between rows rather than full card backgrounds. The first row has no top border.
10. The list container must be a `max-h` constrained div with `overflow-y-auto` so it scrolls independently without pushing the metrics above it off screen (`max-h-64`, ~4–5 rows visible before scrolling).
11. If the player has no matches yet, show a single muted placeholder row: "No matches yet."
12. A section label **"Recent Matches"** (same `text-xs uppercase tracking-widest text-zinc-500` style as "RATING") must appear above the list.

### 4.3 Metric Info Bottom Sheets

13. Each of the following metric displays must have a small `ⓘ` icon button:
    - Rating section (top of screen)
    - Win % (90d) card
    - CI card
    - Drift card
14. The `ⓘ` icon must use `text-zinc-500 hover:text-zinc-300` and be placed inline after the metric label text (not overlapping the value).
15. Tapping `ⓘ` must open a **bottom sheet** (a slide-up overlay anchored to the bottom of the viewport) containing:
    - Metric name as heading
    - 2–4 sentences of plain-English explanation (see Section 6)
    - A close button or tap-outside-to-dismiss behavior
16. Only one bottom sheet can be open at a time; opening a second one closes the first.
17. The bottom sheet must be a **Client Component** (`"use client"`) since it requires interactive state.
18. The bottom sheet animation must be a simple CSS `transform: translateY` slide-up transition (~200ms).
19. The rest of the Command page (Server Component) must remain a Server Component. The `ⓘ` buttons and bottom sheet are a self-contained client island.

---

## 5. Non-Goals

- No changes to the Trajectory screen, Enter screen, or any other tab.
- No changes to the metric calculation logic (CI, Drift, Win %, rating — all stay identical).
- No infinite scroll — the list is capped at 20 matches.
- No rating history chart on the Command screen (that lives on Trajectory).
- No new server routes — all data flows through the existing `getCommandData()` service.

---

## 6. Design Considerations

### Rating progress bar
```
RATING
1047
━━━━━━━━━━━━━━━[●]━━━━━━━
                +47 above average
```
- Bar width: full container width, height `h-1`
- Thumb dot: `w-2 h-2 rounded-full` at the correct `left` percentage
- Bar track: `bg-zinc-700`, filled portion: `bg-emerald-500` (above avg) or `bg-zinc-400` (below/at avg)

### Compact match row
```
Feb 20  WIN  with Partner1  vs. Opp1 & Opp2  11–7, 11–9
Feb 18  LOSS  with Partner2  vs. Opp3 & Opp4  9–11, 8–11
```
- Single-line layout using `flex justify-between items-center`
- Date: `text-xs text-zinc-500`
- WIN/LOSS: `text-xs font-semibold` emerald/rose
- "with …" and "vs. …" + score: `text-xs text-zinc-400`

### Metric explanation copy (bottom sheets)

**Rating**
> Your rating is a number that represents your current skill level, calculated from every match you've played. Players start at 1000. Winning against stronger opponents raises it more; losing to weaker opponents drops it more. The higher your rating, the stronger the system considers you.

**Win % (90d)**
> The percentage of matches you won in the last 90 days. A 50% win rate means you're winning and losing about equally. Above 50% means you're outperforming expectations across the season.

**CI — Compounding Index**
> Measures whether your recent improvements are building on each other or just oscillating. A positive CI means your wins are producing increasingly larger rating gains — your momentum is reinforcing. A negative CI means losses are outpacing gains. Near zero means your results are flat or random.

**Drift Score**
> Measures how much your actual results diverge from what the rating model predicts. A positive Drift means you're consistently winning more than expected — your rating is likely to rise soon. A negative Drift means you're losing more than expected — a rating drop may follow.

---

## 7. Technical Considerations

### Data service changes (`lib/services/command.ts`)

- **Add** `partnerName: string` to the `LastMatch` interface. Derived from `match.participants` where `p.team === myTeam && p.player.id !== myPlayer.id`.
- **Add** `recentMatchHistory: LastMatch[]` to `CommandData` interface (replaces `lastMatch: LastMatch | null`).
- **Add** `communityStats: { avg: number; min: number; max: number } | null` to `CommandData` interface.
- **Add** to the existing `Promise.all`:
  ```ts
  prisma.player.aggregate({
    where: { userId: { not: null }, deletedAt: null },
    _avg: { rating: true },
    _min: { rating: true },
    _max: { rating: true },
  })
  ```
- The `sortedRecent` array already computed for win% is sliced to produce `recentMatchHistory` (first 20 items). No extra DB query needed.

### New files

| File | Purpose |
|---|---|
| `components/command/MetricInfoSheet.tsx` | Client Component — `ⓘ` button + bottom sheet overlay |
| `components/command/RatingContext.tsx` | Server-renderable TSX — progress bar + relative text |
| `components/command/MatchHistoryList.tsx` | Server-renderable TSX — compact match rows |

### Existing files modified

| File | Change |
|---|---|
| `lib/services/command.ts` | Add `communityStats`, `recentMatchHistory`, `partnerName`; add aggregate query |
| `app/(tabs)/command/page.tsx` | Wire new components; replace lastMatch card; add `ⓘ` buttons |

---

## 8. Success Metrics

- A first-time user can immediately see whether their rating is above, below, or near average without any explanation.
- Tapping `ⓘ` on any metric opens a readable explanation in under 1 tap.
- Scrolling the match list shows at least 4–5 compact rows before the list boundary.
- TypeScript compiles clean (`npx tsc --noEmit` 0 errors).
- All 54 existing jest tests continue to pass.

---

## 9. Open Questions

*(none — all clarified before implementation)*
