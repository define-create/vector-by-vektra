# PRD: Incremental Rating Recompute + Score Edit Window

## 1. Introduction / Overview

**Problem:** Every time a match is saved, the app replays the full history of all non-voided matches from match #1 to recompute ELO ratings. This is correct but scales linearly with match count — at 1,000+ matches it adds noticeable latency per save; at 10,000+ it risks exceeding Vercel's function timeout. Voiding a match does not currently trigger any recompute at all, leaving ratings stale until the next match save or manual admin recompute.

A secondary gap: the score edit feature is fully built (edit page, API endpoint, countdown timer on Command screen) but the edit window is 60 minutes and the endpoint calls a full recompute instead of an incremental one.

**Solution:** Three coordinated changes:
1. Replace the full replay with an *incremental* replay that starts from the insertion point and replays only forward, using stored `RatingSnapshot` rows as the starting state.
2. Trigger a full recompute automatically after every match void.
3. Change the score edit window from 60 to 20 minutes, and wire the existing edit endpoint to use incremental recompute.

**Goal:** Keep match-save latency flat regardless of total match history size, while preserving full correctness for all write operations (new match, void, score edit).

---

## 2. Goals

1. Match save latency stays under 3 seconds at 10,000+ total matches.
2. Ratings are always correct after a match save, void, or score edit.
3. Voiding a match automatically corrects ratings without requiring a manual admin recompute.
4. If two match saves happen concurrently (concurrency guard fires), the second match's ratings are updated automatically — not left stale.
5. All triggers (save, void, edit) emit a `RatingRun` record with enough metadata to audit what was replayed.
6. Admins can diagnose rating anomalies using the recompute run history (scope + starting point visible).
7. The admin "Force Full Recompute" option remains available as a correctness recovery tool.

---

## 3. User Stories

- **As an admin entering a match**, I want ratings to update immediately after saving so I can see the new standings without waiting or refreshing manually.
- **As a player who just entered a match and made a typo in the score**, I want to correct it within 20 minutes using the edit timer already on the Command screen.
- **As an admin voiding a match**, I want ratings to correct themselves automatically so I don't have to remember to click "Force Recompute" afterwards.
- **As a user whose match save took slightly longer due to a concurrent recompute**, I want a clear "ratings are updating" notice so I'm not confused by stale numbers.
- **As an admin investigating a rating anomaly**, I want to see in the run history whether each recompute was a full replay or incremental, and from what match it started, so I can trace the root cause without querying the database directly.
- **As an admin who suspects incremental produced a wrong result**, I want to trigger a full recompute from scratch to restore confidence.

---

## 4. Functional Requirements

### 4.1 Core incremental replay logic (`lib/services/recompute.ts`)

**`runRecompute` signature change:**

```ts
// Current
runRecompute(runType: RatingRunType, notes?: string): Promise<RecomputeResult>

// New
runRecompute(runType: RatingRunType, notes?: string, fromDate?: Date): Promise<RecomputeResult>
```

`fromDate` is optional. When absent or `null`, behavior is identical to today (full replay). All existing callers continue to work unchanged.

1. When `fromDate` is provided, only matches with `matchDate >= fromDate` must be fetched and replayed, ordered `[matchDate ASC, createdAt ASC]` — the same ordering as the full replay.
2. When `fromDate` is provided, the system must load each affected player's starting rating from `RatingSnapshot` before computing the replay. See §6 (Starting-ratings lookup) for the exact algorithm.
3. Players with no prior snapshot (first match ever) must start at 1000, identical to the full-replay behavior.
4. The system must delete only `RatingSnapshot` rows for the replayed matches: `WHERE matchId IN (ids of replayed matches)`. Snapshots outside the replayed range must not be touched.
5. After deleting, the system must bulk-insert fresh snapshots for the replayed matches.
6. The system must update `Player.rating`, `Player.ratingConfidence`, `Player.ratingVolatility`, and `Player.winPct` only for players who appeared in the replayed matches. Players outside the replayed range keep their existing values.
7. **`CommunityStats` must always be computed from all players' current ratings**, not only the replayed subset. After updating the replayed players, the system must fetch `Player.rating` for all active players (those with at least one non-voided match) to compute the correct `avgRating`, `minRating`, `maxRating`, and `totalCount`. This applies to both incremental and full runs.
8. When `fromDate` is absent or `null`, the system must perform the current full-replay behavior: delete all snapshots, replay all matches, update all players.
9. The `RatingRun` record must store two new fields:
   - `replayScope: "incremental" | "full"` — set on creation
   - `fromMatchId: string | null` — the ID of the earliest match replayed in an incremental run; `null` for full runs

**`replayAllMatches` signature change (`lib/rating-engine.ts`):**

```ts
// Current
replayAllMatches(matches: MatchRecord[], runId: string)

// New
replayAllMatches(matches: MatchRecord[], runId: string, startingRatings?: Map<string, number>)
```

10. When `startingRatings` is provided, players in the map must start at their stored rating. Players absent from the map start at 1000. This is the only change to `replayAllMatches` — all other replay logic is unchanged.

### 4.2 Concurrency guard — wait-and-retry

*The existing guard currently skips and returns immediately when a run is in progress. This section replaces that behavior.*

11. When the concurrency guard detects a live run in progress, the system must poll `RatingRun.status` at 500ms intervals until the active run reaches `succeeded` or `failed`, up to a hard maximum of 10 seconds (20 polls).
12. Once the active run finishes within the timeout, the system must trigger an incremental recompute for the waiting match's `fromDate` and complete normally.
13. If the 10-second timeout elapses without the active run finishing, the system must return `{ ..., ratingsDeferred: true }` and log a warning. The nightly cron ensures eventual consistency.
14. If the active run is orphaned (age > 5 minutes at time of check), the system must mark it `failed` immediately and proceed without waiting — the existing orphan logic is unchanged.
15. The polling loop must use `setInterval`/`clearInterval` with a hard timeout guard. It must not use recursive `setTimeout` patterns that could accumulate on the call stack.

### 4.3 `ratingsDeferred` client signal

16. `POST /api/matches` must include `ratingsDeferred: boolean` in its 201 response body. It is `true` only when the 10-second concurrency wait elapsed and recompute was deferred.
17. `POST /api/admin/matches/[id]/void` must also include `ratingsDeferred: boolean` in its response (200), using the same logic — `true` only if the recompute was deferred by the concurrency guard.
18. The Enter page success state (`app/(tabs)/enter/page.tsx`) must check the `ratingsDeferred` flag from the match-save response. If `true`, it must display a non-blocking notice below the success confirmation: *"Ratings are updating in the background — check back in a moment."* This notice must not block navigation.
19. The notice must not appear on normal saves where `ratingsDeferred` is `false` or absent.
20. `PATCH /api/matches/[id]` must include `ratingsDeferred: boolean` in its response. The edit client (`components/enter/EditMatchClient.tsx`) must show the notice *"Scores updated. Ratings are updating in the background."* inline in the form for 2 seconds before navigating to `/command`. If `ratingsDeferred` is `false`, it must navigate immediately on success as it does today.

### 4.4 Void trigger

21. `POST /api/admin/matches/[id]/void` must call `runRecompute("admin", "auto: match void")` (full replay, no `fromDate`) after successfully setting `voidedAt`.
22. After the recompute completes (or is deferred), the void handler must call `revalidateTag("command", "default")` to invalidate the Command screen cache.
23. Recompute failure must not affect the void response. The void must persist and return 200. The recompute error must be logged server-side with the match ID.

### 4.5 Score edit — connect to incremental recompute + reduce window

*The score edit feature (API, page, form, countdown timer) is fully built. This section covers the three changes required.*

24. `PATCH /api/matches/[id]` must call `runRecompute("admin", "auto: score edit", match.matchDate)` (incremental) instead of the current `runRecompute("admin")` (full replay).
25. The edit window must change from 60 minutes to **20 minutes** in all six locations below. No other changes are needed for the window duration.

**Six locations (60 → 20 min):**

| File | Line (approx.) | Change |
|------|----------------|--------|
| `app/api/matches/route.ts` | ~258 | `60 * 60 * 1000` → `20 * 60 * 1000` |
| `app/api/matches/[id]/route.ts` | ~80 | `60 * 60 * 1000` → `20 * 60 * 1000` |
| `app/api/matches/[id]/route.ts` | ~83 | Error text: `"60-minute"` → `"20-minute"` |
| `lib/services/command.ts` | ~95 | Rename `sixtyMinutesAgo` → `twentyMinutesAgo`; update value |
| `lib/services/command.ts` | ~388 | `60 * 60 * 1000` → `20 * 60 * 1000` |
| `app/(tabs)/enter/edit/[id]/page.tsx` | ~33 | `60 * 60 * 1000` → `20 * 60 * 1000` |

### 4.6 Admin full recompute (unchanged behavior)

26. `POST /api/admin/recompute` must always perform a full replay (no `fromDate`). It must not use incremental logic regardless of what the default path uses.
27. The admin recompute run history table (`app/admin/recompute/page.tsx`) must display two additional columns: **Scope** (`full` / `incremental`) and **From Match** (the `fromMatchId` value, linked to the match detail if available; blank for full runs).

### 4.7 Nightly cron (safety net)

28. The existing nightly cron recompute must continue as a full replay. It is the catch-all for any edges where an incremental run was skipped or produced wrong results.

---

## 5. Non-Goals (Out of Scope)

- Building a score edit UI — it already exists end-to-end.
- Replacing the nightly full-replay cron with an incremental version.
- Match editing outside the 20-minute window — admin voiding + re-entering is the supported path.
- Editing players, match date, or tags within the edit window. Note: tag-only edits go through the same PATCH endpoint and will incidentally trigger an incremental recompute after this change. The recompute will produce identical ratings (scores unchanged) and is harmless.
- Admin bypass of the edit window — admins can void and re-enter.
- Distributed job queues, background workers, or infrastructure beyond Vercel + Supabase.
- Per-tournament or per-tag incremental recompute.
- Real-time push notifications when ratings finish updating.

---

## 6. Design Considerations

### `RatingRun` schema additions

```prisma
model RatingRun {
  // ...existing fields...
  replayScope  String   @default("full")   // "full" | "incremental"
  fromMatchId  String?                     // earliest match replayed (incremental only)
}
```

Defaults mean no migration is needed for existing rows — they read as `"full"` / `null`.

> **Important:** After editing `schema.prisma`, run `npx prisma generate` before testing. The generated client in `app/generated/prisma/` must be regenerated or the new fields will cause a `PrismaClientValidationError` at runtime.

### Starting-ratings lookup algorithm

The goal is: for each player who appears in a match at or after `fromDate`, find their rating immediately *before* that date boundary — i.e., after their last match where `matchDate < fromDate`.

Same-day ordering matters: if two matches share the same `matchDate`, they are ordered by `match.createdAt ASC` during replay. The starting rating must be after the last of those matches. To handle this, sort candidate snapshots by `matchDate DESC`, then by `match.createdAt DESC` as a tie-breaker (requires joining `RatingSnapshot` → `Match` on `matchId`).

```
affected_players = all distinct playerIds from matches WHERE matchDate >= fromDate

candidate_snapshots = RatingSnapshot
  JOIN Match ON RatingSnapshot.matchId = Match.id
  WHERE RatingSnapshot.playerId IN (affected_players)
    AND RatingSnapshot.matchDate < fromDate
  ORDER BY RatingSnapshot.matchDate DESC, Match.createdAt DESC

// In JS: keep only the first (most recent) snapshot per player
startingRatings = Map<playerId, rating>
for snapshot in candidate_snapshots:
  if playerId not in startingRatings:
    startingRatings[playerId] = snapshot.rating

// Players absent from startingRatings have no history before fromDate → start at 1000
// (handled by replayAllMatches when startingRatings is passed)
```

This is a single `findMany` with a join — not a per-player query.

### `CommunityStats` in incremental mode

`CommunityStats` (id=1) stores aggregate community ratings: `avgRating`, `minRating`, `maxRating`, `totalCount`. In incremental mode, `finalRatings` only contains players from the replayed subset, making it incorrect to compute stats from that map alone.

**Fix:** After updating the replayed players, run a separate query to fetch all active players' current ratings for the upsert:

```ts
const allActivePlayers = await prisma.player.findMany({
  where: { deletedAt: null },
  select: { rating: true },
});
const allRatings = allActivePlayers.map((p) => p.rating);
// use allRatings for CommunityStats upsert (both full and incremental paths)
```

This replaces computing stats from `finalRatings`. The same fix applies to the full-replay path for consistency.

### Snapshot delete scope

| Scenario | Snapshots deleted |
|----------|------------------|
| Full recompute | All rows (`deleteMany({})`) |
| Incremental recompute | Only `WHERE matchId IN (replayed match IDs)` |

### `replayAllMatches` — incremental initialization

```ts
// lib/rating-engine.ts (simplified)
function replayAllMatches(
  matches: MatchRecord[],
  runId: string,
  startingRatings?: Map<string, number>,
) {
  const ratings = new Map<string, number>();

  for (const match of matches) {
    for (const pid of [...match.team1PlayerIds, ...match.team2PlayerIds]) {
      if (!ratings.has(pid)) {
        // Use provided starting rating, or default to 1000
        ratings.set(pid, startingRatings?.get(pid) ?? 1000);
      }
    }
    // ...existing ELO computation...
  }
}
```

No other logic inside `replayAllMatches` changes.

---

## 7. Technical Considerations

- **`connection_limit=10` and polling:** The wait-and-retry loop (req 11) issues one `findFirst` DB query every 500ms — up to 20 queries over 10 seconds. This is the worst case (concurrent saves), not the common path. At connection_limit=10 and current scale, this is acceptable. If the polling pattern proves expensive at higher scale, replace with a short fixed delay + single re-check rather than a full polling loop.
- **Vercel function timeout:** The incremental path is O(matches after insertion point) — typically 1 match for real-time entries. Full replay is confined to the admin endpoint (10-min cooldown) and nightly cron, where longer execution is expected.
- **Void holding the response:** The void endpoint now runs a full recompute synchronously before responding. For a small dataset this is fine. At larger scale (1,000+ matches), an admin void could take 2–5 seconds. If this becomes a UX issue, the void can use `after()` to background the recompute — but the `ratingsDeferred` signal and `revalidateTag` timing must be revisited. Out of scope for this PRD.
- **`revalidateTag` on void:** Req 22 adds `revalidateTag("command", "default")` to the void handler. If the match has a tag, also call `revalidateTag("tournament", "default")` to keep tournament views consistent.
- **Prisma schema migration:** The two new `RatingRun` fields have defaults and are nullable — no SQL migration needed. However, `npx prisma generate` is required after the schema change. The admin recompute route already references a `startedAt` field on `RatingRun` (in the 10-minute cooldown query); verify this field exists in the schema or is an alias for `createdAt` before implementing.
- **Testing surface:**
  - Incremental — single new match appended at end (the common case; one match replayed)
  - Incremental — backdated insertion (match inserted in the middle of history; N matches replayed)
  - Incremental — score edit (equivalent to backdated insertion from that match's date)
  - Incremental — player's first match ever (no prior snapshot → must start at 1000)
  - Full replay — void of a middle match (all downstream matches replayed)
  - Concurrency wait-and-retry: active run finishes within 10s → incremental runs successfully
  - Concurrency wait-and-retry: active run exceeds 10s → `ratingsDeferred: true` returned
  - `CommunityStats` parity: incremental run produces same `avgRating` as full run over identical data
  - **Parity test (critical):** A full replay and an incremental replay of the same match set must produce identical `Player.rating` values for all affected players
  - Edit window: `PATCH` returns 403 after 20 minutes have elapsed

---

## 8. Success Metrics

1. **Latency:** Match save p95 latency < 3 seconds at any match-history size. Measured via Vercel function logs after deployment.
2. **Void correctness:** After voiding a match via the admin panel, `Player.rating` values update without a manual recompute trigger. Verified by recording ratings before and after void.
3. **Edit correctness:** A score edit submitted within 20 minutes produces correct updated ratings visible on the Command screen within one refresh.
4. **Parity:** Full-replay and incremental-replay of the same match set produce identical `Player.rating` values for all affected players. Verified by the parity unit test.
5. **No regression:** All existing unit tests pass (currently 104).
6. **Deferred-ratings rarity:** `ratingsDeferred: true` should not appear in server logs under normal (non-concurrent) operation. Monitor via a log search for `[runRecompute] Skipped` after deployment; any occurrence in normal usage indicates the concurrency guard is firing unexpectedly.

---

## 9. Open Questions

*None — all resolved.*

| Question | Resolution |
|----------|-----------|
| Score edit endpoint | Already exists. This PRD connects it to incremental recompute and changes the window to 20 min. |
| `ratingsDeferred` UX on score edit | Show notice inline in `EditMatchClient` for 2 seconds before navigating to `/command` (req 20). No query param needed. |
| Admin run history columns | Yes — add Scope and From Match to `app/admin/recompute/page.tsx` (req 27). |
| Admin edit bypass | Out of scope — admins void and re-enter. |
| `CommunityStats` in incremental mode | Resolved — fetch all active player ratings after replayed-player updates; use that for the upsert (req 7 + §6). |
