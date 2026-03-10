# PRD: User Identity UX Improvements

## 1. Introduction / Overview

New users who register and arrive at the claiming screen face several friction points and unrecoverable mistakes: they may create a fresh profile without realising a shadow profile with their match history already exists; they may claim the wrong shadow because the search shows too little context; and once claimed, they have no way to correct a mistake or update their display name without contacting an admin.

This PRD covers four independent user-facing improvements to the identity and claiming flow.

---

## 2. Goals

- Prevent users from accidentally orphaning their match history by creating a fresh profile when a shadow already exists
- Give users enough information in the claim search to confidently identify their own profile
- Allow users to correct a wrong claim (admin action, no self-service risk)
- Allow users to update their own `Player.displayName` without admin involvement

---

## 3. User Stories

- As a new user, I want to be warned if profiles with similar names exist before I create a fresh profile, so I don't accidentally lose my match history.
- As a new user searching for my shadow profile, I want to see match counts and last match date alongside each result, so I can tell which profile is mine.
- As a user who claimed the wrong profile, I want an admin to be able to unclaim it for me so I can claim the correct one.
- As a claimed user, I want to update my display name myself without waiting for an admin.

---

## 4. Functional Requirements

### Feature A — Warn before fresh profile creation if similar shadows exist

**A1.** Before rendering the "Create fresh profile" form, the system must silently query `GET /api/players/search?q={user.displayName}&unclaimed=true`.

**A2.** If the query returns one or more unclaimed shadow profiles, display a warning above the form:
> "We found profiles with similar names. Are you sure none of these are you?"
List the matching shadows (displayName + rating + match count). Each entry must have a "This is me" button that triggers the normal claim flow.

**A3.** The warning must include a "None of these are me — create fresh profile" button that dismisses the warning and shows the creation form.

**A4.** If the query returns no shadows, show the creation form directly with no warning.

**A5.** The warning query must be triggered by the User's `displayName`. If the user has edited the display name field in the form, re-run the query against the edited value (debounced 400 ms).

---

### Feature B — Richer claim search results

**B1.** The `GET /api/players/search` endpoint must accept an optional `includeStats=true` query parameter.

**B2.** When `includeStats=true`, each result must include:
- `matchCount` (total non-voided matches)
- `lastMatchDate` (ISO date string, or null if no matches)
- `winPct` (win percentage, 0–100, rounded to one decimal, or null if fewer than 3 matches)

**B3.** The ClaimProfilePrompt component must pass `includeStats=true` when calling the search endpoint (unclaimed=true path only).

**B4.** Each search result in the claiming UI must display, beneath the displayName:
- Match count (e.g., "14 matches")
- Last match date (e.g., "Last played Feb 2026"), or "No matches yet" if zero
- Win % if available (e.g., "61.5% wins"), hidden if fewer than 3 matches

---

### Feature C — Admin unclaim action

**C1.** A new admin API endpoint must be created: `POST /api/admin/players/{id}/unclaim`

**C2.** The endpoint must be admin-only (same auth check as other admin routes).

**C3.** The endpoint must validate:
- Player exists and is not soft-deleted
- Player is currently claimed (`claimed = true`, `userId != null`)

**C4.** On success, the endpoint must:
- Set `Player.userId = null`
- Set `Player.claimed = false`
- Set `Player.claimedAt = null`
- Set `Player.trustTier = "unverified"`
- Write an audit event: `actionType = "unclaim_profile"`, metadata includes `{ unclaimedUserId, adminId }`

**C5.** The admin Players page (`/admin/players`) must include an "Unclaim" button in the player detail/edit panel, visible only for claimed profiles.

**C6.** Clicking "Unclaim" must show a confirmation dialog before proceeding.

---

### Feature D — User self-service display name change

**D1.** A new authenticated endpoint must be created: `PATCH /api/players/me/display-name`

**D2.** Request body: `{ displayName: string }`

**D3.** Validation:
- User must be authenticated and have a linked Player (`userId` set)
- `displayName` must be a non-empty string after trimming, maximum 50 characters
- Must not be identical to the current `Player.displayName` (case-sensitive)

**D4.** On success:
- Update `Player.displayName` to the trimmed value
- Write an audit event: `actionType = "edit_player_identity"`, metadata includes `{ before: { displayName }, after: { displayName }, source: "self_service" }`

**D5.** A display name field must be added to the user's profile/settings UI. If no dedicated settings page exists, add it to the Command screen beneath the player stats section.

**D6.** The field must show the current display name pre-filled and a "Save" button. On success, show a brief confirmation ("Display name updated"). On error, show the validation message inline.

---

## 5. Non-Goals (Out of Scope)

- Users changing their `User.displayName` (the account-level name set at registration) — out of scope
- Users changing their `User.handle` or `User.email` — out of scope
- Self-service unclaim (users cannot unclaim their own profile — admin only, Feature C)
- Merging profiles from the user-facing UI — admin only
- Any changes to the match entry screen (covered in the Data Integrity PRD)

---

## 6. Design Considerations

- Feature A warning should use amber/warning styling consistent with the existing confirmation dialogs in the admin UI
- Feature B stats in search results should be secondary/muted text, not competing with the player name
- Feature C "Unclaim" button should be destructive-styled (red or amber) with a confirmation step — same pattern as the existing merge confirmation
- Feature D name field on the Command screen should sit below the rating display, labelled "Display name" with a small edit icon or inline edit pattern

---

## 7. Technical Considerations

- Feature B: `matchCount` and `lastMatchDate` can be computed via Prisma `_count` and `orderBy` on `matchParticipants`. `winPct` requires joining through `MatchParticipant` → `Match` to check the result — consider a helper function in `lib/services/players.ts`
- Feature C: The unclaim action is the inverse of the existing claim action in `app/api/players/[id]/claim/route.ts` — reuse the same audit log pattern
- Feature D: Reuse the existing `edit_player_identity` audit event type already used by the admin player edit endpoint (`app/api/admin/players/[id]/route.ts`)
- All four features are independent — they can be implemented and shipped in any order

---

## 8. Success Metrics

- Zero support requests for "I created a fresh profile but my matches aren't there"
- Admin unclaim action used without needing direct DB access
- Users can update their display name without opening a support request

---

## 9. Open Questions

- Should `Player.displayName` changes by users be subject to admin review/approval, or take effect immediately? (Currently scoped as immediate, audit-logged.)
- Should there be a rate limit or cooldown on display name changes to prevent abuse?
- For Feature B: should `winPct` be hidden entirely or shown as "—" when fewer than 3 matches?
