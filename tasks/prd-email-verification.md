# PRD: Email Verification — Full Delivery for Any Address

## Introduction / Overview

Currently the app uses `EMAIL_FROM="onboarding@resend.dev"`, which is Resend's shared sandbox address. Emails sent from this address are only delivered to the Resend account owner's email — all other recipients silently receive nothing. This means new user registrations, resend-verification requests, and password resets do not work for real users.

The fix is to set up a verified Resend sending subdomain (e.g. `noreply@vector.resend.dev`) and update all three email flows to use it.

---

## Goals

1. Verification emails reach **any** email address on registration
2. The resend-verification flow works for any user who missed the first email
3. Password reset emails are delivered to any address
4. No custom domain purchase required — uses Resend's free subdomain

---

## User Stories

- **As a new user**, I receive a verification email at my real email address so I can confirm my account.
- **As a user who missed the verification email**, I can request it again from the app and receive it.
- **As a user who forgot their password**, I can request a reset link and receive it at my email address.
- **As an admin**, I don't need to take any action to make email delivery work for new users.

---

## Functional Requirements

1. A Resend sending subdomain must be configured (e.g. `vector.resend.dev`) via the Resend dashboard and the `EMAIL_FROM` env var updated to `noreply@vector.resend.dev` (or similar) in both `.env.local` and Vercel environment variables.
2. The registration flow must send a verification email using the new `EMAIL_FROM` value.
3. The resend-verification endpoint (`app/api/auth/resend-verification/route.ts`) must send using the same `EMAIL_FROM`.
4. A password reset flow must exist and send using the same `EMAIL_FROM`:
   - `POST /api/auth/forgot-password` — accepts `{ email }`, generates a reset token, sends the reset email
   - `POST /api/auth/reset-password` — accepts `{ token, newPassword }`, validates and applies the reset
   - A `/forgot-password` page with an email input form
   - A `/reset-password?token=...` page with a new password + confirm form
5. All emails must reuse the existing Resend client and email helper pattern — no new library needed.
6. Existing unverified users can re-trigger verification via the existing resend-verification UI — no admin action needed.
7. Reset tokens must be single-use: cleared from the database immediately after successful use.

---

## Non-Goals (Out of Scope)

- Custom domain setup (e.g. `@yourdomain.com`) — Resend subdomain is sufficient
- HTML email templates / branded email design — plain functional emails are acceptable
- Admin bulk-resend to all unverified users
- Email change / update flow
- OAuth / social sign-in

---

## Design Considerations

- The `/forgot-password` and `/reset-password` pages must match existing auth page styles: centered card layout, `max-w-sm`, zinc dark color scheme — consistent with `/sign-in` and `/register`
- `/forgot-password`: single email input + "Send reset link" button; show success state ("Check your email") regardless of whether the email exists (prevents user enumeration)
- `/reset-password?token=...`: password + confirm password inputs + "Reset password" button
- Error states: invalid or expired token shows a clear message with a link back to `/forgot-password`
- Success state on reset: redirect to `/sign-in` with a success message

---

## Technical Considerations

- **Resend subdomain setup**: resend.com → Domains → Add Domain → enter `vector.resend.dev`. Resend provides DNS records to configure. Once verified, set `EMAIL_FROM="noreply@vector.resend.dev"` in `.env.local` and in Vercel environment variables.
- **Schema changes**: Add `passwordResetToken String?` and `passwordResetTokenExpiresAt DateTime?` to the `User` model in `prisma/schema.prisma`. Run `npx prisma generate`. Apply migration via Supabase SQL editor:
  ```sql
  ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT;
  ALTER TABLE "User" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMPTZ;
  ```
- **Token generation**: `crypto.randomBytes(32).toString('hex')` — no new library needed.
- **Token expiry**: 1 hour from generation.
- **Token invalidation**: Set `passwordResetToken = null` and `passwordResetTokenExpiresAt = null` after successful password reset.
- **Security**: The forgot-password endpoint must return the same response whether or not the email exists (prevents user enumeration attacks).

---

## Success Metrics

- A test registration with a real external email address receives the verification email within 60 seconds
- Clicking resend-verification from the UI delivers a new email to any address
- A password reset request delivers a working reset link to any email address
- No "email not delivered" reports from real users after deploy

---

## Decisions Made

- **Sending subdomain**: `vector.resend.dev` — `EMAIL_FROM` will be `noreply@vector.resend.dev`
- **OAuth**: Not in scope for this feature. The app uses email+password only. OAuth (e.g. Google Sign-In) may be added in a future iteration; when it is, OAuth users will be auto-verified and excluded from the password reset flow.
