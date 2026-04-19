## Relevant Files

- `prisma/schema.prisma` - Add `replacesMatchId String?` field to the `Match` model.
- `app/admin/matches/page.tsx` - Rename screen, add Event column, add Edit button, wire up Edit modal.
- `app/admin/layout.tsx` - Update nav link label from "Void Matches" to "Void / Edit Matches".
- `components/admin/EditMatchModal.tsx` - New modal component mirroring the Enter Match form layout.
- `app/api/admin/matches/[id]/edit/route.ts` - New atomic POST endpoint: void original + create replacement in a Prisma transaction, then trigger recompute.
- `app/api/admin/matches/route.ts` - Extend GET response to include `tag` field on each match.
- `lib/services/recompute.ts` - Reuse existing recompute service; confirm it accepts a `fromDate` parameter.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `EditMatchModal.tsx` and `EditMatchModal.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- After editing `prisma/schema.prisma`, always run `npx prisma generate`. Apply the DB column separately via the Supabase SQL editor: `ALTER TABLE "Match" ADD COLUMN "replacesMatchId" TEXT;`
- The Edit modal reuses `PlayerSelector` and `GameScoreInput` components from `components/enter/` — do not duplicate them.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/edit-match`

- [x] 1.0 Database: add `replacesMatchId` to Match schema
  - [x] 1.1 Add `replacesMatchId String?` field to the `Match` model in `prisma/schema.prisma`
  - [x] 1.2 Run `npx prisma generate` to regenerate the Prisma client
  - [ ] 1.3 Apply the column in Supabase SQL editor: `ALTER TABLE "Match" ADD COLUMN "replacesMatchId" TEXT;`
  - [x] 1.4 Verify no `PrismaClientValidationError` by confirming `replacesMatchId` appears in the generated client types

- [x] 2.0 API: extend GET /api/admin/matches to return `tag`
  - [x] 2.1 Read `app/api/admin/matches/route.ts` to understand the current query and response shape
  - [x] 2.2 Add `tag: true` to the Prisma `select` (or `include`) in the matches query
  - [x] 2.3 Add `tag: string | null` to the `AdminMatch` TypeScript interface in `app/admin/matches/page.tsx`

- [x] 3.0 API: implement POST /api/admin/matches/[id]/edit
  - [x] 3.1 Create file `app/api/admin/matches/[id]/edit/route.ts`
  - [x] 3.2 Add admin auth guard (same pattern as the existing void endpoint)
  - [x] 3.3 Fetch the original match by `id`; return 404 if not found, 409 if already voided
  - [x] 3.4 Accept request body: `{ team1: [id, id], team2: [id, id], games: [...], tag: string | null, matchDate: string }`
  - [x] 3.5 Wrap in a Prisma transaction: (a) set `voidedAt = now()` on the original match, (b) create the new match with `replacesMatchId` set to the original match's ID, `enteredByUserId` set to the admin's user ID, fingerprint check skipped
  - [x] 3.6 Determine recompute `fromDate` as the earlier of the original match date and the new match date
  - [x] 3.7 After the transaction succeeds, trigger the forward cascade recompute from `fromDate` using the existing recompute service
  - [x] 3.8 Return `{ ok: true, newMatchId }` on success; return a descriptive error message on failure (do not close modal on error)
  - [x] 3.9 Write tests for the edit endpoint: success path, 404 on unknown id, 409 on already-voided match, 403 non-admin, 400 duplicate players (5 tests, all pass)

- [x] 4.0 UI: update the admin Void / Edit Matches table
  - [x] 4.1 Rename the page `<h1>` from "Void Matches" to "Void / Edit Matches" in `app/admin/matches/page.tsx`
  - [x] 4.2 Update the admin dashboard card label in `app/admin/page.tsx` to "Void / Edit Matches"
  - [x] 4.3 Add `"Event"` column header between "Score" and "Entered by" in the `<thead>`
  - [x] 4.4 Add the `tag` cell in each `<tr>` — display `m.tag` truncated with `title` tooltip; blank if null
  - [x] 4.5 Add `editingMatch` state (`AdminMatch | null`) to `AdminMatchesPage`
  - [x] 4.6 Add an "Edit" button to active (non-voided) match rows; clicking it sets `editingMatch` to that row's match
  - [x] 4.7 Confirm voided rows show neither Edit nor Void button (already true for Void — apply same condition to Edit)

- [x] 5.0 UI: build the EditMatchModal component
  - [x] 5.1 Create `components/admin/EditMatchModal.tsx` as a client component
  - [x] 5.2 Accept props: `match: AdminMatch`, `onClose: () => void`, `onSaved: () => void`
  - [x] 5.3 Initialise local state from props: `team1`, `team2` (player arrays), `games`, `tag`, `matchDate`
  - [x] 5.4 Render the modal backdrop (`fixed inset-0 z-50 bg-black/60`) and a scrollable content panel
  - [x] 5.5 Add modal header: "Edit Match" title + subtitle "Original match will be voided and replaced" + ✕ close button
  - [x] 5.6 Add Match Date field: `<input type="date">` pre-populated from `match.matchDate`
  - [x] 5.7 Add Team 1 card (matching Enter Match styling): two player slots using `PlayerSelector`, pre-populated; WIN/LOSS badge derived from scores
  - [x] 5.8 Add VS divider
  - [x] 5.9 Add Team 2 card: two player slots using `PlayerSelector`, pre-populated
  - [x] 5.10 Add Scores section using `GameScoreInput`, pre-populated with `match.games`
  - [x] 5.11 Add Event tag input (text field, pre-populated from `match.tag`), with clear button and tag suggestions chips from `/api/admin/tags`
  - [x] 5.12 Add audit note panel: "Original match is voided · New match created · Ratings recomputed"
  - [x] 5.13 Add footer: Cancel (outlined) left, Save (primary emerald) right
  - [x] 5.14 Implement `canSave()`: all four player slots filled with IDs, all score fields non-empty; disable Save button when false
  - [x] 5.15 Implement save handler: POST to `/api/admin/matches/[id]/edit`, show spinner on Save button, disable both buttons during save, show error banner inside modal on failure (do not close), call `onSaved()` then `onClose()` on success
  - [x] 5.16 Ensure player slots enforce no-duplicate rule (a player cannot appear in more than one slot)

- [x] 6.0 UI: wire EditMatchModal into the matches page
  - [x] 6.1 Import `EditMatchModal` in `app/admin/matches/page.tsx`
  - [x] 6.2 Render `<EditMatchModal>` when `editingMatch` is non-null, passing `match={editingMatch}`, `onClose={() => setEditingMatch(null)}`, `onSaved={() => { fetchMatches(); setEditingMatch(null); }}`
  - [x] 6.3 Confirm the table refreshes after a successful save and the modal closes

- [x] 7.0 End-to-end verification
  - [x] 7.1 Open the admin Matches page and confirm the title reads "Void / Edit Matches"
  - [x] 7.2 Confirm the Event column appears and displays tags correctly (blank for untagged matches)
  - [x] 7.3 Click Edit on an active match — confirm the modal opens pre-populated with correct data
  - [x] 7.4 Change a player, score, tag, and date — click Save — confirm the original match now shows as Voided and the new match appears in the table with the updated data
  - [x] 7.5 Confirm the new match record has `replacesMatchId` set to the original match's ID (check via Supabase or a quick API call)
  - [x] 7.6 Confirm player ratings have been recomputed (check a player's rating before and after the edit)
  - [x] 7.7 Click Cancel mid-edit — confirm no changes were made
  - [x] 7.8 Confirm voided match rows show no Edit or Void button
