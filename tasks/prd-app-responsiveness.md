# PRD: App Responsiveness — Instant Tab Navigation

## 1. Introduction / Overview

When a user taps a navigation tab (Home, Match, Stats) or any feature button that switches screens, the app appears frozen for 1–2 seconds before the new screen renders. During this delay nothing visible changes — the previous screen stays on display, the tap appears to do nothing, and users often tap again thinking the app missed their input.

The root cause is that every `(tabs)` page is a server component that blocks on database queries before sending any HTML, and no `loading.tsx` skeletons exist. The page payload only arrives after every Prisma query has resolved, so navigation feels broken even when the underlying queries are fast.

This PRD covers **Tier 1** fixes: add route-level loading skeletons across all `(tabs)` routes, and stream the Home page's slow data sections behind `<Suspense>` so the shell renders immediately. Tier 2 and Tier 3 work (query restructuring, infra changes) is documented in §10 for future PRDs.

---

## 2. Goals

- Tab switches show visual feedback (skeleton or shell) within 100ms of tap, in every direction (Home → Match, Match → Stats, etc.)
- Real end-to-end load time on Home reduced to under 500ms on a warm cache
- The "did my tap register?" feeling is eliminated — users always see *something* change immediately
- Zero schema changes, zero new infrastructure

---

## 3. User Stories

- **As a user**, when I tap the Stats tab from Home, I see the Stats screen's structure appear instantly so I know my tap registered, even if the data takes another second to populate.
- **As a user**, when I open the Home screen, my rating renders as soon as it's ready — I don't have to wait for slow sections like match history or recent performance to render the whole page.
- **As a user returning to Home after submitting a match**, my updated rating and match history appear without a noticeable freeze, because the cache is updated in the background rather than the page being marked fully dynamic.
- **As a user**, when I tap a tab I'm already on, nothing janky happens — the page doesn't flash a skeleton.

---

## 4. Functional Requirements

### 4.1 Route-Level Loading Skeletons

Add a `loading.tsx` file to every `(tabs)` route. Next.js renders these instantly while the server component for that route is still resolving.

**Files to create:**

- `app/(tabs)/command/loading.tsx`
- `app/(tabs)/enter/loading.tsx`
- `app/(tabs)/stats/loading.tsx`
- `app/(tabs)/profile/loading.tsx`
- `app/(tabs)/trajectory/loading.tsx`
- `app/(tabs)/matchups/loading.tsx`

**Skeleton requirements:**

1. Match the rough layout of the destination page (header, content blocks, action buttons) so the transition doesn't feel jarring.
2. Use the existing color palette (`zinc-800/40`, `zinc-700`) and the same `max-w-xl mx-auto` constraints already in `app/(tabs)/layout.tsx`.
3. No data fetching, no client hooks, no animation libraries — just static markup with Tailwind. Static pulse via `animate-pulse` is acceptable.
4. Each skeleton should be visually distinct enough that the user can tell which tab they landed on (e.g., Home shows a large rating-shaped block; Stats shows tab-bar-shaped placeholders).

### 4.2 Suspense-Streamed Home Page

Refactor `app/(tabs)/command/page.tsx` so the rating number and shell render before slow sections.

**Required changes:**

1. The rating card (rating number, trajectory graph, rating context) renders as soon as `getCommandData` returns the rating-related fields.
2. The Key Drivers grid, Recent Performance dots, Match History List, and Edit Timer block each sit inside their own `<Suspense fallback={<Skeleton />}>` boundary so they don't block earlier sections.
3. Each Suspense boundary has a fallback skeleton that matches its real layout.
4. If the simplest implementation requires splitting `getCommandData` into smaller functions per section, that is permitted — see §4.4.

### 4.3 Drop `force-dynamic` on Home; Use Cache Invalidation Instead

**File:** `app/(tabs)/command/page.tsx`

1. Remove `export const dynamic = "force-dynamic"` from the Home page.
2. Ensure `getCommandData` in `lib/services/command.ts` is wrapped with `unstable_cache` and tagged (e.g., `["command-data"]`, plus a per-user tag).
3. Replace `router.refresh()` in `app/(tabs)/enter/page.tsx` (called after a successful match submission) with a call to a new server action / API route that invokes `revalidateTag` for the affected user's command data. The submitter's Home tab should still show the new match on next load.

### 4.4 Permitted Service-Layer Changes (Render-Layer Concerns Only)

Cache configuration, cache invalidation, and splitting cached service functions are **in scope** as render-layer concerns. The following are explicitly allowed:

- Adding `unstable_cache` wrappers
- Adding/calling `revalidateTag`
- Splitting `getCommandData` into smaller cacheable functions if needed for Suspense streaming
- Replacing `router.refresh()` with targeted revalidation

The following are **out of scope** (Tier 2, future PRDs):

- Rewriting Prisma queries (e.g., `groupBy` instead of nested `findMany`)
- Changing query joins, includes, or projections to reduce row count
- Parallelizing sequential awaits in pages other than Home
- Modifying the Prisma schema

### 4.5 Active Tab Tap Behavior

When the user taps the tab they are already on, the loading skeleton should NOT flash. Verify this in `components/nav/BottomNav.tsx` — Next.js's default `<Link>` behavior already handles this correctly, but the manual test plan must confirm it.

---

## 5. Non-Goals (Out of Scope)

- Query optimization (e.g., flattening `getRecentOpponents` in `app/(tabs)/stats/page.tsx`) — Tier 2
- Parallelizing sequential awaits in `stats/page.tsx`, `profile/page.tsx`, etc. — Tier 2
- Database schema changes or migrations
- Adjusting Supabase pgbouncer `connection_limit` — Tier 3
- Replacing `unstable_cache` with Redis or Upstash caching
- Animation/transition tuning of the existing `app/(tabs)/template.tsx` `page-enter` class
- Server-side rendering tuning beyond Suspense streaming on Home (other tabs only get loading skeletons in this PRD)
- Lighthouse / Web Vitals instrumentation — measurement is manual per §8

---

## 6. Design Considerations

- Skeletons should feel like the app, not a generic loading bar. Use the same rounded corners (`rounded-xl`, `rounded-2xl`), the same dark palette, and the same spacing the real screens use.
- For Home, the rating block is the visual anchor — getting that to render fast is the most important user-perceived win. Match history and key drivers loading 200–400ms later behind Suspense will feel snappy as long as the rating shows up first.
- No third-party skeleton library — keep the dependency list flat. Tailwind `animate-pulse` plus the existing `bg-zinc-800/40` palette is enough.
- Match the `max-w-xl mx-auto` width constraint used in `app/(tabs)/layout.tsx` so skeletons don't shift when real content arrives.

---

## 7. Technical Considerations

- **`force-dynamic` interaction with `unstable_cache`:** Per the project memory and CLAUDE.md, `getCommandData` is already wrapped in `unstable_cache`, but the Home page's `force-dynamic` directive defeats it. Removing the directive is the unlock.
- **Cache invalidation correctness:** After match submission, the submitter's Home view must reflect the new match. The current `router.refresh()` works because everything is dynamic; after this PRD, a `revalidateTag` call replaces it. Test this carefully — a stale Home after submission would be a regression.
- **pgBouncer + `connection_limit=1`:** The project uses Supabase pgBouncer with a single connection (per CLAUDE.md). Caching reduces query volume, which indirectly helps connection contention. Bumping the limit itself is a Tier 3 task and out of scope here.
- **Server actions vs. API routes for revalidation:** Either is acceptable. Pick whichever fits cleanest with the existing match-submission flow in `app/api/matches/route.ts`.
- **No `prisma generate` needed** — this PRD doesn't touch the schema, so the Prisma client regeneration step in CLAUDE.md does not apply.

---

## 8. Success Metrics (Manual Test Plan)

Success is measured **subjectively** via a manual test on a real mobile device, not via Web Vitals or automated metrics.

**Test script:**

1. Open the app, sign in.
2. From Home, tap Match. Count "one Mississippi" — visual feedback (skeleton or new screen) should appear before "two."
3. From Match, tap Stats. Same standard.
4. From Stats, tap Home. Same standard.
5. Repeat from each tab to each other tab (3 × 3 = 9 transitions, minus 3 same-tab cases = 6 transitions).
6. Tap Home while already on Home — confirm no skeleton flash.
7. Tap Profile from the top header on each tab — confirm Profile shows skeleton instantly.
8. Submit a match from Match tab. After success, navigate to Home — confirm the new match appears within 1 second (revalidation worked).

**Pass criteria:**

- Every transition shows visual feedback within ~100ms (subjectively "instant")
- Home's rating number appears within ~500ms on a warm cache
- After match submission, Home reflects the new match without a hard refresh
- No skeleton flash when tapping the active tab

---

## 9. Resolved Decisions

1. **Cache tag granularity: per-user.** Use `command-data:${userId}` rather than a single shared tag. The match submission endpoint will resolve the affected `userId`s (claimed players only — shadow profiles have `userId = null` and are skipped) and call `revalidateTag` once per affected user. This avoids cache thrash on busy nights when many matches are recorded.
2. **Match (`/enter`) skeleton scope: form structure only.** Skeleton renders the admin toggle, text-mode toggle, two team cards, score input, and submit button. The recent-players chip strip is populated by a post-mount client `fetch`, so a skeleton there would double-flash; omit it.
3. **Home streaming approach: single `getCommandData` function with multiple Suspense boundaries.** Each section (`RatingCard`, `DriversGrid`, `MatchHistorySection`, `EditTimerLink`) is its own async server component that awaits `getCommandData` directly. Because `getCommandData` is `unstable_cache`-wrapped, repeat awaits within the same request resolve from the same cached value — no duplicate query work. Splitting `getCommandData` into per-section functions is deferred to a Tier 2 follow-up.

---

## 10. Future Work — Tier 2 and Tier 3 (Separate PRDs)

The following improvements were identified during the audit but are explicitly **out of scope** for this PRD. They should each get their own PRD when prioritized.

### Tier 2 — Backend / Query Optimization

- **Parallelize `app/(tabs)/stats/page.tsx`:** Currently four sequential awaits (session → player → tag rows → recent opponents). Wrap in `Promise.all`.
- **Slim `getRecentOpponents`:** Replace the 50-match deep `findMany` with a single `groupBy` or raw SQL that returns 8 distinct opponents directly. Drops query weight ~10×.
- **Parallelize `app/(tabs)/profile/page.tsx`:** Two sequential awaits that should be `Promise.all`.
- **Merge Enter page client fetches:** `app/(tabs)/enter/page.tsx` makes two `useEffect` fetch calls on mount (`/api/players/recent`, `/api/tags`). Combine into one `/api/enter/bootstrap` endpoint.
- **Apply Suspense streaming to other tabs:** This PRD only streams Home. Stats and Profile would benefit from the same treatment.
- **Profile slow queries with `EXPLAIN ANALYZE`:** Confirm which Prisma queries actually dominate the wait — measurement before more optimization.

### Tier 3 — Infrastructure

- **Increase pgBouncer `connection_limit`:** Currently `1`, which serializes all DB work under any concurrency. Even `5` would dramatically change perceived latency.
- **Drop or shorten the `page-enter` template animation** in `app/(tabs)/template.tsx` if it adds perceived lag on top of the new instant-skeleton behavior.
- **Lighthouse / Web Vitals instrumentation:** If subjective testing per §8 surfaces ambiguity, add real measurement.
