# Tasks: App Responsiveness — Instant Tab Navigation

Source PRD: [prd-app-responsiveness.md](prd-app-responsiveness.md)

## Relevant Files

- `app/(tabs)/command/loading.tsx` — Skeleton for Home tab (rating-shaped block, drivers grid, history list).
- `app/(tabs)/enter/loading.tsx` — Skeleton for Match tab (form structure only, no chip strip per resolved decision Q2).
- `app/(tabs)/stats/loading.tsx` — Skeleton for Stats tab.
- `app/(tabs)/profile/loading.tsx` — Skeleton for Profile tab.
- `app/(tabs)/trajectory/loading.tsx` — Skeleton for Trajectory tab.
- `app/(tabs)/matchups/loading.tsx` — Skeleton for Matchups tab.
- `app/(tabs)/command/page.tsx` — Drop `force-dynamic`, refactor into Suspense-streamed sections.
- `app/(tabs)/command/RatingCard.tsx` — New async server component for the rating block (rating, trajectory graph, rating context).
- `app/(tabs)/command/DriversGrid.tsx` — New async server component for the Key Drivers grid.
- `app/(tabs)/command/MatchHistorySection.tsx` — New async server component for filter chip + recent performance + match history.
- `app/(tabs)/command/EditTimerLink.tsx` — New async server component for the edit timer block.
- `app/(tabs)/command/skeletons.tsx` — Per-section skeleton fallbacks used in both `loading.tsx` and the page's Suspense boundaries.
- `lib/services/command.ts` — Verify `unstable_cache` config; add per-user tag (`command-data:${userId}`).
- `app/api/matches/route.ts` — After successful submission, call `revalidateTag` once per affected `userId`.
- `app/(tabs)/enter/page.tsx` — Remove `router.refresh()` post-submit (revalidation now happens server-side in the API route).
- `components/nav/BottomNav.tsx` — Confirm active-tab tap behavior; no code change expected.

### Notes

- No new tests are added by this PRD — success is measured manually per PRD §8.
- Use `npx jest [optional/path/to/test/file]` to run existing tests if any nearby tests need re-running after refactors.
- Per CLAUDE.md, no `prisma generate` is needed (no schema changes).

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 From `main`, create and checkout `feature/app-responsiveness` (`git checkout -b feature/app-responsiveness`).

- [ ] 1.0 Add route-level loading skeletons to all `(tabs)` routes
  - [ ] 1.1 Create `app/(tabs)/command/skeletons.tsx` exporting per-section skeleton components: `RatingCardSkeleton`, `DriversGridSkeleton`, `MatchHistorySectionSkeleton`, `EditTimerLinkSkeleton`. Use `bg-zinc-800/40`, `bg-zinc-700`, `rounded-xl`/`rounded-2xl`, `animate-pulse`. No client hooks, no data fetching.
  - [ ] 1.2 Create `app/(tabs)/command/loading.tsx` that composes the four skeletons from 1.1 inside the same outer container shape as `app/(tabs)/command/page.tsx` (centered, `flex flex-col`, padding `pt-3 pb-1 px-5` for the rating block). Include a placeholder for the rating number (~7xl height), trajectory graph row, drivers grid (3-column), and a few match history rows.
  - [ ] 1.3 Create `app/(tabs)/enter/loading.tsx` rendering the Match form skeleton: admin toggle row, text-mode toggle row, two team cards (`rounded-2xl border bg-zinc-800/40`), score input row, submit button. Per resolved decision Q2, do NOT include a chip strip placeholder.
  - [ ] 1.4 Create `app/(tabs)/stats/loading.tsx` rendering a tab-bar-shaped row at the top plus 3–4 stat-card placeholders below.
  - [ ] 1.5 Create `app/(tabs)/profile/loading.tsx` rendering the page title placeholder and 4–5 settings-row placeholders matching the rounded-`xl` `bg-zinc-800/60` rows in `profile/page.tsx`.
  - [ ] 1.6 Create `app/(tabs)/trajectory/loading.tsx` rendering a tall chart-shaped placeholder with a header row above it.
  - [ ] 1.7 Create `app/(tabs)/matchups/loading.tsx` rendering a player-pair-selector skeleton (two card-shaped blocks with a "VS" divider) plus a results-area placeholder.
  - [ ] 1.8 Verify on each tab visually that the skeleton size/shape roughly matches the loaded page so there's no layout jump when real content arrives. Adjust sizes as needed.

- [ ] 2.0 Wire up cache invalidation: drop `force-dynamic` and replace `router.refresh()` with `revalidateTag`
  - [ ] 2.1 Open `lib/services/command.ts` and confirm `getCommandData` is wrapped in `unstable_cache`. Update the cache config so the tags array includes a per-user tag: `tags: ["command-data", \`command-data:\${userId}\`]`. Keep any existing tags that other code relies on.
  - [ ] 2.2 In `app/api/matches/route.ts`, after a match is successfully created and ratings are recomputed (or queued), collect the `userId`s of the four involved players. Skip players where `userId` is `null` (shadow profiles per project memory).
  - [ ] 2.3 In the same handler, call `revalidateTag(\`command-data:\${userId}\`)` for each collected `userId`. Import `revalidateTag` from `next/cache`.
  - [ ] 2.4 Remove `export const dynamic = "force-dynamic"` from `app/(tabs)/command/page.tsx` (line 16).
  - [ ] 2.5 In `app/(tabs)/enter/page.tsx`, remove the `router.refresh()` call inside the `submit()` success branch. The `revalidateTag` call from 2.3 now handles freshness server-side. The `useRouter` import can stay if used elsewhere; remove if not.
  - [ ] 2.6 Smoke-test locally: submit a match as a claimed user, navigate to Home, confirm the new match appears in Match History without a hard refresh. If stale, debug the tag spelling or the userId resolution in 2.2.

- [ ] 3.0 Refactor Home page to stream slow sections behind `<Suspense>` boundaries
  - [ ] 3.1 Create `app/(tabs)/command/RatingCard.tsx` as an async server component. Move the rating-card JSX from `command/page.tsx` (the `<div className="flex flex-col items-center pt-3 pb-1 px-5">` block) into it. The component takes `userId` and `filter` as props, awaits `getCommandData(userId, filter)`, and renders the rating number, `TrajectoryGraph`, and `RatingContext`.
  - [ ] 3.2 Create `app/(tabs)/command/DriversGrid.tsx` as an async server component. Move the Key Drivers grid JSX into it. Same prop shape: `userId`, `filter`. Awaits `getCommandData` and renders the three `DriverTile`s plus the `formState` derivation.
  - [ ] 3.3 Create `app/(tabs)/command/MatchHistorySection.tsx` as an async server component. Move the match history block (FilterChip, RecentPerformanceDots, win-probability line, MatchHistoryList). Same prop shape.
  - [ ] 3.4 Create `app/(tabs)/command/EditTimerLink.tsx` as an async server component. Move the edit timer block. Same prop shape.
  - [ ] 3.5 Refactor `app/(tabs)/command/page.tsx` so the default export only does: session check, redirect logic, and `playerExists` check. Then renders four `<Suspense fallback={...}>` boundaries — one per component from 3.1–3.4 — each passing `userId` and `filter` props. Import the matching skeletons from `app/(tabs)/command/skeletons.tsx`.
  - [ ] 3.6 Move shared helper functions (`pct`, `signedFixed`, `ciToFormState`, `METRIC_INFO`) out of `command/page.tsx` into a co-located module (e.g., `app/(tabs)/command/helpers.ts`) so each new component can import them. Update imports.
  - [ ] 3.7 Confirm `getCommandData` deduplicates correctly: with `unstable_cache` wrapping it, all four section components calling `getCommandData(userId, filter)` in the same request should hit the cache after the first call. Verify by adding a temporary `console.log` at the top of `getCommandData` and checking it logs once per page load, not four times. Remove the log after verification.
  - [ ] 3.8 Visually confirm in dev that the shell + rating skeleton renders before the rating value appears, and that drivers/history fill in shortly after rather than blocking the rating.

- [ ] 4.0 Verify active-tab tap behavior (no skeleton flash when tapping current tab)
  - [ ] 4.1 Manually tap Home while on Home, Match while on Match, Stats while on Stats. Confirm no `loading.tsx` skeleton flashes — Next.js's `<Link>` should no-op the navigation by default.
  - [ ] 4.2 If a flash occurs on any tab, inspect `components/nav/BottomNav.tsx` and check whether any tab href differs from `usePathname()` in a way that breaks the no-op (e.g., trailing slash, query string). Fix by normalizing the href comparison; do not add a custom click handler unless required.
  - [ ] 4.3 Document the result in PR description (whether any fix was needed).

- [ ] 5.0 Manual test pass against PRD §8 test script and capture results
  - [ ] 5.1 Run the 6-tab-transition matrix on a real mobile device (Home↔Match, Home↔Stats, Match↔Stats — both directions). For each, confirm visual feedback within ~1 second ("one Mississippi" test).
  - [ ] 5.2 Tap Home while on Home: confirm no skeleton flash (cross-check with 4.1).
  - [ ] 5.3 Tap the Profile icon in `TopHeader` from each of the three main tabs: confirm Profile skeleton renders instantly each time.
  - [ ] 5.4 Submit a match from the Match tab. After the success screen appears, navigate to Home: confirm the new match appears within ~1 second and the rating reflects it.
  - [ ] 5.5 Time the Home rating-number paint on a warm cache (second visit within a minute): confirm under ~500ms subjectively.
  - [ ] 5.6 Record results in the PR description: list each test, pass/fail, and any anomalies. If any test fails, file a follow-up issue and fix or document the gap before merging.
