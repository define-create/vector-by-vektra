# PRD: User Data Deletion (Right to Erasure)

## 1. Introduction / Overview

Users need a way to request permanent deletion of their personal data. This is required by
GDPR (right to erasure, Article 17 — 30-day response window) and CCPA (right to delete —
45-day window). Without this, the app cannot legally expand to EU users or California
residents at scale.

The feature works as a two-step human-reviewed process: the user submits a request from
their Profile screen, a 7-day cooling-off window begins, then an admin processes the
deletion from the admin panel. The user's account (email, password) is permanently deleted.
Their match history is anonymized — not voided — so other players' ratings are unaffected.

---

## 2. Goals

- Give users a clear, accessible way to request deletion of their personal data
- Satisfy GDPR Article 17 and CCPA right-to-delete obligations
- Protect other users from rating disruption caused by one person's deletion
- Give admins a frictionless way to process requests with a single link + click
- Maintain an audit trail of all deletion actions

---

## 3. User Stories

**As a user**, I want to request deletion of my account and personal data from the Profile
screen so that I can exercise my right to erasure without having to contact support.

**As a user**, I want to receive a confirmation that my request was received and know roughly
when it will be processed, so that I'm not left wondering whether anything happened.

**As a user**, I want to continue using the app normally after submitting my request, in
case I change my mind during the 7-day cooling-off period.

**As an admin**, I want to receive an email notification with a direct link to the user's
admin player page so that I can process the deletion in one action without searching.

**As an admin**, I want the deletion to anonymize the player profile (not void their
matches) so that other players' ratings are not disrupted.

---

## 4. Functional Requirements

### User-facing (Profile screen)

1. The Profile screen must display a "Delete my account" link/button, below "Include me in predictions" pill.
2. Tapping "Delete my account" must show confirmation message panel (similar to "i" panel) explaining:
   - The account and personal data (name, email, password) will be permanently deleted
   - Match history will be anonymized (not removed) — other players are unaffected
   - The request will be processed within 30 days
   - This cannot be undone
3. The confirmation UI must include a "Send deletion request" button and a "Cancel" option.
4. Tapping "Send deletion request" must call `POST /api/account/deletion-request`.
5. On success, the UI must display: *"Request sent. You'll receive a confirmation email
   when your data is deleted (within 30 days)."*
6. The user must remain signed in and able to use the app after submitting the request.
7. If the same user submits a deletion request more than once within 24 hours, the API must
   return a success response (idempotent) but must not send duplicate emails.

### Email notifications

8. On submission, the system must send a **confirmation email to the user** acknowledging
   receipt of the request and stating the 30-day processing window.
9. On submission, the system must send an **admin notification email** to
   `vectorbyvektra@gmail.com` containing:
   - User's display name and email address
   - User ID and Player ID
   - Request timestamp
   - A direct link to the user's entry in `/admin/players?highlight={userId}` (or similar)
   - A note that the request should not be processed before 7 days have elapsed (cooling-off)
10. Before executing the deletion, the system must send a **final confirmation email** to the
    user's address notifying them that their data is being deleted now.

### Admin-facing

11. The admin players page (`/admin/players`) must be renamed **"Merge / Edit / Delete
    Players"** — update the page heading and any navigation labels that reference it.
12. The page must display a **"Delete Account"** button for any player that has a linked
    user account (i.e., `player.userId IS NOT NULL`), alongside the existing Merge and Edit
    buttons.
13. Tapping "Delete Account" must show a confirmation modal before proceeding.
14. Confirming must call `POST /api/admin/users/[id]/delete`.
15. The deletion endpoint must execute the following steps **in a single transaction**:
    a. Verify the User record exists and has not already been deleted.
    b. Send the final confirmation email to the user's email address (best-effort —
       proceed even if email fails).
    c. Set `Match.enteredByUserId = NULL` for all matches entered by this user.
    d. Delete all `MatchupShare` records where `createdByUserId = userId`.
    e. Delete all `InviteToken` records where `invitedByUserId = userId` or
       `claimedByUserId = userId`.
    f. Anonymize the `Player` record:
       - Set `displayName` → `"Deleted User #" + player.id.slice(0, 6)`
       - Set `userId` → `null`
       - Set `claimed` → `false`
       - Set `deletedAt` → current timestamp
       - Set `optOutPredictions` → `true`
    g. Hard-delete the `User` record (cascades to EmailVerification,
       PasswordResetToken via foreign key).
    h. Write an `AuditEvent` with:
       - `actionType`: `"delete_user"`
       - `entityType`: `"user"`
       - `entityId`: userId
       - `metadata`: `{ displayName, email, playerId, reason: "user_request" }`
16. `MatchParticipant` and `RatingSnapshot` records must **not** be deleted or voided.
    They are retained as anonymous statistical records. No rating recompute is triggered.
17. The admin must be shown a success message after deletion completes.

---

## 5. Non-Goals (Out of Scope)

- **No self-service immediate deletion** — admin oversight is required. The 7-day
  cooling-off period exists to catch accidental requests.
- **No cancellation flow** — if a user wants to cancel before the admin processes it, they
  contact the admin directly (email is sufficient at current scale).
- **No voiding of matches** — matches are anonymized, not voided. Voiding would disrupt
  other players' ratings and is not required for GDPR/CCPA compliance.
- **No dedicated deletion request queue page in admin** — email notification + link to the
  existing admin players page is sufficient.
- **No changes to `MatchParticipant` or `RatingSnapshot` records** — these become
  anonymized records once the player name is scrubbed and the User is deleted.
- **No support for deleting admin accounts** via this flow — admin accounts require manual
  DB-level handling.

---

## 6. Design Considerations

### Profile screen

- The "Delete my account" trigger should be visually low-key (small, muted/danger color
  like `text-red-400`) to avoid accidental taps, but clearly discoverable.
- The confirmation state replaces the button in-place (no modal/sheet) — simpler and avoids
  the Android back-button ambiguity.
- Pattern to follow: `app/(tabs)/profile/OptOutPredictionsToggle.tsx` for client component
  structure, `app/(tabs)/profile/page.tsx` for placement.

### Admin players page (`/admin/players`)

- Page heading changes from "Merge / Edit Players" to **"Merge / Edit / Delete Players"**.
- The "Delete Account" button should only appear for claimed players (those with a `userId`).
- It should be visually distinct from the Merge and Edit buttons — red/danger styling
  (e.g. `bg-red-900/40 text-red-400 border-red-800`).
- The confirmation modal must display the user's display name and email address so the admin
  can confirm they are acting on the correct account.
- The admin notification email (requirement 9) must deep-link directly to the player's row
  on this page using a `?highlight={userId}` query param or similar anchor.

---

## 7. Technical Considerations

- **Email sending**: Use the existing `lib/email.ts` pattern (Resend SDK). Add two new
  functions: `sendDeletionRequestEmail(adminEmail, userData)` and
  `sendDeletionConfirmationEmail(userEmail, displayName)`.
- **Idempotency**: To prevent duplicate emails on repeated submission, check a simple
  rate-limit or store the last request timestamp. The simplest approach: add a
  `deletionRequestedAt DateTime?` field to the `User` model and reject requests if one was
  submitted within the past 24 hours. Alternatively, check in the API without a schema
  change using a simple in-memory or no-op approach (duplicate emails are a minor nuisance,
  not a critical failure).
- **Transaction**: The admin deletion must use `prisma.$transaction` to ensure atomicity —
  if the hard-delete of the User fails, the player anonymization must also roll back.
- **AuditEvent enum**: A new `delete_user` value must be added to the `AuditEventAction`
  enum in `prisma/schema.prisma`. After adding it, run `npx prisma generate` and apply
  the migration via the Supabase SQL editor:
  ```sql
  ALTER TYPE "AuditEventAction" ADD VALUE 'delete_user';
  ```
- **Foreign key cascade**: Confirm that `EmailVerification` and `PasswordResetToken` tables
  have `ON DELETE CASCADE` on their `userId` FK, or delete them explicitly before deleting
  the User row to avoid constraint violations.
- **No rating recompute** is triggered by this operation — match records are untouched.

---

## 8. Success Metrics

- A user can submit a deletion request from the Profile screen without contacting support.
- The admin receives a correctly formatted email with a working direct link within 60 seconds
  of the user submitting the request.
- After admin processes the deletion:
  - The deleted user cannot sign in (account gone)
  - The player profile shows as "Deleted User #xxxxxx" in any match history views
  - No other players' ratings have changed
  - An audit event is visible in `/admin/audit-events`
- Zero regression on normal sign-in, profile editing, and match entry flows.

---

## 9. Resolved Decisions

- **`Match.enteredByUserId` FK**: Before hard-deleting the User row, explicitly set
  `Match.enteredByUserId = NULL` for all matches entered by that user. This preserves match
  records without a constraint violation. Add this as step (b1) in the transaction sequence
  (after sending the confirmation email, before deleting MatchupShare records).

- **Post-deletion session handling**: Add a guard in the app's auth layer — if a valid JWT
  resolves to a User ID that no longer exists in the DB, treat it as unauthenticated and
  redirect to `/sign-in`. This is a defensive measure that also handles other edge cases
  (e.g., manually deleted accounts).

- **Cooling-off enforcement**: Advisory only — the admin email notes the 7-day window. No
  technical lock on the "Delete Account" button. No `deletionRequestedAt` field added.

- **Confirmation email failure**: Proceed with deletion even if the final confirmation email
  fails. Log the failure but do not abort or roll back the transaction. The deletion is the
  critical operation; the email is best-effort.

- **Admin email deep link**: The notification email links to `/admin/players` (no
  `?highlight` param). Player details (display name, email, user ID, player ID) are included
  in the email body so the admin can search for the player by name on that page.
