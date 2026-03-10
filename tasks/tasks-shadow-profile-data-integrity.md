## Relevant Files

- `app/api/players/search/route.ts` - Add `matchCount` to search response (Feature E)
- `app/api/players/search/route.test.ts` - Unit tests for search endpoint
- `components/enter/PlayerSelector.tsx` - Display match count in dropdown and selected state (Feature E)
- `components/enter/PlayerSelector.test.tsx` - Unit tests for PlayerSelector
- `lib/services/players.ts` - Handle P2002 unique constraint error in `findOrCreateShadowPlayer` (Feature F)
- `lib/services/players.test.ts` - Unit tests for shadow player service
- `prisma/migrations/20260310000001_shadow_displayname_unique/migration.sql` - Partial unique index migration (Feature F)
- `prisma/init.sql` - Add index to baseline SQL (Feature F)
- `app/api/admin/players/route.ts` - Add `filter=orphaned` query param support (Feature H)
- `app/api/admin/players/route.test.ts` - Unit tests for admin players route
- `app/api/admin/players/bulk-delete/route.ts` - New bulk soft-delete endpoint (Feature H)
- `app/api/admin/players/bulk-delete/route.test.ts` - Unit tests for bulk-delete endpoint
- `app/admin/players/page.tsx` - Add orphaned filter UI + bulk delete panel (Feature H)

### Notes

- Unit tests should be placed alongside the code files they test.
- Use `npx jest [optional/path/to/test/file]` to run tests.
- Feature G (`established` trust tier removal) is already complete.
- Features E, F, and H are independent — implement in any order.
- The partial unique index uses `lower("displayName")` which requires Postgres (confirmed compatible with Supabase).

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after a parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/shadow-profile-data-integrity`

- [x] 1.0 Feature E — Richer match entry player dropdown
  - [x] 1.1 In `app/api/players/search/route.ts`, add `_count: { select: { matchParticipants: true } }` to the Prisma `select` block so each result includes `matchCount`
  - [x] 1.2 In `app/api/players/search/route.ts`, map the result to return `matchCount: player._count.matchParticipants` in the response JSON
  - [x] 1.3 In `components/enter/PlayerSelector.tsx`, add `matchCount: number` to the `Player` interface
  - [x] 1.4 In the dropdown results list (the `results.map(...)` block around line 199), add a second line beneath the player name showing match count: `"{n} matches"` or `"No matches yet"` if 0, using muted/secondary text (`text-zinc-500 text-xs`)
  - [x] 1.5 In the selected player indicator section (around line 216), update the `✓ Player selected` text to also show rating and match count: e.g., `"✓ Almir · Rating 1042 · 8 matches"`
  - [x] 1.6 Write unit tests for the updated search endpoint verifying `matchCount` is present in the response

- [x] 2.0 Feature F — Database-level uniqueness constraint on shadow profiles
  - [x] 2.1 Create directory `prisma/migrations/20260310000001_shadow_displayname_unique/` and add `migration.sql` with the following content:
    ```sql
    -- Add partial unique index to prevent duplicate unclaimed shadow profiles with the same displayName (case-insensitive)
    CREATE UNIQUE INDEX "Player_shadow_displayname_unique"
    ON "Player" (lower("displayName"))
    WHERE "userId" IS NULL AND "claimed" = false AND "deletedAt" IS NULL;
    ```
  - [x] 2.2 In `prisma/init.sql`, add the same `CREATE UNIQUE INDEX` statement after the existing `CREATE UNIQUE INDEX "Player_userId_key"` line so the baseline SQL stays in sync
  - [x] 2.3 In `lib/services/players.ts`, wrap the `prisma.player.create(...)` call inside `findOrCreateShadowPlayer` in a try/catch. On a Prisma `P2002` unique constraint error (`error.code === 'P2002'`), re-run the `findFirst` query and return the found player (race condition recovery)
  - [x] 2.4 Write a unit test for `findOrCreateShadowPlayer` that simulates a P2002 error on create and verifies the function retries and returns the existing player instead of throwing

- [x] 3.0 Feature H — Orphaned shadow cleanup in admin
  - [x] 3.1 In `app/api/admin/players/route.ts`, read a new `filter` query param. When `filter=orphaned`, replace the `where` clause with: `{ userId: null, claimed: false, deletedAt: null, matchParticipants: { none: {} } }` and remove pagination (return all orphaned records, they should be few)
  - [x] 3.2 Also include `_count: { select: { matchParticipants: true } }` in the `select` block so the response includes `matchCount` for each player (useful for the UI to confirm 0 matches)
  - [x] 3.3 Create `app/api/admin/players/bulk-delete/route.ts` with a `POST` handler:
    - Require admin session (same auth check as other admin routes)
    - Accept `{ ids: string[] }` in request body
    - Validate: `ids` must be a non-empty array of strings (max 200)
    - For each ID, verify the player exists, is unclaimed (`claimed = false`, `userId = null`), not already deleted, and has zero match participants — reject the entire request if any ID fails validation
    - Set `deletedAt = new Date()` for all validated IDs, write one `AuditEvent` per deleted player with `actionType: "delete_player"`, `entityType: "Player"`, `entityId: playerId`, metadata: `{ displayName, reason: "orphaned_bulk_cleanup" }`
    - Return `{ ok: true, deleted: number }`
  - [x] 3.4 In `app/admin/players/page.tsx`, add an `OrphanedShadowsPanel` component (new section above MergePanel):
    - On mount, fetch `GET /api/admin/players?filter=orphaned` and store results in state
    - Show a count badge in the section heading: `"Orphaned Shadows ({n})"` — hide the entire section if count is 0
    - List each orphaned shadow: display name and created date
    - Show a `"Soft-delete all ({n})"` button when list is non-empty
  - [x] 3.5 Add a confirmation dialog to the bulk-delete button (same amber warning pattern as the existing merge confirmation): `"This will soft-delete {n} shadow profiles with no match history. This cannot be undone from the UI."`
  - [x] 3.6 On confirmation, call `POST /api/admin/players/bulk-delete` with all IDs, then re-fetch the orphaned list (should return empty). Show success message: `"Deleted {n} orphaned shadow profiles."`
  - [x] 3.7 In `app/admin/players/page.tsx` `IdentityEditPanel`, add a `"Delete"` button in the selected-player section — visible only when the selected player has `claimed === false` and `matchCount === 0`. Clicking it soft-deletes the single player via `POST /api/admin/players/bulk-delete` with a single-element array, with the same amber confirmation dialog
  - [x] 3.8 Write unit tests for the bulk-delete endpoint: valid bulk delete, rejection when a player has matches, rejection when a player is already deleted, rejection when a player is claimed
