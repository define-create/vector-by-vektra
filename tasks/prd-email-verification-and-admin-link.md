# PRD: Email Verification Fix & Admin Profile Link

## 1. Introduction / Overview

New user registrations in production are silently broken. `RESEND_API_KEY` is not configured in Vercel, so the email provider (`resend`) is never invoked — the app falls back to `console.log`, which only appears in local dev server output. Real users who register never receive a verification email, and since the shadow profile claiming flow requires a verified email (`emailVerifiedAt`), they cannot claim their match history either.

This PRD covers two features delivered together:
- **Part 1 — Fix email verification**: configure Resend, fail loudly on misconfiguration, and add a resend-verification flow so stuck users can recover.
- **Part 2 — Admin profile link**: give admins a UI to manually link an unclaimed shadow profile to a registered user account (the reverse of the existing "Unclaim" action), for testing and edge-case recovery.

---

## 2. Goals

1. Ensure every new user registration triggers a real verification email in production.
2. Make misconfigured email fail visibly (error response) rather than silently succeeding.
3. Allow users who missed or lost their verification email to request a new one.
4. Allow users to access the "resend" option from both the sign-in page and the command tab.
5. Give admins the ability to manually link any unclaimed shadow profile to a user account without requiring the user to go through the email verification flow.

---

## 3. User Stories

**User — Registration & Verification**
- As a new user, I want to receive a verification email after registering so I can verify my account and claim my match history.
- As a new user who didn't receive the verification email, I want to request a new one from the sign-in page without having to re-register.
- As a logged-in but unverified user, I want to request a new verification email directly from the command tab so I don't have to navigate away.

**Admin**
- As an admin, I want to link an unclaimed shadow profile to a registered user account so I can resolve edge cases (e.g., email broken during onboarding, user registered but email never arrived).
- As an admin, I want the link action to be recorded in the audit log so I can trace who linked what and when.

---

## 4. Functional Requirements

### Part 1 — Email Verification Fix

**4.1** The system must throw an error (not silently log) when `RESEND_API_KEY` is missing and `NODE_ENV === 'production'`. This causes the registration endpoint to return an error response instead of a silent 201.

**4.2** The registration endpoint (`POST /api/auth/register`) must catch email sending failures. On failure: the user account is still created, but the response body must clearly indicate the email could not be sent and direct the user to the resend flow.

**4.3** A new `POST /api/auth/resend-verification` endpoint must accept `{ email: string }` and:
- Generate a new verification token and 24-hour expiry
- Update the user record in the database
- Send a new verification email via Resend
- Always return a generic success message (regardless of whether the email exists) to prevent email enumeration

**4.4** A dedicated `/resend-verification` page must exist with an email input form that calls `POST /api/auth/resend-verification` and shows success/error feedback inline.

**4.5** The sign-in page (`/sign-in`) must display a subtle "Didn't get the verification email?" link that is always visible, pointing to `/resend-verification`.

**4.6** The `UnverifiedState` component inside `ClaimProfilePrompt` (shown on the command tab) must include a "Resend verification email" inline form. The email input should be pre-filled from the user's session if available. On submit it calls `POST /api/auth/resend-verification` and shows inline feedback.

**4.7** The Resend API key and sender address must be added to Vercel environment variables before deploying (`RESEND_API_KEY`, `EMAIL_FROM`).

---

### Part 2 — Admin Profile Link

**4.8** A new `POST /api/admin/players/[id]/link` endpoint must accept `{ userId: string }` and:
- Be restricted to admin users only
- Validate the target player is unclaimed (`userId IS NULL`, `claimed = false`, not soft-deleted)
- Validate the target user exists and does not already have an active (non-deleted) player profile
- Update the player: set `userId`, `claimed = true`, `claimedAt = new Date()`, `trustTier = "verified_email"`
- Write an audit event with action type `claim_profile`, `adminUserId` set (so it's distinguishable from a user self-claim), and metadata including the linked userId

**4.9** A new `GET /api/admin/users` endpoint must accept `?q=` (email search) and return a list of matching users with: `id`, `email`, `handle`, `displayName`, `emailVerifiedAt`, and whether they already have an active player profile linked.

**4.10** The Identity Edit panel in `/admin/players` must show a "Link to user account" section when an **unclaimed** player profile is selected. This section must include:
- A user search input that queries `GET /api/admin/users?q=` by email
- A dropdown/list of matching users showing email, handle, and whether they already have a player profile
- A confirmation step before submitting
- A call to `POST /api/admin/players/[id]/link` on confirm
- Inline success/error feedback

**4.11** The "Link to user account" section must NOT appear when a claimed profile is selected (use the existing "Unclaim" action for those).

---

## 5. Non-Goals (Out of Scope)

- Enforcing email verification as a login requirement — login remains open to unverified users.
- OAuth or magic-link sign-in providers.
- Admin bulk-link operations.
- Automatically linking shadow profiles to users during registration.
- Any changes to the existing user self-claim flow (`ClaimProfilePrompt`) beyond adding the resend form to `UnverifiedState`.

---

## 6. Design Considerations

- The `/resend-verification` page should match the existing sign-in / register page style (zinc dark theme, same card/input/button patterns).
- The "Didn't get the verification email?" link on the sign-in page should be low-prominence — small text, below the main content, not a call-to-action button.
- The `UnverifiedState` resend form should be compact and inline — not a full page redirect.
- The admin "Link to user account" section should follow the existing admin UI patterns (zinc-900 panel, amber confirmation dialog).
- User search results in the admin UI should clearly indicate when a user already has a player profile (e.g., greyed out with a note), to prevent accidental overwrites.

---

## 7. Technical Considerations

- `lib/email.ts` — single place for all email sending; the production guard goes here.
- `app/api/auth/register/route.ts` — wrap `sendVerificationEmail` in try/catch; do not roll back account creation on email failure.
- `app/api/admin/players/[id]/unclaim/route.ts` — use as the structural template for the new `/link` endpoint (same pattern: session check, player lookup, validation, update, audit event).
- Audit events use `writeAuditEvent` from `lib/services/audit` — reuse for the admin link action with `adminUserId` populated.
- The `resend` package is already installed (v6.9.2) — no new dependencies needed.
- Admin middleware already protects `/api/admin/**` routes — the new endpoints inherit this protection.

---

## 8. Success Metrics

- New user registrations in production result in a delivered verification email (verifiable via Resend dashboard).
- Zero silent failures: a missing `RESEND_API_KEY` in production causes a visible error response on registration.
- Admins can link a shadow profile to a user without touching the database directly.
- Users who didn't receive their verification email can self-serve via the resend flow without contacting support.

---

## 9. Open Questions

- Should the resend endpoint rate-limit requests per email address (e.g. max 3 per hour) to prevent abuse? Not required for v1 but worth considering before launch.
- Should `EMAIL_FROM` default to a Resend-provided address during initial setup, or must the sending domain be verified first?
