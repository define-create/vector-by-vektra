# PRD: Performance — Query Optimization

## 1. Introduction / Overview

The dashboard API (`/api/command`) runs 6+ separate database queries per page load, several of which fetch overlapping nested data. Community statistics (avg/min/max rating across all players) are recomputed from a full table scan on every single dashboard view. Player search executes one DB query per result to compute win rates (N+1 pattern). These issues compound at scale, turning a single page load into dozens of round-trips.

This PRD covers consolidating queries, denormalizing community stats, and eliminating the N+1 win rate pattern.

---

## 2. Goals

- Reduce dashboard load from 6+ DB queries to 3 or fewer
- Eliminate the full-table community stats scan on every request
- Fix the N+1 win% query pattern in player search
- Achieve dashboard load < 500ms at 200 concurrent users

---

## 3. User Stories

- **As a user**, the dashboard (Command screen) loads in under 500ms even when other users are also loading the app simultaneously.
- **As an admin**, the player search in the admin panel returns enriched results (with win rates) quickly, even with hundreds of players.
- **As any user**, navigating between screens feels snappy — no spinner visible on the Command screen during normal conditions.

---

## 4. Functional Requirements

### 4.1 Denormalize Community Stats

**Problem:** `lib/services/command.ts` runs `prisma.player.aggregate()` (avg/min/max rating, total count) on every dashboard load. This is a full table scan that grows with player count.

**Solution:** Store community stats in a dedicated table that is updated only when ratings change (i.e., during recompute).

**Step 1 — Add a `CommunityStats` model to `prisma/schema.prisma`:**

```prisma
model CommunityStats {
  id         Int      @id @default(1)  // Always a single row
  avgRating  Float
  minRating  Float
  maxRating  Float
  totalCount Int
  updatedAt  DateTime @updatedAt
}
```

**Step 2 — Update `lib/services/recompute.ts`:** At the end of each recompute run, after updating all player ratings, compute and upsert the community stats row:

```typescript
const ratings = [...finalRatings.values()];
await prisma.communityStats.upsert({
  where: { id: 1 },
  update: {
    avgRating: ratings.reduce((s, r) => s + r, 0) / ratings.length,
    minRating: Math.min(...ratings),
    maxRating: Math.max(...ratings),
    totalCount: ratings.length,
  },
  create: {
    id: 1,
    avgRating: ratings.reduce((s, r) => s + r, 0) / ratings.length,
    minRating: Math.min(...ratings),
    maxRating: Math.max(...ratings),
    totalCount: ratings.length,
  },
});
```

**Step 3 — Update `lib/services/command.ts`:** Replace the `player.aggregate()` call with a single `communityStats.findUnique({ where: { id: 1 } })`. If the row doesn't exist yet (first run before any recompute), return `null` for community stats — the dashboard handles this gracefully already.

**Files to modify:**
- `prisma/schema.prisma` — add `CommunityStats` model
- `lib/services/recompute.ts` — upsert stats at end of recompute
- `lib/services/command.ts` — read from `CommunityStats` table instead of aggregate

### 4.2 Consolidate dashboard queries in command.ts

**Problem:** `lib/services/command.ts` makes 6 separate `Promise.all` grouped queries. Two of them (`recentOpponentParticipants` and `historyParticipants`) both fetch `match → participants → player` in slightly different shapes, causing overlapping DB round-trips.

**Solution:** Consolidate into a single broader `matchParticipant.findMany` that fetches all needed match data in one query, then split the results in JavaScript.

**Approach:**
1. Fetch all of the current player's match participations in one query, including: match metadata, games, all participants, and participant player ratings.
2. In JavaScript, derive: `filteredMatches`, `recentOpponentParticipants`, and `historyParticipants` from this single result set.
3. Fetch `filteredSnapshots` and `communityStats` in a separate `Promise.all` alongside the main match query (2 total parallel queries instead of 6 serial ones).

**Files to modify:**
- `lib/services/command.ts` — restructure the main data-fetching section

### 4.3 Fix N+1 Win% in Player Search

**Problem:** `app/api/players/search/route.ts` calls `computeWinPct(p.id, prisma)` for each result in a `Promise.all(players.map(...))`. Each `computeWinPct` runs a separate DB query. With 10 results = 10 queries.

**Solution A (Preferred — cache on Player):** Store `winPct` as a computed column on the `Player` model, updated during recompute alongside the rating. This reduces the search query to zero extra lookups.

Add to `prisma/schema.prisma`:
```prisma
model Player {
  // ...existing fields...
  winPct  Float?  // Nullable; null until first recompute
}
```

In `lib/services/recompute.ts`, include `winPct` in the `player.update()` call at the end of recompute.

In `app/api/players/search/route.ts`, read `player.winPct` directly instead of calling `computeWinPct`.

**Solution B (Alternative — batch query):** If adding a column is undesirable, replace the per-player query with one batch query: fetch all `MatchParticipant` rows for the matched player IDs in a single `findMany`, then group and compute win% in JavaScript.

**Recommended:** Solution A (column on Player) is simpler and makes win% available everywhere without extra queries.

**Files to modify:**
- `prisma/schema.prisma` — add `winPct Float?` to `Player`
- `lib/services/recompute.ts` — compute and store win% per player
- `app/api/players/search/route.ts` — read `player.winPct` instead of calling `computeWinPct`
- `lib/services/players.ts` — `computeWinPct` can be kept for backwards compatibility or removed

### 4.4 Trim Nested Includes on Opponent Rating Fetch

**Problem:** `lib/services/command.ts` fetches 20 recent match participations with full nested participant + player includes just to extract opponent ratings for the upcoming match probability calculation. This pulls ~80+ rows per dashboard load when only 4 values are needed.

**Solution:** Add explicit `select` to the nested participant include to fetch only `playerId` and `player.rating`:

```typescript
participants: {
  select: {
    playerId: true,
    player: { select: { rating: true } },
  },
},
```

**Files to modify:**
- `lib/services/command.ts` — add `select` to nested participant/player includes

### 4.5 Trim Full Game Rows on H2H Query

**Problem:** `app/api/matchups/[playerId]/route.ts` fetches full `Game` records just to determine match outcome (team 1 wins vs team 2 wins). Only scores are needed.

**Solution:** Add select to the games include:

```typescript
games: {
  select: { team1Score: true, team2Score: true },
}
```

**Files to modify:**
- `app/api/matchups/[playerId]/route.ts` — narrow the `games` include

---

## 5. Non-Goals (Out of Scope)

- Caching responses with `unstable_cache` (covered in a separate PRD)
- Background recompute decoupling (covered in a separate PRD)
- Rewriting the recompute algorithm to be incremental
- Adding GraphQL or a different query layer

---

## 6. Technical Considerations

- When adding `winPct` to the `Player` model, run `npx prisma generate` after schema changes, then apply the migration via the Supabase SQL editor (`ALTER TABLE "Player" ADD COLUMN "winPct" DOUBLE PRECISION;`) — do NOT use `prisma migrate deploy` through pgBouncer.
- The `CommunityStats` table with `id: 1` (singleton pattern) is the simplest approach. Alternative: a materialized view in Postgres — but that requires Supabase SQL migrations and doesn't integrate as cleanly with Prisma.
- Query consolidation in 4.2 trades multiple small queries for one larger query. Verify with `EXPLAIN ANALYZE` that the consolidated query uses indexes and doesn't balloon the result size.

---

## 7. Success Metrics

- `/api/command` P95 response time < 500ms at 200 concurrent users
- `/api/players/search` with `includeStats=true` executes ≤ 2 DB queries regardless of result count
- `EXPLAIN ANALYZE` on the consolidated dashboard query shows index scans, not sequential scans
- Community stats aggregate query (`player.aggregate`) no longer appears in DB query logs

---

## 8. Open Questions

- Is there a Prisma query logging / monitoring setup in place, or should one be added to baseline before and after these changes?
- Are there any other callers of `computeWinPct` outside of player search that would need updating if the function is removed?
