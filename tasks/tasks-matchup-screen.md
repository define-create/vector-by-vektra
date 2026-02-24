## Relevant Files

- `prisma/schema.prisma` — Verify `RatingSnapshot` has `effectiveK` and `expectedScore` (read-only, no changes expected).
- `lib/rating-engine/elo.ts` — Reused for `expectedScore()` and `teamRating()` in win probability computation.
- `lib/rating-engine/replay.ts` — Reference for how `effectiveK` is computed per match.
- `lib/metrics/compounding-index.ts` — Reused as the basis for Momentum (identical formula, window=10).
- `lib/metrics/drift-score.ts` — Reference for Expectation Gap raw formula structure.
- `lib/metrics/momentum.ts` — **NEW** — Thin wrapper around compounding index logic with window=10.
- `lib/metrics/momentum.test.ts` — **NEW** — Unit tests for Momentum.
- `lib/metrics/expectation-gap.ts` — **NEW** — Expectation Gap with 5-level scope ladder and shrinkage factor.
- `lib/metrics/expectation-gap.test.ts` — **NEW** — Unit tests for Expectation Gap.
- `lib/matchup.ts` — **NEW** — Win probability and moneyline helper functions.
- `lib/matchup.test.ts` — **NEW** — Unit tests for win probability and moneyline.
- `app/api/matchup/route.ts` — **NEW** — `GET /api/matchup?player1=&player2=&player3=&player4=`.
- `components/matchups/PlayerPairSelector.tsx` — **NEW** — 3-slot player selector (partner + 2 opponents), wraps existing `PlayerSelector`.
- `components/matchups/ProjectionCard.tsx` — **NEW** — Primary projection card (teams block + forecast + metrics grid).
- `components/matchups/HistoryCard.tsx` — **NEW** — Head-to-head history card with tabular layout.
- `app/(tabs)/matchups/page.tsx` — **MODIFIED** — Full rewrite as client component with player selector and projection display.
- `components/command/MatchHistoryList.tsx` — **MODIFIED** — Add `onLongPress` prop to match rows.
- `app/(tabs)/command/page.tsx` — **MODIFIED** — Pass long-press handler to `MatchHistoryList`.
- `components/enter/PlayerSelector.tsx` — Reused inside `PlayerPairSelector` (read-only).

### Notes

- Unit tests should be placed alongside the code files they test (e.g., `momentum.ts` and `momentum.test.ts` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests.
- `RatingSnapshot.effectiveK` = Ki (K-factor per match), `RatingSnapshot.expectedScore` = Ei. No new schema table is needed — the existing model covers all Momentum and Expectation Gap data requirements.
- Momentum uses the same formula as `compounding-index.ts` (`100 × (0.7M + 0.3A)`) with window=10. Reuse or call through to that module rather than duplicating the implementation.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after a parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/matchups`

- [x] 1.0 Verify data layer — confirm `RatingSnapshot` covers Ki and Ei requirements (no schema changes expected)
  - [x] 1.1 Read `prisma/schema.prisma` and confirm `RatingSnapshot` has `effectiveK` (Ki) and `expectedScore` (Ei) fields. ✅ Both present as `Float`.
  - [x] 1.2 Read `lib/rating-engine/replay.ts` and confirm `effectiveK` is written to `RatingSnapshot` on every match during a rating run. ✅ Confirmed at lines 69 and 77.
  - [x] 1.3 No schema changes needed. Both fields confirmed. Comment documenting `RatingSnapshot.effectiveK` as canonical Ki source will be added in Task 2.2 when `lib/metrics/momentum.ts` is created.

- [x] 2.0 Computation library — implement and test win probability, moneyline, Momentum, and Expectation Gap
  - [x] 2.1 Read `lib/metrics/compounding-index.ts` to confirm the formula is `100 × (0.7M + 0.3A)` with M = mean(Ni × Si) and A = OLS slope of Ni — identical to Momentum. ✅ Confirmed.
  - [x] 2.2 Create `lib/metrics/momentum.ts`: thin wrapper over `computeCI` with window=11 snapshots (→ 10 delta pairs). Documents `RatingSnapshot.effectiveK` as canonical Ki source.
  - [x] 2.3 Create `lib/matchup.ts`: `computeWinProbability` (ELO team averages) + `computeMoneyline` (zero-vig, nearest-5 rounding, Even at 0.47–0.53).
  - [x] 2.4 Create `lib/metrics/expectation-gap.ts`: 5-level scope ladder, shrinkage w=n/(n+5), returns `{ value, n, lowSample }`.
  - [x] 2.5 Write `lib/metrics/momentum.test.ts`: 7 tests — flat/rising/negative/graceful/windowed/order-independent.
  - [x] 2.6 Write `lib/matchup.test.ts`: 13 tests covering win probability and moneyline edge cases.
  - [x] 2.7 Write `lib/metrics/expectation-gap.test.ts`: 11 tests — scope ladder, shrinkage, lowSample, P1-on-team-2.
  - [x] 2.8 Run `npx jest lib/metrics/momentum lib/matchup lib/metrics/expectation-gap` — 35/35 passed. Full suite: 89/89 passed.

- [x] 3.0 API route — implement `GET /api/matchup`
  - [x] 3.1 Create `app/api/matchup/route.ts`. Parse query params `player1`, `player2`, `player3`, `player4`. Return 400 if any are missing or not valid UUIDs.
  - [x] 3.2 Fetch current ratings for all 4 players from the `Player` table (using the latest `rating` field on each Player record).
  - [x] 3.3 Compute win probability using `computeWinProbability` from `lib/matchup.ts`. Compute moneyline using `computeMoneyline`. Compute `ratingDiff` = (rating1 + rating2) / 2 − (rating3 + rating4) / 2.
  - [x] 3.4 Fetch the latest `RatingSnapshot` for `player1` to read `confidence` (CI) and `volatility` (VolBand). These are stored on the `Player` record or derivable from existing post-replay metrics — use whichever is already populated.
  - [x] 3.5 Fetch the last 10 `RatingSnapshot` records for `player1` (ordered by `matchDate` desc). Compute `momentum` using `computeMomentum` from `lib/metrics/momentum.ts`.
  - [x] 3.6 Fetch all matches for Expectation Gap computation. Call `computeExpectationGap` from `lib/metrics/expectation-gap.ts` with the 4 player IDs and fetched data.
  - [x] 3.7 Query H2H history: find all non-voided matches where `{player1, player2}` form one team AND `{player3, player4}` form the other team (order-invariant within each team). Join `MatchParticipant` and `Game` tables. Order by `matchDate` desc.
  - [x] 3.8 For each H2H match, compute the result (W/L for primary player's team), format the score string from `Game` records, and include the rating delta for `player1` from `RatingSnapshot`.
  - [x] 3.9 Compute `record` string (e.g., `"3–2"`) and `avgMargin` (average of `player1`'s rating deltas across H2H matches).
  - [x] 3.10 Return the complete JSON response matching the shape defined in PRD §4.2.

- [x] 4.0 UI — player selector component and `/matchups` page
  - [x] 4.1 Read the existing `app/(tabs)/matchups/page.tsx` to understand current structure before rewriting.
  - [x] 4.2 Read `components/enter/PlayerSelector.tsx` to understand its props and search behavior before wrapping it.
  - [x] 4.3 Create `components/matchups/PlayerPairSelector.tsx` ("use client"): renders three `PlayerSelector` slots labelled "Your Partner", "Opponent 1", "Opponent 2". Accepts `initialValues?: { partner, opp1, opp2 }` for pre-population. Calls `onChange(partner, opp1, opp2)` when all three are selected. Each slot excludes the IDs already selected in the other two slots.
  - [x] 4.4 Create `components/matchups/ProjectionCard.tsx`: accepts all projection props from the API response. Renders the Teams Block, Forecast Block (probability at `text-[170px]`, moneyline at `text-[66px]`, "Model Line" label), and Structural Metrics Grid (2-column, 5 metrics). All values use `tabular-nums`. Card styled with `rounded-xl border border-[#374155]`. Renders the Expectation Gap value dimmed if `lowSample` is true.
  - [x] 4.5 Create `components/matchups/HistoryCard.tsx`: renders title, meta line, column headers (`DATE`, `R`, `SCORE`, `Δ`) using `grid-cols-[200px_60px_1fr_80px]`, rows, and empty state.
  - [x] 4.6 Rewrote `app/(tabs)/matchups/page.tsx` as server wrapper + `MatchupsClient` ("use client"). URL search params (player2/3/4) handled server-side for long-press pre-population.
  - [x] 4.7 Loading state ("Computing projection…") and error state (border card with message) added to `MatchupsClient`.
  - [x] 4.8 `npx tsc --noEmit` — zero type errors. ✅

- [x] 5.0 Navigation integration — long-press on Command screen Recent Matches
  - [x] 5.1 Read `components/command/MatchHistoryList.tsx` — structure confirmed.
  - [x] 5.2 Converted `MatchHistoryList` to "use client". Added `myPlayerId` prop. `onTouchStart`/`onTouchEnd`/`onTouchMove` with 500ms timer + `onContextMenu` for desktop. Navigates to `/matchups?player1=...&player2=...&player3=...&player4=...` via `useRouter`.
  - [x] 5.3 Read `app/(tabs)/command/page.tsx` — `MatchHistoryList` at line 115.
  - [x] 5.4 Extended `LastMatch` with `partnerId` + `opponentIds`. Added `myPlayerId` to `CommandData`. Updated `getCommandData` and Command page.
  - [x] 5.5 Confirmed bottom nav Matchups tab navigates to `/matchups` — no changes needed. ✅
  - [x] 5.6 `npx tsc --noEmit` — zero type errors. ✅
  - [x] 5.7 `npx jest` — 89/89 tests passed. ✅
