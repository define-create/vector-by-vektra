# PRD: Shadow Profile Data Integrity

## 1. Introduction / Overview

Shadow profiles (unclaimed player records created automatically during match entry) have several data integrity gaps. Two real people with the same name get merged into a single shadow profile, silently corrupting ratings. No database-level constraint prevents duplicate shadows from being created via race conditions or future code paths. The `established` trust tier exists in the schema but is never assigned. Unclaimed shadows with no match history accumulate indefinitely with no cleanup path.

This PRD covers four independent data integrity improvements to the shadow profile system.

---

## 2. Goals

- Give admins enough context at match entry time to detect name collisions between two real people
- Enforce shadow profile uniqueness at the database level as a safety backstop
- Clarify and implement (or remove) the `established` trust tier
- Provide admins a way to identify and clean up orphaned shadow profiles

---

## 3. User Stories

- As an admin entering a match, I want to see the existing shadow's rating and match count when I type a name, so I can tell if the shadow already represents a different person.
- As a developer, I want a database constraint to prevent duplicate shadow profiles even if the application code has a bug or race condition.
- As an admin, I want to understand what `established` trust tier means and see it assigned correctly, or have it removed to avoid confusion.
- As an admin, I want to filter the player list to show unclaimed shadows with zero matches so I can bulk-clean typos and test entries.

---

## 4. Functional Requirements

### Feature E — Richer match entry player dropdown

**E1.** The player search endpoint (`GET /api/players/search`) must include `matchCount` in its response for every player result (shadow or claimed).

**E2.** The `PlayerSelector` component used in the Enter Match screen must display, beneath each search result's display name:
- Current rating (already shown — keep as-is)
- Match count (e.g., "8 matches" or "No matches yet")

**E3.** When the admin selects a player from the dropdown, the selector must show a brief inline summary beneath the selected name:
- Rating + match count (e.g., "Rating 1042 · 8 matches")
- This gives the admin a final confirmation signal before submitting the match

**E4.** No existing behaviour must change — this is additive display-only. The "will create a shadow profile" message when no match is found must remain unchanged.

**E5.** No "create new profile for this name anyway" button is added in this version (deferred — see Non-Goals).

---

### Feature F — Database-level uniqueness constraint on shadow profiles

**F1.** A new Prisma migration must add a partial unique index on the `Player` table:
```sql
CREATE UNIQUE INDEX "Player_shadow_displayname_unique"
ON "Player" (lower("displayName"))
WHERE "userId" IS NULL AND "claimed" = false AND "deletedAt" IS NULL;
```

**F2.** This index must apply only to unclaimed, non-deleted shadow profiles. Claimed profiles and deleted records are excluded.

**F3.** The `findOrCreateShadowPlayer` function in `lib/services/players.ts` must handle the unique constraint violation (`P2002` Prisma error code) gracefully: on conflict, re-fetch and return the existing shadow rather than throwing.

**F4.** No application behaviour should change under normal conditions — the existing case-insensitive lookup already prevents duplicates. The constraint is a safety backstop only.

---

### Feature G — Resolve the `established` trust tier

**G1.** Audit all code locations that read or branch on `trustTier` and document what each tier currently means in practice.

**G2.** Choose one of:

**Option G2a — Implement `established`:**
- Define the promotion criteria (suggested: Player has ≥ 10 non-voided matches AND `claimed = true`)
- Add a nightly cron step (or hook into the existing recompute) that promotes eligible players: `UPDATE Player SET trustTier = 'established' WHERE ...`
- No UI change required for v1 — tier is visible in admin player detail already

**Option G2b — Remove `established` from the enum:**
- Replace all references to `established` in the codebase with `verified_email`
- Remove `established` from the `TrustTier` enum in `schema.prisma`
- Write a migration to update any existing rows (none expected on fresh DB)

**G3.** The README Identity Model section must be updated to reflect the two remaining trust tier values.

> **Decision: G2b selected.** `established` removed from the enum. Schema, init.sql, and migration updated.

---

### Feature H — Orphaned shadow cleanup in admin

**H1.** The admin players API (`GET /api/admin/players`) must support a new query parameter: `filter=orphaned`

**H2.** When `filter=orphaned` is passed, the response must include only players where:
- `userId IS NULL` (unclaimed shadow)
- `claimed = false`
- `deletedAt IS NULL`
- Match count = 0 (no `MatchParticipant` records linked)

**H3.** The admin Players page must include a filter toggle or dropdown that includes an "Orphaned shadows (0 matches)" option.

**H4.** When this filter is active, a "Soft-delete all shown" bulk action must appear. Clicking it must show a confirmation dialog: *"This will soft-delete {n} shadow profiles with no match history. This cannot be undone from the UI."*

**H5.** On confirmation, call a new endpoint `POST /api/admin/players/bulk-delete` with the list of IDs. The endpoint must:
- Be admin-only
- Accept `{ ids: string[] }`
- Validate that every ID in the list is an unclaimed shadow with zero matches (server-side — do not trust the client filter)
- Set `deletedAt = now()` for each validated ID in a single transaction
- Write one audit event per deleted player: `actionType = "delete_player"`, metadata includes `{ playerId, displayName, reason: "orphaned_bulk_cleanup" }`

**H6.** Individual soft-delete of a single orphaned shadow must also be possible from the player detail panel (existing edit panel — add a "Delete" button that is only shown when `matchCount === 0 AND claimed === false`).

---

## 5. Non-Goals (Out of Scope)

- Adding a "Create new profile for this name anyway" button to the match entry screen — deferred to avoid scope creep; Feature E (richer context) is the v1 mitigation
- Hard delete of any player record — soft-delete only
- User-facing changes (covered in the User Identity UX PRD)
- Automatic merging of duplicate shadows — admin manual merge remains the resolution path
- Any changes to the rating recompute system

---

## 6. Design Considerations

- Feature E: match count in the PlayerSelector should be muted/secondary text, same size as rating, on a second line beneath the player name
- Feature H: the "Orphaned shadows" filter option should show a count badge (e.g., "Orphaned shadows (12)") so admins know at a glance if cleanup is needed
- Feature H bulk-delete confirmation dialog should follow the same amber warning pattern as the existing merge confirmation

---

## 7. Technical Considerations

- Feature F: Prisma does not natively express partial indexes in `schema.prisma` — the index must be added via a raw SQL migration file. Mark it with `@@ignore` or add a comment so future `prisma migrate` runs don't drop it
- Feature F: The `lower()` function on `displayName` requires Postgres — confirmed compatible with Supabase
- Feature G: `trustTier` is stored as a Postgres enum (`TrustTier`). Removing `established` requires a migration to ALTER the enum type — straightforward on a fresh DB
- Feature H: `matchCount = 0` check must be done server-side via `_count: { matchParticipants: true }` in the Prisma query, filtered to `having count = 0`. Alternatively: `where: { matchParticipants: { none: {} } }`
- All four features are independent — they can be implemented and shipped in any order

---

## 8. Success Metrics

- Zero duplicate shadow profiles created after Feature F is deployed (verifiable via DB query)
- Admin can identify and clean up orphaned shadows without developer DB access
- `trustTier` field has a clear, implemented definition for every value in the enum

---

## 9. Open Questions

- Feature G: should `established` be implemented (G2a) or removed (G2b)? **Decision required.**
- Feature H: should bulk-delete be reversible (e.g., a 24-hour undo window)? Currently scoped as immediate soft-delete with no undo from UI.
- Feature E: should match count be shown for claimed profiles in the match entry dropdown as well, or only for shadows?
