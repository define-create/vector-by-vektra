## Relevant Files

- `app/api/players/search/route.ts` - Add `includeStats` param returning matchCount, lastMatchDate, winPct (Feature B)
- `app/api/players/search/route.test.ts` - Unit tests for enhanced search endpoint
- `components/command/ClaimProfilePrompt.tsx` - Display stats in claim results + warn before fresh create (Features A & B)
- `components/command/ClaimProfilePrompt.test.tsx` - Unit tests for ClaimProfilePrompt
- `app/api/admin/players/[id]/unclaim/route.ts` - New admin unclaim endpoint (Feature C)
- `app/api/admin/players/[id]/unclaim/route.test.ts` - Unit tests for unclaim endpoint
- `app/admin/players/page.tsx` - Add Unclaim button to IdentityEditPanel (Feature C)
- `app/api/players/me/display-name/route.ts` - New PATCH endpoint for self-service name change (Feature D)
- `app/api/players/me/display-name/route.test.ts` - Unit tests for display name endpoint
- `app/(tabs)/command/page.tsx` - Add display name edit UI below player stats (Feature D)
- `prisma/schema.prisma` - Add `unclaim_profile` to AuditActionType enum (Feature C)
- `prisma/init.sql` - Add `unclaim_profile` to AuditActionType enum (Feature C)
- `prisma/migrations/20250222000000_init/migration.sql` - Add `unclaim_profile` to AuditActionType enum (Feature C)

### Notes

- Unit tests should be placed alongside the code files they test.
- Use `npx jest [optional/path/to/test/file]` to run tests.
- Feature B must be implemented before Feature A (A uses the stats data from B's endpoint changes).
- Features B, C, and D are independent of each other.
- `winPct` in Feature B requires checking match outcomes — join `MatchParticipant` → `Match` and check which team won (team with higher total score in `Game` records). A helper in `lib/services/players.ts` is preferred over inline logic.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after a parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/user-identity-ux`

- [x] 1.0 Feature B — Enhanced player search endpoint with stats
  - [x] 1.1 In `app/api/players/search/route.ts`, read a new `includeStats` query param: `const includeStats = searchParams.get("includeStats") === "true"`
  - [x] 1.2 When `includeStats` is false (default), keep the existing query and response unchanged
  - [x] 1.3 When `includeStats` is true, extend the Prisma query to include:
    - `_count: { select: { matchParticipants: true } }` for `matchCount`
    - `matchParticipants: { select: { match: { select: { matchDate: true } } }, orderBy: { match: { matchDate: 'desc' } }, take: 1 }` for `lastMatchDate`
  - [x] 1.4 For `winPct`: after fetching players, for each player compute win percentage by querying their non-voided matches and checking outcomes. Extract this into a helper function `computeWinPct(playerId, prisma)` in `lib/services/players.ts`. Return `null` if the player has fewer than 3 matches
  - [x] 1.5 Map the enriched results to return: `{ id, displayName, rating, claimed, matchCount, lastMatchDate, winPct }` when `includeStats=true`
  - [x] 1.6 Write unit tests verifying: stats are returned when `includeStats=true`, stats are absent when `includeStats=false`, `winPct` is null when fewer than 3 matches

- [x] 2.0 Feature A — Warn user before fresh profile creation if similar shadows exist
  - [x] 2.1 In `components/command/ClaimProfilePrompt.tsx`, add a `Player` interface field update to include `matchCount: number`, `lastMatchDate: string | null`, `winPct: number | null`
  - [x] 2.2 In `ClaimProfilePrompt`, update the existing search fetch (Card 2) to append `&includeStats=true` to the URL so claim results include stats
  - [x] 2.3 In Card 2 results list, update each result item to show beneath the display name: match count (`"14 matches"` or `"No matches yet"`), last played date formatted as `"Last played MMM YYYY"`, and win % if available (`"61.5% wins"`) — all in `text-xs text-zinc-500`
  - [x] 2.4 Add new state to `ClaimProfilePrompt`: `warningProfiles: Player[]` and `warningDismissed: boolean`
  - [x] 2.5 Add a debounced effect (400ms) that watches the `displayName` field value (Card 3 input). When the value changes and is non-empty, fetch `GET /api/players/search?q={displayName}&unclaimed=true&includeStats=true` and store results in `warningProfiles`. Clear `warningProfiles` when the field is empty
  - [x] 2.6 In Card 3 ("First Time Here?"), when `warningProfiles.length > 0` and `!warningDismissed`, render a warning block above the create button:
    - Amber-bordered box with text: `"We found profiles with similar names. Are you sure none of these are you?"`
    - List each warning profile with display name, match count, and a `"This is me"` button that calls `handleClaim(p.id)`
    - A `"None of these are me — create fresh profile"` button that sets `warningDismissed = true`
  - [x] 2.7 When `warningDismissed` is true or `warningProfiles` is empty, show the create form and button normally
  - [x] 2.8 Reset `warningDismissed` to false whenever the `displayName` field value changes
  - [x] 2.9 Write unit tests: warning shown when shadows exist, create button hidden until dismissed, warning disappears when name field is cleared

- [x] 3.0 Feature C — Admin unclaim action
  - [x] 3.1 Add `unclaim_profile` to the `AuditActionType` enum in `prisma/schema.prisma`, `prisma/init.sql`, and `prisma/migrations/20250222000000_init/migration.sql`
  - [x] 3.2 Create `app/api/admin/players/[id]/unclaim/route.ts` with a `POST` handler:
    - Require admin session (same auth check pattern as `app/api/admin/players/merge/route.ts`)
    - Read `id` from route params
    - Validate: player exists, is not soft-deleted, and is currently claimed (`claimed = true`, `userId != null`)
    - In a Prisma transaction: set `Player.userId = null`, `Player.claimed = false`, `Player.claimedAt = null`, `Player.trustTier = "unverified"`
    - Write an audit event: `actionType: "unclaim_profile"`, `entityType: "Player"`, `entityId: id`, metadata: `{ unclaimedUserId: player.userId }`
    - Return `{ ok: true }`
  - [x] 3.3 In `app/admin/players/page.tsx` `IdentityEditPanel`, update the `AdminPlayer` interface to include `userId: string | null`
  - [x] 3.4 In `IdentityEditPanel`, when a player is selected and `selected.claimed === true`, render an `"Unclaim"` button beneath the existing Save button, styled with amber/destructive colors (e.g., `bg-amber-800 hover:bg-amber-700 text-white`)
  - [x] 3.5 Clicking `"Unclaim"` shows an inline confirmation: `"Remove this profile from its linked user account? The profile will revert to unclaimed and the user will lose access to their stats until they re-claim it."` with Confirm and Cancel buttons
  - [x] 3.6 On confirm, call `POST /api/admin/players/{id}/unclaim`, then clear the selection and show a success message: `"Profile unclaimed successfully"`
  - [x] 3.7 Write unit tests for the unclaim endpoint: success case, rejection when player is already unclaimed, rejection when player does not exist

- [x] 4.0 Feature D — User self-service display name change
  - [x] 4.1 Create `app/api/players/me/display-name/route.ts` with a `PATCH` handler:
    - Require authenticated session (user must be logged in)
    - Fetch the user's linked player via `prisma.player.findFirst({ where: { userId: session.user.id, deletedAt: null } })`
    - Return 404 if no linked player found
    - Read `{ displayName }` from request body
    - Validate: `displayName` must be a non-empty string after trimming, max 50 characters, and must differ from the current `Player.displayName` (case-sensitive)
    - Update `Player.displayName` to the trimmed value
    - Write an audit event: `actionType: "edit_player_identity"`, `entityType: "Player"`, `entityId: player.id`, metadata: `{ before: { displayName: player.displayName }, after: { displayName: trimmed }, source: "self_service" }`
    - Return `{ ok: true, displayName: trimmed }`
  - [x] 4.2 In `app/(tabs)/command/page.tsx`, check how `myPlayer` is passed to the page — read the existing `getCommandData` service to understand what data is available
  - [x] 4.3 Add a display name edit section to the Command page, rendered below the stats and above the match history. Show the current `Player.displayName` with a small edit icon (pencil or `✎`). Clicking the icon switches to an inline edit mode: text input pre-filled with current name + Save / Cancel buttons
  - [x] 4.4 On Save, call `PATCH /api/players/me/display-name` with the new name. On success, call `router.refresh()` to reload the page with the updated name. On error, show the validation message inline
  - [x] 4.5 Write unit tests for the display name endpoint: success case, rejection when name is empty, rejection when name exceeds 50 characters, rejection when name is unchanged, rejection when user has no linked player
