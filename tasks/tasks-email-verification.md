## Relevant Files

- `lib/email.ts` - Existing email helper; add `sendPasswordResetEmail` here
- `prisma/schema.prisma` - Add `passwordResetToken` and `passwordResetTokenExpiresAt` to `User` model
- `app/api/auth/register/route.ts` - Registration flow; no code changes needed (already uses `EMAIL_FROM`)
- `app/api/auth/resend-verification/route.ts` - Resend verification; no code changes needed (already uses `EMAIL_FROM`)
- `app/api/auth/forgot-password/route.ts` - New: generate and send reset token
- `app/api/auth/reset-password/route.ts` - New: validate token and update password
- `app/forgot-password/page.tsx` - New: email input form page
- `app/reset-password/page.tsx` - New: new password + confirm form page
- `app/sign-in/page.tsx` - Add "Forgot password?" link

### Notes

- No unit tests are required for this feature — email flows are best verified manually end-to-end.
- Follow the existing pattern in `lib/email.ts`: raw token sent in email, SHA-256 hash stored in DB.
- The `EMAIL_FROM` env var is already read from `process.env.EMAIL_FROM` in `lib/email.ts` — no code change needed in `register` or `resend-verification` routes, only the env var value needs updating.
- After editing `prisma/schema.prisma`, always run `npx prisma generate` before testing.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [ ] 0.0 Configure Resend sending subdomain and update `EMAIL_FROM`
  - [ ] 0.1 In the Resend dashboard (resend.com → Domains → Add Domain), add `vector.resend.dev` as a sending domain and follow the DNS verification steps
  - [ ] 0.2 Once verified, update `.env.local`: set `EMAIL_FROM="Vector by Vektra <noreply@vector.resend.dev>"`
  - [ ] 0.3 Update the Vercel environment variables to set the same `EMAIL_FROM` value (and confirm `RESEND_API_KEY` is already set in Vercel)
  - [ ] 0.4 Verify the existing `lib/email.ts` reads `EMAIL_FROM` from `process.env.EMAIL_FROM` (it does — no code change needed here)

- [x] 1.0 Apply Prisma schema changes for password reset token fields
  - [x] 1.1 Open `prisma/schema.prisma` and add two optional fields to the `User` model, after `emailVerificationTokenExpiry`:
    ```
    passwordResetToken          String?
    passwordResetTokenExpiresAt DateTime?
    ```
  - [x] 1.2 Run `npx prisma generate` to regenerate the Prisma client (no DB connection needed)
  - [ ] 1.3 Apply the migration via the Supabase SQL editor (direct connection, not pgBouncer):
    ```sql
    ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT;
    ALTER TABLE "User" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMPTZ;
    ```
  - [ ] 1.4 Confirm the columns appear in the Supabase table editor for the `User` table

- [x] 2.0 Add `sendPasswordResetEmail` helper to `lib/email.ts`
  - [x] 2.1 In `lib/email.ts`, add a new exported function `sendPasswordResetEmail(email: string, rawToken: string): Promise<void>` following the same structure as `sendVerificationEmail`
  - [x] 2.2 The reset URL should be `${baseUrl}/reset-password?token=${rawToken}`
  - [x] 2.3 Use subject `"Reset your Vector password"` and a plain-text-style HTML body with the reset link and a note that it expires in 1 hour
  - [x] 2.4 Include the same dev fallback: if `RESEND_API_KEY` is not set, log the reset URL to console instead of throwing

- [x] 3.0 Build `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` API routes
  - [x] 3.1 Create `app/api/auth/forgot-password/route.ts`:
    - Accept `{ email }` from request body
    - Look up the user by email; if not found or not email-verified, still return the same generic 200 response (prevents user enumeration)
    - Generate raw token: `crypto.randomBytes(32).toString('hex')`
    - Hash for storage: `crypto.createHash('sha256').update(rawToken).digest('hex')`
    - Set expiry: `new Date(Date.now() + 60 * 60 * 1000)` (1 hour)
    - Update user with `passwordResetToken` (hashed) and `passwordResetTokenExpiresAt`
    - Call `sendPasswordResetEmail(email, rawToken)` (raw token goes in the email)
    - Always return `{ message: "If that address is registered, a reset link is on its way." }` with status 200
  - [x] 3.2 Create `app/api/auth/reset-password/route.ts`:
    - Accept `{ token, newPassword }` from request body
    - Validate `newPassword` is at least 8 characters
    - Hash the incoming token: `crypto.createHash('sha256').update(token).digest('hex')`
    - Look up user by `passwordResetToken` (the hash); return 400 if not found
    - Check `passwordResetTokenExpiresAt` is in the future; return 400 with `"Reset link has expired"` if not
    - Hash new password with `bcrypt.hash(newPassword, 12)`
    - Update user: set `passwordHash` to new hash, set `passwordResetToken = null`, `passwordResetTokenExpiresAt = null`
    - Return `{ message: "Password updated. You can now sign in." }` with status 200

- [x] 4.0 Build `/forgot-password` and `/reset-password` pages
  - [x] 4.1 Create `app/forgot-password/page.tsx` — a `"use client"` component:
    - Centered card layout matching `/sign-in`: `min-h-screen flex items-center justify-center px-4` → inner `w-full max-w-sm`
    - Heading: "Forgot password"
    - Single email input (same `inputClass` as sign-in page)
    - "Send reset link" button (same style as sign-in submit button)
    - On submit: POST to `/api/auth/forgot-password`; on success (any response), show success state: "Check your email for a reset link." (shown regardless of whether email exists)
    - Link back to `/sign-in` at the bottom
  - [x] 4.2 Create `app/reset-password/page.tsx` — a `"use client"` component wrapped in `<Suspense>` (needed for `useSearchParams`):
    - Read `token` from `useSearchParams()`
    - If no token in URL, show error: "Invalid reset link." with link to `/forgot-password`
    - Form with password + confirm password inputs and "Reset password" button
    - Client-side validate passwords match before submitting
    - On submit: POST to `/api/auth/reset-password` with `{ token, newPassword }`
    - On success: redirect to `/sign-in?reset=true`
    - On error (400): display the error message from the API and show link back to `/forgot-password`

- [x] 5.0 Add "Forgot password?" link to sign-in page and verify all email flows end-to-end
  - [x] 5.1 In `app/sign-in/page.tsx`, add a "Forgot password?" link below the sign-in form, pointing to `/forgot-password` (similar style to the existing "Resend it" link)
  - [x] 5.2 In `app/sign-in/page.tsx`, handle the `?reset=true` query param: show a success banner "Password updated. You can now sign in." (similar to the existing `verified` banner)
  - [ ] 5.3 Manual test — registration: register with a real external email address, confirm the verification email arrives and the verify link works
  - [ ] 5.4 Manual test — resend verification: use the `/resend-verification` page, confirm a new email arrives
  - [ ] 5.5 Manual test — password reset: use `/forgot-password`, confirm the reset email arrives, click the link, set a new password, confirm redirect to sign-in and that sign-in works with the new password
  - [ ] 5.6 Confirm the reset token is cleared after use (check DB: `passwordResetToken` and `passwordResetTokenExpiresAt` are null after successful reset)
