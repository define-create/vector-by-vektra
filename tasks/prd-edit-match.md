# PRD: Edit Match (Admin)

## 1. Introduction / Overview

Admins currently can only **void** matches. This feature extends the admin Matches screen to allow **editing** an active match — changing its players, event tag, and/or scores — while preserving match history by voiding the original and creating a corrected replacement. All affected player ratings are recalculated forward from the edited match's date.

The screen is renamed from "Void Matches" to "Void / Edit Matches".

---

## 2. Goals

1. Allow admins to correct match data (players, scores, event tag) without permanently losing the original record.
2. Ensure player ratings remain accurate after any edit by triggering a forward cascade recompute.
3. Keep the edit UI consistent with the existing Enter Match form (same layout, fields, and interaction patterns).
4. Preserve full history: the original match is voided; the corrected match is a new record.

---

## 3. User Stories

- **As an admin**, I want to edit a match's players so I can correct data entry mistakes without voiding the match entirely and losing context.
- **As an admin**, I want to change a match's scores so the correct outcome is reflected in the ratings.
- **As an admin**, I want to update the event tag on a match so it is correctly attributed to the right event.
- **As an admin**, I want player ratings to automatically recalculate after I save an edit so the leaderboard remains accurate.
- **As an admin**, I want to cancel mid-edit without making any changes so I can back out safely.

---

## 4. Functional Requirements

### 4.1 Screen Rename

1. The page title "Void Matches" must be renamed to **"Void / Edit Matches"** everywhere it appears (page heading, admin nav link, page `<title>`).

### 4.2 Table: New "Event" Column

2. The match table must include a new **"Event"** column that displays the match's `tag` field value.
3. If a match has no tag, the cell must be blank (no placeholder text).
4. The "Event" column must be positioned between "Score" and "Entered by".

### 4.3 Table: New "Edit" Button

5. Each active (non-voided) match row must display an **"Edit"** button alongside the existing "Void" button.
6. Voided matches must **not** show an Edit button (same rule as Void — already voided matches are immutable).
7. Clicking "Edit" must open the Edit Match modal overlay.

### 4.4 Edit Match Modal

8. The modal must be a full-screen overlay (matching the visual style of the existing void confirmation modal backdrop: `fixed inset-0 z-50 bg-black/60`).
9. The modal content must mirror the **Enter Match form** layout, fields, and visual design — same field order, same styling, same player search/select interaction.
10. The modal must pre-populate all fields with the existing match's data:
    - Team 1 players (both)
    - Team 2 players (both)
    - Game scores (all games, in order)
    - Event tag (the `tag` field)
    - Match date
11. The modal must include a **"Cancel"** button that closes the modal with no changes made.
12. The modal must include a **"Save"** button that commits the edit.
13. The "Save" button must be disabled if the form is in an invalid state (e.g. a player slot is empty, or a score field is blank).

### 4.5 Player Editing in Modal

14. Each of the four player slots must be individually editable.
15. Admin must be able to **remove** the current player from a slot and **search for and select a replacement** player, using the same player search/select component as the Enter Match form.
16. The 2v2 structure must be preserved: exactly 2 players on each team at all times. Admin cannot change team sizes.
17. A player must not appear in more than one slot simultaneously.

### 4.6 Score Editing in Modal

18. Game scores must be editable fields (same as the Enter Match form).
19. The number of games is not restricted — admin can add or remove game rows (consistent with Enter Match behaviour).

### 4.7 Event Tag Editing in Modal

20. The modal must include a text input for the event tag (`tag` field), pre-populated with the existing value.
21. Admin can clear the tag, leave it unchanged, or type a new value.

### 4.8 Match Date Editing in Modal

22. The modal must include a date field pre-populated with the existing match date.
23. Admin can change the match date.

### 4.9 Save Behaviour — Void + Replace

24. On Save, the system must **void the original match** (set `voidedAt` to now) rather than updating it in place.
25. The system must **create a new match** record with the edited data.
26. The new match's `enteredBy` must be set to the **admin performing the edit** (not the original submitter).
27. The new match must carry a reference or note indicating it was created as an edit of the original match ID (e.g. a `replacesMatchId` field or equivalent audit note — see Open Questions).
28. On success, the modal must close and the match table must refresh to reflect the updated data.
29. The admin must land back on the **Void / Edit Matches table** after saving (not navigate away to the new match detail page).

### 4.10 Rating Recompute

30. After saving, the system must trigger a **forward cascade recompute** of all player ratings from the edited match's date onwards.
31. This recompute must follow the same mechanism used by the existing admin recompute functionality.
32. The UI must show a loading/saving state while the save + recompute is in progress.
33. Any recompute error must be surfaced to the admin as an error message within the modal (the modal should not close on error).

### 4.11 No Edit on Voided Matches

34. The Edit button must never appear on a voided match row. If a match becomes voided (e.g. by another admin simultaneously), the modal must reject the save with a clear error message rather than creating a duplicate.

---

## 5. Non-Goals (Out of Scope)

- Editing matches by non-admin users.
- Changing team sizes (e.g. 1v1 ↔ 2v2).
- An audit/revision log UI (history is preserved implicitly via the voided original record).
- Editing already-voided matches.
- Bulk editing multiple matches at once.
- Undo / revert after an edit is saved.

---

## 6. Design Considerations

- The modal overlay must visually match the existing Enter Match form (`app/(tabs)/enter/page.tsx`) — same dark background, same card/panel layout, same input styles, same player search dropdown behaviour.
- The modal should be scrollable if the content exceeds the viewport height (match the Enter Match form's scroll behaviour).
- Button layout at the bottom: **Cancel** (secondary/outlined) on the left, **Save** (primary) on the right — same pattern as other confirmation modals in the admin UI.
- Show an inline spinner on the Save button while saving.
- The "Event" column in the table may be narrow — truncate long tags with `text-ellipsis overflow-hidden` and a `title` tooltip for full text.

---

## 7. Technical Considerations

- **Atomic void + create**: Implement a single `POST /api/admin/matches/[id]/edit` endpoint that wraps both the void of the original and the creation of the replacement in a **Prisma transaction**. This ensures no partial state (orphaned void) if the create step fails.
- **Cascade recompute**: After creating the replacement match, invoke the same recompute job used by `app/admin/recompute/page.tsx` — scoped to matches on or after the **earlier** of the original match date and the new match date.
- **Player search**: Reuse the existing player search component/hook already used in the Enter Match form and Admin Players page.
- **`replacesMatchId`**: Add a nullable `replacesMatchId String?` field to the `Match` model in `prisma/schema.prisma`. The replacement match sets this to the original match's ID. Remember to run `npx prisma generate` after the schema change, and apply the column via the Supabase SQL editor (`ALTER TABLE "Match" ADD COLUMN "replacesMatchId" TEXT;`).
- **Fingerprint**: Always skip the duplicate fingerprint check for admin-created replacement matches (pass `force: true` equivalent). The replacement will share the original's fingerprint by design.
- **API response for `AdminMatch`**: The existing `GET /api/admin/matches` response must be extended to include the `tag` field so the new "Event" column can be populated without a second request.

---

## 8. Success Metrics

- Admin can successfully edit a match (players, scores, tag, date) and see updated data reflected in the table within one page refresh.
- The original match record remains in the database with `voidedAt` set (history preserved).
- Player ratings are correctly recalculated forward from the edited match's date after every save.
- Zero cases where a save leaves an orphaned void (original voided but no replacement created).

---

## 9. Decisions Log

1. **`replacesMatchId` field**: Add to schema. Requires `ALTER TABLE "Match" ADD COLUMN "replacesMatchId" TEXT;` in Supabase and `npx prisma generate`.
2. **Atomic edit endpoint**: Single `POST /api/admin/matches/[id]/edit` wrapping void + create in a Prisma transaction.
3. **Recompute scope**: Start from the **earlier** of the original match date and the new match date.
4. **Fingerprint check**: Always skip for admin-created replacement matches (`force: true` equivalent).
