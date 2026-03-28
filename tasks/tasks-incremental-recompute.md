## Relevant Files

- `prisma/schema.prisma` — Add `replayScope` and `fromMatchId` fields to `RatingRun` model.
- `lib/rating-engine.ts` — Add optional `startingRatings` parameter to `replayAllMatches`.
- `lib/services/recompute.ts` — Core incremental logic, starting-ratings lookup, scoped snapshot delete, wait-and-retry concurrency guard, `CommunityStats` fix, new `RecomputeResult` fields.
- `app/api/admin/matches/[id]/void/route.ts` — Add recompute trigger after void, `revalidateTag`, `ratingsDeferred` in response.
- `app/api/matches/[id]/route.ts` — Switch `PATCH` to incremental recompute, change edit window to 20 min, add `ratingsDeferred` to response.
- `app/api/matches/route.ts` — Add `ratingsDeferred` to `POST` 201 response; change edit window constant.
- `lib/services/command.ts` — Rename `sixtyMinutesAgo` → `twentyMinutesAgo`, update value.
- `app/(tabs)/enter/edit/[id]/page.tsx` — Update server-side edit window guard to 20 minutes.
- `app/(tabs)/enter/page.tsx` — Show `ratingsDeferred` notice in match-save success state.
- `components/enter/EditMatchClient.tsx` — Show `ratingsDeferred` notice before navigation on score edit.
- `app/admin/recompute/page.tsx` — Add Scope and From Match columns to run history table.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- After editing `prisma/schema.prisma`, always run `npx prisma generate` before testing. The generated client in `app/generated/prisma/` must be regenerated or the new fields will cause a `PrismaClientValidationError` at runtime.
- DB migration (adding `replayScope` and `fromMatchId` to `RatingRun`) must be applied via Supabase SQL editor — `prisma migrate deploy` is incompatible with pgBouncer.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch for this feature (`git checkout -b feature/incremental-recompute`)

- [x] 1.0 Prisma schema — add `replayScope` and `fromMatchId` to `RatingRun`
  - [x] 1.1 Add `replayScope String @default("full")` and `fromMatchId String?` fields to `RatingRun` in `prisma/schema.prisma`
  - [x] 1.2 Run `npx prisma generate` to regenerate the client
  - [x] 1.3 Apply the SQL migration via Supabase SQL editor (`ALTER TABLE "RatingRun" ADD COLUMN "replayScope" TEXT NOT NULL DEFAULT 'full', ADD COLUMN "fromMatchId" TEXT;`)

- [x] 2.0 Rating engine — add `startingRatings` parameter to `replayAllMatches`
  - [x] 2.1 Read `lib/rating-engine.ts` to understand the current `replayAllMatches` signature and initialization logic
  - [x] 2.2 Add optional `startingRatings?: Map<string, number>` parameter to `replayAllMatches`
  - [x] 2.3 Update the player initialization block inside `replayAllMatches` to use `startingRatings?.get(pid) ?? 1000` instead of a hard-coded `1000`
  - [x] 2.4 Verify all existing callers of `replayAllMatches` still compile (no signature breakage)

- [x] 3.0 Core recompute service — incremental logic, concurrency wait-and-retry, `CommunityStats` fix
  - [x] 3.1 Add optional `fromDate?: Date` parameter to `runRecompute` signature
  - [x] 3.2 When `fromDate` is provided, fetch only matches with `matchDate >= fromDate` (same ordering as full replay)
  - [x] 3.3 Implement the starting-ratings lookup: find all affected player IDs from the replayed matches, then fetch the most recent `RatingSnapshot` per player where `matchDate < fromDate` (JOIN on `Match` for `createdAt` tie-breaking), build a `Map<playerId, rating>`
  - [x] 3.4 Pass the resulting `startingRatings` map to `replayAllMatches` for incremental runs
  - [x] 3.5 Implement scoped snapshot delete: incremental runs delete only `WHERE matchId IN (replayed match IDs)`; full runs continue to delete all rows
  - [x] 3.6 Restrict `Player` updates (rating, confidence, volatility, winPct) to only players who appeared in the replayed matches during incremental runs
  - [x] 3.7 Fix `CommunityStats` for both paths: after updating players, fetch all active players' current `rating` values and use that array for the upsert (replaces computing stats from `finalRatings` alone)
  - [x] 3.8 Set `replayScope` and `fromMatchId` on the `RatingRun.create` call: `replayScope: fromDate ? "incremental" : "full"`, `fromMatchId: <id of earliest replayed match | null>`
  - [x] 3.9 Replace the skip-and-return concurrency guard with a wait-and-retry loop: poll `RatingRun.status` at 500ms intervals, up to 10 seconds (20 polls), using `setInterval`/`clearInterval`
  - [x] 3.10 After the active run finishes within the timeout, trigger an incremental recompute for the waiting match's `fromDate` and complete normally
  - [x] 3.11 If the 10-second timeout elapses without the active run finishing, return `{ ..., ratingsDeferred: true }` and log a warning
  - [x] 3.12 Add `ratingsDeferred?: boolean` to the `RecomputeResult` interface

- [x] 4.0 API route changes — void trigger, score edit recompute, `ratingsDeferred` in responses
  - [x] 4.1 Read `app/api/admin/matches/[id]/void/route.ts` to confirm current state
  - [x] 4.2 Add `runRecompute("admin", "auto: match void")` call after `voidedAt` is set; wrap in try/catch so void errors don't block the 200 response; log errors with match ID
  - [x] 4.3 Add `revalidateTag("command", "default")` (and `revalidateTag("tournament", "default")` if the match has a tag) to the void handler after recompute
  - [x] 4.4 Add `ratingsDeferred: boolean` to the void handler's 200 response body
  - [x] 4.5 Read `app/api/matches/[id]/route.ts` to confirm the current `PATCH` handler
  - [x] 4.6 Change the `PATCH` handler's `runRecompute("admin")` call to `runRecompute("admin", "auto: score edit", match.matchDate)` (incremental)
  - [x] 4.7 Add `ratingsDeferred: boolean` to the `PATCH` handler's response body
  - [x] 4.8 Read `app/api/matches/route.ts` to confirm the `POST` handler response shape
  - [x] 4.9 Add `ratingsDeferred: boolean` to the `POST /api/matches` 201 response body (sourced from `RecomputeResult.ratingsDeferred`)

- [x] 5.0 Score edit window — change 60 → 20 minutes in all six locations
  - [x] 5.1 `app/api/matches/route.ts` ~line 258: change `60 * 60 * 1000` → `20 * 60 * 1000`
  - [x] 5.2 `app/api/matches/[id]/route.ts` ~line 80: change `60 * 60 * 1000` → `20 * 60 * 1000`
  - [x] 5.3 `app/api/matches/[id]/route.ts` ~line 83: change error text `"60-minute"` → `"20-minute"`
  - [x] 5.4 `lib/services/command.ts` ~line 95: rename `sixtyMinutesAgo` → `twentyMinutesAgo` and change `60 * 60 * 1000` → `20 * 60 * 1000`
  - [x] 5.5 `lib/services/command.ts` ~line 388: change the second `60 * 60 * 1000` → `20 * 60 * 1000`
  - [x] 5.6 `app/(tabs)/enter/edit/[id]/page.tsx` ~line 33: change `60 * 60 * 1000` → `20 * 60 * 1000`

- [x] 6.0 Client UI — `ratingsDeferred` notices
  - [x] 6.1 Read `app/(tabs)/enter/page.tsx` to find the match-save success state
  - [x] 6.2 In the Enter page success state, check the `ratingsDeferred` flag from the match-save response; if `true`, render a non-blocking notice: *"Ratings are updating in the background — check back in a moment."*
  - [x] 6.3 Ensure the notice does not appear when `ratingsDeferred` is `false` or absent, and does not block navigation
  - [x] 6.4 Read `components/enter/EditMatchClient.tsx` to find the success/navigation path
  - [x] 6.5 In `EditMatchClient`, if `ratingsDeferred` is `true`, show inline notice *"Scores updated. Ratings are updating in the background."* for 2 seconds before navigating to `/command`; if `false`, navigate immediately as today

- [x] 7.0 Admin recompute run history — add Scope and From Match columns
  - [x] 7.1 Read `app/admin/recompute/page.tsx` to understand the current table structure
  - [x] 7.2 Add **Scope** column displaying `replayScope` (`"full"` / `"incremental"`) for each run
  - [x] 7.3 Add **From Match** column displaying `fromMatchId` (linked to match detail if available; blank for full runs)
  - [x] 7.4 Confirm the page query fetches `replayScope` and `fromMatchId` from `RatingRun`; update the query if not
