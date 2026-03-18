## Relevant Files

- `prisma/schema.prisma` - Add `CommunityStats` model and `winPct Float?` field to `Player`.
- `lib/services/recompute.ts` - Add `winPct` to player.update() call; upsert `CommunityStats` row after recompute.
- `lib/services/command.ts` - Replace `player.aggregate()` with `communityStats.findUnique()`; consolidate 6 queries into 2; add `select` to trim nested participant includes.
- `lib/services/players.ts` - `computeWinPct` function (lines 11–40); can be removed after win% is stored on Player.
- `app/api/players/search/route.ts` - Replace `computeWinPct` call (line 84) with direct `player.winPct` read.
- `app/api/matchups/[playerId]/route.ts` - Narrow `games: true` (line 95) to `games: { select: { team1Score: true, team2Score: true } }`.

### Notes

- Schema changes require two steps: (1) edit `schema.prisma` + run `npx prisma generate`, (2) apply raw SQL in Supabase SQL editor (do NOT use `prisma migrate deploy` through pgBouncer).
- The `CommunityStats` singleton (id=1) will be null until the first recompute runs. The dashboard already handles `communityStats: null` gracefully — no client changes needed.
- Tasks 1–3 (CommunityStats) should be completed before task 4 (query consolidation) since task 4 references the new `communityStats.findUnique()` call.
- Task 5 (winPct on Player) depends on the recompute change in task 2.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after the parent task.

## Tasks

- [ ] 1.0 Add CommunityStats model and winPct field to schema
  - [ ] 1.1 Open `prisma/schema.prisma`. Add the following new model at the end of the file (before any enum definitions):
    ```prisma
    model CommunityStats {
      id         Int      @id @default(1)
      avgRating  Float
      minRating  Float
      maxRating  Float
      totalCount Int
      updatedAt  DateTime @updatedAt
    }
    ```
  - [ ] 1.2 In the `Player` model (line 93), add `winPct Float?` as a new field after `ratingVolatility`.
  - [ ] 1.3 Run `npx prisma generate` and confirm it completes without errors.
  - [ ] 1.4 Apply the schema changes to the database via the Supabase SQL editor:
    ```sql
    CREATE TABLE IF NOT EXISTS "CommunityStats" (
      "id" INTEGER NOT NULL DEFAULT 1,
      "avgRating" DOUBLE PRECISION NOT NULL,
      "minRating" DOUBLE PRECISION NOT NULL,
      "maxRating" DOUBLE PRECISION NOT NULL,
      "totalCount" INTEGER NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "CommunityStats_pkey" PRIMARY KEY ("id")
    );

    ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "winPct" DOUBLE PRECISION;
    ```
  - [ ] 1.5 Confirm both statements succeed in the Supabase SQL editor with no errors.

- [ ] 2.0 Update recompute to populate CommunityStats and winPct
  - [ ] 2.1 Open `lib/services/recompute.ts`. Find the player.update() loop (around line 92–103). Before the `prisma.$transaction(playerUpdates)` call, add the win% computation for each player. Win% = (games where this player's team scored more than opponent) / total completed games. Look at how `computeWinPct` in `lib/services/players.ts` (lines 11–40) calculates this, and replicate the logic using data already loaded in memory during the recompute (the `matchRecords` array already has all participants and game scores).
  - [ ] 2.2 Add `winPct` to the data object inside the `player.update()` mapping (around line 100):
    ```typescript
    winPct: computedWinPctForPlayer, // computed per-player in 2.1
    ```
  - [ ] 2.3 After the `prisma.$transaction(playerUpdates)` call, add the `CommunityStats` upsert:
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
  - [ ] 2.4 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [ ] 3.0 Replace player.aggregate() in command.ts with CommunityStats lookup
  - [ ] 3.1 Open `lib/services/command.ts`. Find the `communityAgg` query (lines 183–189):
    ```typescript
    prisma.player.aggregate({
      where: { deletedAt: null },
      _avg: { rating: true },
      _min: { rating: true },
      _max: { rating: true },
      _count: { id: true },
    })
    ```
  - [ ] 3.2 Replace it with:
    ```typescript
    prisma.communityStats.findUnique({ where: { id: 1 } })
    ```
  - [ ] 3.3 Find where the `communityAgg` result is used to build the `communityStats` return value (look for references to `communityAgg._avg`, `communityAgg._min`, etc.) and update the property mapping to read from the new flat structure (`communityStats.avgRating`, `communityStats.minRating`, etc.). If the result is `null` (no recompute has run yet), pass `null` through — the dashboard already handles this.
  - [ ] 3.4 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [ ] 4.0 Consolidate dashboard queries in command.ts
  - [ ] 4.1 Open `lib/services/command.ts`. Identify the 6 queries currently running (lines 124–209): `filteredMatches`, `filteredSnapshots`, `editableMatch`, `recentOpponentParticipants`, `communityAgg` (now replaced in task 3), and `historyParticipants`.
  - [ ] 4.2 Note that `filteredMatches` (lines 133–147) and `historyParticipants` (lines 192–208) both fetch match participations with nested player data in slightly different shapes. Consolidate them into a single `matchParticipant.findMany()` that fetches: match metadata, games, ratingSnapshots, all participants with player `id`, `displayName`, and `rating`.
  - [ ] 4.3 After fetching the single combined result, derive the data each downstream section needs in JavaScript (no additional DB calls):
    - `filteredMatches` — filter the combined result by `voidedAt === null` and date/tag filters
    - `recentOpponentParticipants` — take the 20 most recent and extract opponent ratings
    - `historyParticipants` — take the same filtered set used for match history
  - [ ] 4.4 Run the remaining queries (`filteredSnapshots`, `editableMatch`, `communityStats`) in a single `Promise.all` alongside the consolidated match query — 2 parallel DB calls instead of 6.
  - [ ] 4.5 Run `npx tsc --noEmit` to confirm no TypeScript errors, then test the Command screen loads correctly with accurate data.

- [ ] 5.0 Fix N+1 win% in player search
  - [ ] 5.1 Open `app/api/players/search/route.ts`. Find the `computeWinPct(p.id, prisma)` call (line 84) inside the `Promise.all(players.map(...))` block.
  - [ ] 5.2 Replace the call with `p.winPct ?? null` — reading the pre-computed value directly from the Player record returned by the search query.
  - [ ] 5.3 Confirm `winPct` is included in the player fields returned by the search query (check the `select` or `include` on the `prisma.player.findMany()` call earlier in the route). If it's not selected, add `winPct: true` to the select.
  - [ ] 5.4 Remove the `computeWinPct` import from the top of `app/api/players/search/route.ts`.
  - [ ] 5.5 Optionally remove `lib/services/players.ts`'s `computeWinPct` function if it has no other callers. Verify with a project-wide search for `computeWinPct` before deleting.
  - [ ] 5.6 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [ ] 6.0 Trim unnecessary fields from nested includes
  - [ ] 6.1 Open `lib/services/command.ts`. Find the `recentOpponentParticipants` query (lines 167–180). Add an explicit `select` to the nested `participants` include so only `playerId` and `player.rating` are fetched (instead of the full player object):
    ```typescript
    participants: {
      select: {
        playerId: true,
        team: true,
        player: { select: { rating: true } },
      },
    },
    ```
    (If task 4 consolidated this into the main query, apply the narrowed select there instead.)
  - [ ] 6.2 Open `app/api/matchups/[playerId]/route.ts`. Find the `games: true` include (line 95). Replace with:
    ```typescript
    games: {
      select: { team1Score: true, team2Score: true },
    }
    ```
  - [ ] 6.3 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [ ] 7.0 Verify and measure improvements
  - [ ] 7.1 Load the Command screen in the browser. Open DevTools → Network tab. Measure the `/api/command` response time before and after. Target: ≥ 40% reduction.
  - [ ] 7.2 In the Supabase SQL editor, run `EXPLAIN ANALYZE` on the consolidated match query to confirm index scans are being used (no `Seq Scan` on `MatchParticipant` or `Match`).
  - [ ] 7.3 Test the player search in the admin panel with `includeStats=true` and confirm it returns quickly (target: < 200ms). Verify `winPct` values are present and sensible.
  - [ ] 7.4 Trigger a manual admin recompute and verify the `CommunityStats` row is created/updated in the database (check via Supabase table editor).
  - [ ] 7.5 Confirm the Command screen still displays community stats correctly after the switch from `player.aggregate()` to `communityStats.findUnique()`.
