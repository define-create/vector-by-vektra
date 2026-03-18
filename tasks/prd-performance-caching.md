# PRD: Performance — Response Caching with Next.js unstable_cache

## 1. Introduction / Overview

Even after query consolidation and background recompute, several endpoints recompute expensive results from scratch on every request: tournament leaderboards re-run full H2H tiebreaker logic, the dashboard re-fetches and re-processes all match data, and there is no layer preventing redundant DB work when multiple users hit the same route within seconds of each other.

This PRD covers adding Next.js `unstable_cache` (the recommended server-side caching primitive in Next.js 14+) to expensive data fetching functions, with targeted cache invalidation when the underlying data changes.

---

## 2. Goals

- Avoid redundant DB queries when multiple users load the same data within the same time window
- Tournament leaderboards serve from cache except immediately after a match is added
- Dashboard data serves from cache and refreshes automatically after recompute
- Zero new infrastructure — `unstable_cache` uses Next.js's built-in data cache (no Redis required)

---

## 3. User Stories

- **As a user**, the tournament leaderboard loads instantly on repeat visits — it doesn't re-query the database every time someone opens it.
- **As a user**, if 10 players all open the Command dashboard at the same time, the database only runs the query once and serves all 10 from cache.
- **As a user**, after a new match is submitted and recompute runs, my dashboard reflects the new data on the next page load without needing to hard-refresh.

---

## 4. Functional Requirements

### 4.1 Cache the Dashboard Query (command.ts)

**File:** `lib/services/command.ts`

Wrap the main data-fetching function with `unstable_cache`. The cache key should include the `userId` so each user gets their own cached result.

```typescript
import { unstable_cache } from "next/cache";

export const getCommandData = unstable_cache(
  async (userId: string) => {
    // ... existing query logic ...
  },
  ["command-data"],           // cache key prefix
  {
    tags: ["command"],        // invalidation tag
    revalidate: 300,          // fallback: revalidate every 5 minutes
  }
);
```

**Cache invalidation:** In `app/api/cron/recompute/route.ts` (from the background recompute PRD), after `runRecompute()` completes, call:

```typescript
import { revalidateTag } from "next/cache";
revalidateTag("command");
```

This invalidates all users' cached command data simultaneously when new ratings are available.

**Note on per-user caching:** `unstable_cache` caches per unique set of arguments. Since `userId` is an argument, each user's data is cached independently. This is correct — each user sees their own match history and rating.

### 4.2 Cache Tournament Leaderboard Data

**File:** `lib/services/tournament.ts`

Wrap `getTournamentData` with `unstable_cache`, keyed by the tournament `tag`:

```typescript
import { unstable_cache } from "next/cache";

export const getTournamentData = unstable_cache(
  async (tag: string): Promise<TournamentData> => {
    // ... existing leaderboard + H2H logic ...
  },
  ["tournament-data"],
  {
    tags: ["tournament"],
    revalidate: 60,   // fallback: revalidate every 60 seconds
  }
);
```

**Cache invalidation:** When a match is submitted with a `tag` field (i.e., a tournament match), call `revalidateTag("tournament")` at the end of `POST /api/matches`. This ensures the leaderboard reflects the new result as soon as recompute catches up.

For more granular invalidation (only the specific tournament's cache), use a tag like `tournament-${tag}` and invalidate only that tag.

**Files to modify:**
- `lib/services/tournament.ts` — wrap with `unstable_cache`
- `app/api/matches/route.ts` — call `revalidateTag("tournament")` after saving a tournament match

### 4.3 Cache Community Stats Read

**File:** `lib/services/command.ts`

After implementing the `CommunityStats` denormalized table (from the Query Optimization PRD), the single-row read is already fast. However, if `command.ts` is wrapped with `unstable_cache` per 4.1 above, community stats are automatically cached alongside it. No additional caching step needed.

If community stats are exposed via a separate API endpoint in the future, wrap that endpoint's data function with `unstable_cache` and the `"command"` tag.

### 4.4 Cache Player Win% (Admin Search)

**File:** `app/api/players/search/route.ts`

After the Query Optimization PRD stores `winPct` on the `Player` model, this is automatically a simple indexed column read — no expensive computation. No caching needed here.

If `includeStats=true` search results are still expensive after query optimization, wrap the enrichment logic with `unstable_cache` keyed by the search query string:

```typescript
const getSearchResults = unstable_cache(
  async (query: string, includeStats: boolean) => { ... },
  ["player-search"],
  { tags: ["players"], revalidate: 120 }
);
```

Invalidate `"players"` tag when player data changes (new player created, player merged, etc.).

---

## 5. Non-Goals (Out of Scope)

- Redis or any external caching infrastructure
- Client-side caching / SWR / React Query
- Cache warming (pre-populating cache before first request)
- CDN-level caching of API responses
- Caching authentication or session data

---

## 6. Technical Considerations

- **`unstable_cache` is Next.js's recommended server cache** as of Next.js 14+. Despite the name, it is stable in production use. It is scheduled to be replaced by `"use cache"` directive in a future Next.js version, but the API is compatible and migration will be straightforward.
- **Cache is in-process per serverless instance.** On Vercel, each serverless function invocation may run in a different instance. This means cache hits are not guaranteed across concurrent requests — two simultaneous cold requests could both trigger a DB query. This is acceptable (better than no cache) but is different from a shared Redis cache.
- **`revalidateTag` only works inside Server Actions or Route Handlers** — it cannot be called from a plain utility function. Ensure invalidation calls are placed in route handler files.
- **`revalidate` fallback time:** The `revalidate: 300` (5 minutes) on command data matches the cron interval. If the cron runs and invalidates the tag, the 300s fallback never triggers. It's a safety net for edge cases where the cron fails.
- **Testing locally:** Next.js dev mode (`npm run dev`) does NOT cache — `unstable_cache` only has effect in production builds (`npm run build && npm start`). Test caching behavior with a production build.

---

## 7. Success Metrics

- Tournament leaderboard DB query count drops by ≥ 80% during a tournament event (10+ users viewing leaderboard)
- Dashboard loads from cache for repeat visitors within the cache window (verify via Vercel function invocation logs — DB query count should be near-zero on cache hits)
- Cache invalidation works correctly: after a match is submitted and recompute runs, the next dashboard load reflects the new rating (not stale data)
- No stale data visible to users beyond the defined revalidation window

---

## 8. Open Questions

- Should per-user dashboard cache be invalidated immediately when *that user* submits a match (so they see the "pending" state rather than stale old data)? If so, call `revalidateTag(`command-${userId}`)` after match submission with a more specific tag.
- Is there a monitoring/observability setup to measure cache hit rates? (Vercel Analytics shows function invocation counts but not cache hit ratios.)
