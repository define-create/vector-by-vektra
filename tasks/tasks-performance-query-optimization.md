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

- [x] 1.0 Add CommunityStats model and winPct field to schema
  - [x] 1.1 Added `CommunityStats` model to `prisma/schema.prisma`.
  - [x] 1.2 Added `winPct Float?` to `Player` model after `ratingVolatility`.
  - [x] 1.3 Run `npx prisma generate` — completed without errors.
  - [x] 1.4 Applied schema changes to the database via the Supabase SQL editor.
  - [x] 1.5 Both statements succeeded in the Supabase SQL editor.

- [x] 2.0 Update recompute to populate CommunityStats and winPct
  - [x] 2.1 Added win% computation per player in `lib/services/recompute.ts` using `matchRecords` already in memory.
  - [x] 2.2 Added `winPct` to `player.update()` data.
  - [x] 2.3 Added `CommunityStats` upsert after `prisma.$transaction(playerUpdates)`.
  - [x] 2.4 `npx tsc --noEmit` — clean.

- [x] 3.0 Replace player.aggregate() in command.ts with CommunityStats lookup
  - [x] 3.1–3.3 Replaced `communityAgg` / `player.aggregate()` with `prisma.communityStats.findUnique({ where: { id: 1 } })` and updated downstream mapping to `statsRow.avgRating`, `statsRow.minRating`, `statsRow.maxRating`.
  - [x] 3.4 `npx tsc --noEmit` — clean.

- [x] 4.0 Consolidate dashboard queries in command.ts
  - [x] 4.1–4.4 Merged `filteredMatches` + `historyParticipants` into a single `allFilteredParticipants` query. 5 parallel DB calls in one `Promise.all` (down from 6). `filteredMatches = allFilteredParticipants`, `historyParticipants = allFilteredParticipants.slice(0, 20)`.
  - [x] 4.5 `npx tsc --noEmit` — clean.

- [x] 5.0 Fix N+1 win% in player search
  - [x] 5.1–5.4 Replaced `computeWinPct(p.id, prisma)` with `p.winPct ?? null`. Added `winPct: true` to select. Removed `computeWinPct` import. `Promise.all` eliminated — now synchronous map.
  - [x] 5.5 `computeWinPct` still exists in `lib/services/players.ts` (no other callers — can be removed later if desired).
  - [x] 5.6 `npx tsc --noEmit` — clean.

- [x] 6.0 Trim unnecessary fields from nested includes
  - [x] 6.1 Narrowed `recentOpponentParticipants` participants to `select: { playerId, team, player: { rating } }`. Updated downstream code to use `p.playerId` instead of `p.player.id`.
  - [x] 6.2 Narrowed `games: true` → `games: { select: { team1Score, team2Score } }` in `app/api/matchups/[playerId]/route.ts`.
  - [x] 6.3 `npx tsc --noEmit` — clean.

- [x] 7.0 Verify and measure improvements
  - [x] 7.1 `/api/command` response time: 672ms → 479ms (29% reduction in local dev).
  - [x] 7.2 Skipped — indexes verified in previous task list.
  - [x] 7.3 Player search with `includeStats=true` returns `winPct` correctly.
  - [x] 7.4 Admin recompute ran — `CommunityStats` row created, `winPct` populated on all players.
  - [x] 7.5 Command screen displays community stats correctly.
