# PRD: Duplicate Match Prevention

## 1. Introduction / Overview

Any of the 4 players in a match can independently enter the same result. Currently the system has no match-level deduplication — only a "4 distinct players" guard within a single submission. If two players each enter the same real-world match, both records are stored, ELO recompute processes both, and ratings, win%, and event podium standings are silently corrupted.

**Goal:** Detect when a *different user* submits a match that duplicates one already recorded by another user (same 4 players, same day, same scores) and surface a soft warning that lets them decide whether to cancel or save anyway. Same-user re-submissions are not subject to duplicate checking.

**Scope:** Exact duplicates only. "Same players, different scores" and "conflicting outcomes" are out of scope for this iteration.

---

## 2. Goals

1. Detect when a different user submits a match that duplicates one already recorded by another user, and surface a soft warning — not a silent failure and not a hard block.
2. Give the submitter the final say: cancel if it is an accidental duplicate, or save anyway if it is a legitimate separate match (e.g. a same-day rematch with the same score).
3. Do not apply duplicate checking when the submitter is the same user who entered the original match.
4. Create a match detail page that serves as both the duplicate error destination and a general-purpose shareable match permalink.
5. Apply the same duplicate rule to all users, including admins.

---

## 3. User Stories

**As a player entering a match result,** I want the system to warn me if another player already recorded the same match today, so I don't create a duplicate entry that corrupts ratings.

**As a player who sees a duplicate warning,** I want a tappable link to the already-recorded match so I can verify — and if it turns out to be a different match (e.g. a same-day rematch with the same score), I want to be able to save it anyway without involving an admin.

**As any user viewing a match,** I want a match detail page that shows me the players, teams, scores, date, and who entered it.

---

## 4. Functional Requirements

### 4.1 — Canonical Match Fingerprint

1. The system **must** compute a perspective-neutral fingerprint for every new match submission before writing to the database.
2. The fingerprint **must** be derived from: the 4 player IDs (team-normalized), the `matchDate` field (`YYYY-MM-DD`, the actual date of play selected by the user), and the game scores (order-normalized). `createdAt` (server time) **must not** be used — two players entering the same match on different calendar days would otherwise produce different fingerprints and bypass deduplication.
3. Fingerprint normalization rules:
   - Sort player IDs within each team alphabetically.
   - Normalize team order: if `sortedTeam1[0] > sortedTeam2[0]`, swap teams and flip all game scores accordingly.
   - Sort game score pairs ascending by the normalized team-1 score (then team-2 score as tiebreaker) to be order-invariant.
   - Final format: `"p1,p2;p3,p4;YYYY-MM-DD;21-15,21-18"`
4. The `Match` table **must** have a nullable `fingerprint` column protected by a **partial unique index** scoped to non-voided rows (`WHERE "voidedAt" IS NULL`). A plain column-level `UNIQUE` constraint **must not** be used — it would enforce uniqueness across voided rows too, preventing re-entry after a void.
5. The column **must** be nullable so existing rows (without a fingerprint) are unaffected, and so that multiple NULLs can coexist under the partial index.

### 4.2 — Duplicate Detection at Submission

6. When a new match is submitted, the API **must** query for an existing **non-voided** match with the same fingerprint (i.e. `WHERE fingerprint = $1 AND voidedAt IS NULL`) — with **no user filter**. Filtering by user at query time would cause same-user re-entries to find nothing, proceed to INSERT, and crash with a P2002 unique constraint violation.
7. Based on the query result, the API **must** branch as follows:
   - **Match found, same `enteredByUserId` as submitter** → skip the duplicate warning and save the match with `fingerprint = null`. Voided matches **must not** trigger a warning — voiding a match must free its fingerprint for future use.
   - **Match found, different `enteredByUserId`** → return HTTP `409 Conflict` with `{ "error": "duplicate_match", "existingMatchId": "<id>" }`. This is a **soft warning**, not a hard block — the user can override it (see §4.3).
   - **No match found** → proceed to save with the fingerprint stored.
8. The client **may** re-submit with a `force: true` flag in the request body to bypass the fingerprint check entirely. When `force: true` is set, the API **must** skip the duplicate lookup and save the match with `fingerprint = null`. A null fingerprint is excluded from the partial unique index and will not interfere with future entries.
9. If no duplicate is found (and `force` is not set), the match **must** be created with the fingerprint stored in the `fingerprint` column.
10. If the database `INSERT` fails with a unique constraint violation on `fingerprint` (Prisma error code `P2002`), the API **must** return `409 Conflict` with the conflicting match's ID — **not** a `500` error. This handles the race condition where two different users submit simultaneously and both pass the pre-check. The client handles this the same as a normal 409 (soft warning). Note: the conflicting match ID is not available from the Prisma error object — the handler must perform an additional `findFirst({ where: { fingerprint, voidedAt: null } })` query to retrieve it.
11. The duplicate check logic **must** apply uniformly to all users, including admins.

### 4.3 — UI: Duplicate Error Handling on the Enter Form

12. When the enter form receives a `409` response, it **must** display an inline warning message — not navigate away.
13. The warning **must** read: *"A match with these players and this score was already recorded today."*
14. The warning **must** include a tappable link to the existing match detail page (`/match/[existingMatchId]`) so the user can verify.
15. The warning **must** offer two actions:
    - **"Cancel"** — clears the warning and returns the form to its normal editable state, allowing the user to modify and resubmit.
    - **"Save anyway"** — re-submits the form with `force: true`, saving the match without a fingerprint.
16. The original submit button **must** remain hidden/disabled while the warning is active. Only "Cancel" and "Save anyway" are available.
17. After a successful "Save anyway" submission, the form **must** behave identically to a normal successful submission.

### 4.4 — Match Edit (Fingerprint Maintenance)

18. When a match is edited via the PATCH endpoint (within the 20-minute edit window), the API **must** recompute the fingerprint from the updated data and store it on the match record. The stale fingerprint from the original submission **must** be replaced.
19. If the updated fingerprint collides with a fingerprint on a different existing active match, the PATCH endpoint **must** return `409 Conflict` with `{ "error": "duplicate_match", "existingMatchId": "<id>" }` — a soft warning, not a hard block. The match record **must not** be modified until the user confirms.
20. The client **may** re-submit the PATCH with `force: true` to bypass the collision check. When `force: true` is set, the match **must** be updated with `fingerprint = null`.

### 4.5 — Match Detail Page

21. The system **must** have a page at `/match/[id]` that serves two purposes: (a) the destination for the duplicate error link in the enter form, and (b) a general-purpose shareable match permalink accessible from any context (e.g. match history rows, shared links).
22. The page **must** show:
    - Match date
    - Event tag (if present, e.g. "Club Championships")
    - Team 1 players (names, tappable links to their profiles if available)
    - Team 2 players (names, tappable links to their profiles if available)
    - Game-by-game scores
    - Final outcome (which team won)
    - Who entered the match and when (`createdAt`)
    - ELO rating delta per player for this match (e.g. "+12" or "−8"), derived from `RatingSnapshot` records
23. Rating deltas **must** be displayed alongside each player's name. If no `RatingSnapshot` exists yet for a player on this match (e.g. recompute has not run), the delta **must** be omitted silently — no error state.
24. The page **must** be accessible to any authenticated user.
25. If the match ID does not exist in the database, the page **must** show "Match not found." If the match exists but has been voided, the page **must** show "This match is no longer available."

---

## 5. Non-Goals (Out of Scope)

- **Same players, different scores on same day** — two legitimately different matches between the same 4 players on the same day are allowed.
- **Conflicting outcomes** — where two players enter the same scores but disagree on who won (perspective mismatch). Deferred.
- **Admin override** — admins are subject to the same soft warning flow as regular users. A separate admin bypass is not provided.
- **Retroactive fingerprinting** — existing matches without a fingerprint are not backfilled.
- **Near-duplicate detection** (slight score variations, typos) — out of scope.
- **Legacy duplicate shadow profiles:** If two shadow profiles exist in the DB with the same display name (a known pre-existing condition), two submitters resolving the same person to different shadow IDs will produce different fingerprints and the duplicate will not be caught. This is a known limitation affecting only historical shadow duplicates; new shadow profiles are deduplicated at creation time.

---

## 6. Design Considerations

- The inline duplicate error on the enter form should visually match other inline error states already used in the form (same style/component).
- The match detail page should follow the existing app visual language (same typography, card styles, player name rendering as used in match history lists).
- The "Cancel" button in the error state should be clearly secondary to the "View match" link.

---

## 7. Technical Considerations

- **DB migration:** Add the `fingerprint TEXT` column and a **partial unique index** via the Supabase SQL editor (not `prisma migrate` — pgBouncer incompatible):
  ```sql
  ALTER TABLE "Match" ADD COLUMN "fingerprint" TEXT;
  CREATE UNIQUE INDEX match_fingerprint_active ON "Match" (fingerprint) WHERE "voidedAt" IS NULL;
  ```
  A partial index (not a plain `UNIQUE` column constraint) is required so that voiding a match genuinely frees its fingerprint for re-use — a standard `UNIQUE` constraint would enforce uniqueness across all rows including voided ones and silently break re-entry. Then update `prisma/schema.prisma` and run `npx prisma generate`.
- **Fingerprint utility:** New file `lib/services/matchFingerprint.ts` — pure function, no DB dependency, easy to unit test.
- **Match creation API:** `app/api/matches/route.ts` — fingerprint logic goes after player resolution, before the DB transaction (around line 224). Three paths: (a) same-user submission → skip check, save with `fingerprint: null`; (b) cross-user, no duplicate found → save with fingerprint; (c) cross-user, duplicate found → return 409. For the P2002 race-condition catch (req 11), the conflicting match ID is **not** available from the Prisma error object — the handler must follow the catch with an additional `prisma.match.findFirst({ where: { fingerprint, voidedAt: null } })` to retrieve the ID before returning the 409. When `force: true` is in the request body, skip the fingerprint lookup and set `fingerprint: null` on the new match.
- **Match detail page:** New route `app/match/[id]/page.tsx`. Designed as a general-purpose permalink — include back navigation and consider surfacing the link from match history list rows in a future pass. Reuse existing player name rendering patterns from `components/command/MatchHistoryList.tsx` and `components/events/EventMatchList.tsx`. For rating deltas: `RatingSnapshot` stores the post-match `rating` per player but no explicit delta field. Fetch all `RatingSnapshot` records for this match's `matchId`, then for each player fetch their `RatingSnapshot` for the immediately preceding match (ordered by `matchDate` desc) to compute `delta = thisSnapshot.rating - prevSnapshot.rating`. If no previous snapshot exists (first-ever match for that player), display the absolute rating without a delta. Include the latest `RatingRun`'s snapshots only (join via `runId`) to avoid double-counting from recompute runs.
- **Enter form:** `app/(tabs)/enter/page.tsx` — add a `duplicateMatchId` state string; when set, show the error UI. Clear on "Cancel".

---

## 8. Success Metrics

- When a likely duplicate is submitted, the API consistently returns 409 with a valid `existingMatchId`.
- The enter form correctly surfaces the inline warning with a working match detail link, "Cancel", and "Save anyway" actions.
- "Save anyway" successfully stores the match and behaves identically to a normal submission from the user's perspective.
- Accidental double-submissions are caught and the user self-corrects via the warning (no admin intervention needed).
- Legitimate same-day rematches with the same score can be saved without admin involvement.
- Existing matches and rating history are unaffected after deployment.

---

## 9. Open Questions

> **Resolved:** Voided matches do **not** block re-entry — the fingerprint lookup filters `voidedAt IS NULL` (see req 6). Voiding a match frees its fingerprint.

> **Resolved:** The match detail page **must** show ELO rating deltas per player (see req 23). Delta is computed from adjacent `RatingSnapshot` records — no separate delta column is needed.
