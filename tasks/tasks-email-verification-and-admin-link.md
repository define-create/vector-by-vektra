## Relevant Files

- `lib/email.ts` - Email sending utility; add production guard for missing API key.
- `app/api/auth/register/route.ts` - Registration endpoint; wrap email send in try/catch.
- `app/api/auth/resend-verification/route.ts` - New POST endpoint to resend a verification email.
- `app/api/auth/resend-verification/route.test.ts` - Unit tests for the resend-verification endpoint.
- `app/resend-verification/page.tsx` - New page with email input form for requesting a new verification email.
- `app/sign-in/page.tsx` - Add subtle "Didn't get the verification email?" link pointing to `/resend-verification`.
- `components/command/ClaimProfilePrompt.tsx` - Add inline resend form to `UnverifiedState` component.
- `app/api/admin/players/[id]/link/route.ts` - New POST endpoint for admin to link a shadow profile to a user account.
- `app/api/admin/players/[id]/link/route.test.ts` - Unit tests for the admin link endpoint.
- `app/api/admin/users/route.ts` - New GET endpoint for admin user search by email.
- `app/api/admin/users/route.test.ts` - Unit tests for the admin user search endpoint.
- `app/admin/players/page.tsx` - Add "Link to user account" section to the Identity Edit panel.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `route.ts` and `route.test.ts` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- Reference `app/api/admin/players/[id]/unclaim/route.ts` as the structural template for the new `/link` endpoint.
- Reference `app/api/admin/players/[id]/unclaim/route.test.ts` as the structural template for the new link endpoint tests.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/email-verification`

- [x] 1.0 Configure Resend and Vercel environment variables _(manual steps — must be completed before end-to-end testing)_
  - [x] 1.1 Create a free account at [resend.com](https://resend.com) if you don't have one
  - [x] 1.2 Choose a sender option: **Option A selected** (`onboarding@resend.dev`)
    - **Option A — Quick testing:** Use `onboarding@resend.dev` as `EMAIL_FROM`. Works immediately but can only deliver to your own Resend-verified email address. Good for local and staging testing.
    - **Option B — Production:** In the Resend dashboard go to _Domains → Add Domain_, enter your domain, then add the provided DNS records (SPF, DKIM, MX) at your DNS provider. Wait for the status to show "Verified" (usually a few minutes).
  - [x] 1.3 In the Resend dashboard go to _API Keys → Create API Key_, give it a name (e.g. `vector-production`), set permissions to _Sending access_, and copy the key (format: `re_xxxxxxxxx`)
  - [x] 1.4 Add environment variables to your local `.env.local` file:
    ```
    RESEND_API_KEY=re_xxxxxxxxx
    EMAIL_FROM=Vector by Vektra <noreply@yourdomain.com>
    ```
    _(Use `onboarding@resend.dev` for `EMAIL_FROM` if going with Option A)_
  - [x] 1.5 Add the same variables to Vercel: go to _Project Settings → Environment Variables_, add `RESEND_API_KEY` and `EMAIL_FROM` for the Production environment (and optionally Preview)
  - [x] 1.6 Trigger a redeploy in Vercel (_Deployments → the latest deployment → Redeploy_) so the new env vars take effect

- [x] 2.0 Fix email sending — fail loudly in production and handle registration failures gracefully
  - [x] 2.1 In `lib/email.ts`, add a check: if `!RESEND_API_KEY` and `NODE_ENV === 'production'`, throw an `Error('RESEND_API_KEY is not configured.')` instead of logging to console
  - [x] 2.2 In `app/api/auth/register/route.ts`, wrap the `sendVerificationEmail(email, rawToken)` call in a `try/catch` block
  - [x] 2.3 On catch: log the error server-side (`console.error`) and return a `201` response with a message indicating the account was created but the email could not be sent, directing the user to `/resend-verification`

- [x] 3.0 Build resend-verification API endpoint
  - [x] 3.1 Create `app/api/auth/resend-verification/route.ts` with a `POST` handler
  - [x] 3.2 Parse `{ email }` from the request body; return `400` if missing
  - [x] 3.3 Look up the user by email; if not found or already verified (`emailVerifiedAt` is set), return a generic `200` success response (do not leak whether the email exists)
  - [x] 3.4 Generate a new `rawToken` (`crypto.randomBytes(32).toString('hex')`), hash it with SHA-256, and set a new 24-hour expiry
  - [x] 3.5 Update the user record with the new `emailVerificationToken` (hashed) and `emailVerificationTokenExpiry`
  - [x] 3.6 Call `sendVerificationEmail(email, rawToken)` to send the new link
  - [x] 3.7 Return a generic `200` success message regardless of outcome
  - [x] 3.8 Write unit tests in `app/api/auth/resend-verification/route.test.ts` covering: missing email (400), already-verified user (200 no-op), unverified user receives new token (200), and non-existent email (200 no-op)

- [x] 4.0 Build `/resend-verification` page and update sign-in page + ClaimProfilePrompt UI
  - [x] 4.1 Create `app/resend-verification/page.tsx` as a client component with an email input and a submit button
  - [x] 4.2 On submit, call `POST /api/auth/resend-verification` and show inline success ("Check your inbox for a new verification link.") or error feedback
  - [x] 4.3 Style the page to match the existing sign-in / register page (zinc dark theme, same card, input, and button patterns)
  - [x] 4.4 In `app/sign-in/page.tsx`, add a subtle small-text link below the main sign-in form: "Didn't get the verification email?" linking to `/resend-verification`
  - [x] 4.5 In `components/command/ClaimProfilePrompt.tsx`, update the `UnverifiedState` component to include an inline "Resend verification email" form
  - [x] 4.6 Pre-fill the email input in `UnverifiedState` from the user's session email if available (pass it as a prop from the parent)
  - [x] 4.7 On submit in `UnverifiedState`, call `POST /api/auth/resend-verification` and show inline success/error feedback without navigating away

- [x] 5.0 Build admin "link shadow profile to user" API endpoints
  - [x] 5.1 Create `app/api/admin/players/[id]/link/route.ts` with a `POST` handler (use `app/api/admin/players/[id]/unclaim/route.ts` as a structural template)
  - [x] 5.2 Check the session — return `403` if the user is not an admin
  - [x] 5.3 Parse `{ userId }` from the request body; return `400` if missing
  - [x] 5.4 Look up the player by `id`; return `404` if not found or soft-deleted, `409` if already claimed (`userId !== null`)
  - [x] 5.5 Look up the target user by `userId`; return `404` if not found; return `409` if the user already has an active (non-deleted) player profile
  - [x] 5.6 Update the player: set `userId`, `claimed = true`, `claimedAt = new Date()`, `trustTier = 'verified_email'`
  - [x] 5.7 Write an audit event using `writeAuditEvent` with `actionType: 'claim_profile'`, `adminUserId` set to the session user's id, and `metadata: { linkedByAdmin: true, linkedUserId: userId }`
  - [x] 5.8 Return `{ ok: true }` on success
  - [x] 5.9 Create `app/api/admin/users/route.ts` with a `GET` handler
  - [x] 5.10 Accept `?q=` query param (email search, case-insensitive `contains`); return `400` if `q` is missing or empty
  - [x] 5.11 Query users matching the email, including their related `player` (select only `id` and `deletedAt`); return up to 10 results
  - [x] 5.12 For each user return: `id`, `email`, `handle`, `displayName`, `emailVerified` (boolean from `emailVerifiedAt`), and `hasActivePlayer` (true if `player` exists and `player.deletedAt` is null)
  - [x] 5.13 Write unit tests in `app/api/admin/players/[id]/link/route.test.ts` covering: non-admin blocked (403), missing userId (400), player not found (404), already claimed (409), user not found (404), user already has player (409), and successful link (200 + audit event written)
  - [x] 5.14 Write unit tests in `app/api/admin/users/route.test.ts` covering: missing query (400), no results (empty array), results with and without active player profiles

- [x] 6.0 Build admin UI for linking a shadow profile to a user account
  - [x] 6.1 In `app/admin/players/page.tsx`, add user-search state to the `IdentityEditPanel` component: `userQuery`, `userResults`, `selectedUser`, `linkConfirming`, `linkLoading`, `linkError`, `linkSuccess`
  - [x] 6.2 Add a `useEffect` that fetches `GET /api/admin/users?q=` when `userQuery` changes (debounce or use the existing `usePlayerSearch` pattern)
  - [x] 6.3 Render the "Link to user account" section only when the selected player is unclaimed (`!selected.claimed`)
  - [x] 6.4 Inside the section, render a text input for `userQuery` and a results list showing each user's email, handle, and a "(has profile)" note if `hasActivePlayer` is true — grey out and disable users who already have a profile
  - [x] 6.5 On selecting a user, set `selectedUser` and hide the results list
  - [x] 6.6 Show a confirmation dialog (amber style, matching existing patterns) displaying the player name and selected user's email before submitting
  - [x] 6.7 On confirm, call `POST /api/admin/players/[selected.id]/link` with `{ userId: selectedUser.id }`, show inline success or error, and reset state on success
  - [x] 6.8 Ensure the "Link to user account" section is not rendered when a claimed profile is selected (the "Unclaim" button covers that case)
