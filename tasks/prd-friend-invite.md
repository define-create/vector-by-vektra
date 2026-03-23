# PRD: Invite a Friend to Claim Their Profile

## 1. Introduction / Overview

When a match is entered in Vector, **shadow profiles** are automatically created for any player whose name is typed in. These shadow profiles accumulate real match history and a real rating — but the actual person has no idea they exist in the app.

This feature gives any registered player a way to **invite** a shadow player to join Vector and claim their stats. The invited person receives a link, sees their actual match history on a landing page, registers, and claims their shadow profile in one guided step.

**Problem it solves:** Today, profile claiming is entirely self-serve. A new user must independently discover the app, register, navigate to `/setup`, and search for their own name — with no indication that their stats are already there. This feature replaces that cold-start with a warm, personal invitation: "I played with you last week — your stats are already here."

**Goal:** Reduce the friction for new user registration by giving existing players a direct, social path to bring their regular opponents and partners into the app.

---

## 2. Goals

1. Any registered player who has played a match *with* a shadow player can generate an invite link for that shadow.
2. The invite link leads to a public landing page showing the shadow's real match history — creating an immediate "wow" moment for the recipient.
3. The entire flow from receiving an invite to claiming a profile requires no manual name-searching.
4. The inviter is notified by email when their invite is claimed.

---

## 3. User Stories

- **As a registered player**, after entering a match, I can send an invite link to my opponent so they can join Vector and see their stats, without needing to know their email address.
- **As a registered player**, I can optionally enter the recipient's email address to deliver the invite directly to their inbox, rather than copying and pasting a link.
- **As an invited recipient (new user)**, I open the invite link and immediately see my own match history, rating, and win rate — even before I create an account.
- **As an invited recipient**, I create an account and claim my profile in a single guided flow, without having to manually search for my name.
- **As an inviter**, I receive an email notification when the person I invited claims their profile.

---

## 4. Functional Requirements

### 4.1 Invite Eligibility
1. Only registered users who have played **in at least one match** with the target shadow player may create an invite. "Played with" means the inviter's `Player` record and the shadow's `Player` record both appear as `MatchParticipant` rows on the same `Match` record.
2. The eligibility check must be performed server-side on `POST /api/invite`. If the inviter has not played with the shadow, return `403 { error: "You must have played with this player to invite them." }`.

### 4.2 Invite Creation (API)
3. `POST /api/invite` must be an authenticated endpoint.
4. Request body: `{ playerId: string, email?: string }` where `playerId` is the shadow player's ID.
5. The endpoint must verify the target player is a shadow (unclaimed: `userId === null` and `claimed === false`). If already claimed, return `400 { error: "This player has already claimed their profile." }`.
6. It must generate a 32-byte random token (raw), store its SHA-256 hash in the database.
7. It must create an `InviteToken` record with `expiresAt = now + 30 days`.
8. If `email` is provided, it must send an invite email via Resend (see 4.10).
9. It must return `{ token: rawToken, url: "/invite/<rawToken>" }`.
10. Multiple invite tokens for the same shadow player are allowed — they are all valid until the first claim, which renders the shadow unclaim-able.

### 4.3 Invite Token Data Model
11. A new `InviteToken` model must be added to `prisma/schema.prisma`:
    ```prisma
    model InviteToken {
      id              String    @id @default(cuid())
      tokenHash       String    @unique
      playerId        String
      invitedByUserId String
      invitedEmail    String?
      expiresAt       DateTime
      claimedAt       DateTime?
      claimedByUserId String?
      createdAt       DateTime  @default(now())

      player     Player  @relation(fields: [playerId], references: [id])
      invitedBy  User    @relation("InvitesSent",    fields: [invitedByUserId], references: [id])
      claimedBy  User?   @relation("InvitesClaimed", fields: [claimedByUserId], references: [id])
    }
    ```
12. The `AuditActionType` enum must have two new values added: `send_invite` and `claim_via_invite`.
13. After schema changes, `npx prisma generate` must be run.
14. Migrations must be applied via the Supabase SQL editor (`CREATE TABLE` for `InviteToken`; `ALTER TYPE` for the enum additions).

### 4.4 Invite Button UI (in-app)
15. An **"Invite"** button must be added to each unclaimed shadow player card that appears in the `ClaimProfilePrompt` search results (the existing "Already played here?" flow).
16. The Invite button must only appear for shadow players that the current user has played with (eligibility check can be done client-side using the existing search results data, which includes match participation info, OR by attempting `POST /api/invite` and handling the `403`).
17. Tapping the Invite button must open a bottom sheet or modal titled `"Invite [PlayerName] to join Vector"` containing:
    - A **"Copy invite link"** button (primary CTA). On tap: calls `POST /api/invite`, copies the returned URL to clipboard, shows a confirmation "Link copied!".
    - An optional **email input field** with a "Send by email" button. On tap: calls `POST /api/invite` with the email address, shows confirmation "Invite sent!".

### 4.5 Public Invite Data (API)
18. `GET /api/invite/[token]` must be a public endpoint (no authentication required).
19. It must look up the `InviteToken` by SHA-256 hash of the token.
20. It must return:
    - `inviterName`: the `displayName` of the `invitedBy` user's player (NOT their email).
    - `player`: `{ displayName, matchCount, rating, winPct }` from the shadow `Player` record.
    - `recentMatches`: the 3 most recent matches the shadow player participated in, each including: `date` (ISO string), `result` ("W" or "L"), `score` (e.g., "21–17, 18–21, 11–8"), `partnerName` and `opponentNames` as display name strings.
    - `status`: one of `"active"` | `"claimed"` | `"expired"`.
21. If the token is not found, return `404`.
22. If `status` is `"claimed"` or `"expired"`, still return the player name and status so the page can display a helpful message.

### 4.6 Invite Landing Page (`/invite/[token]`)
23. The page at `/invite/[token]` must be accessible without authentication.
24. It must call `GET /api/invite/[token]` and render the following for `status = "active"`:
    - Headline: `"[InviterName] invited you to claim your pickleball stats"`
    - Subheadline: `"Your stats are already here."`
    - Player summary block: shadow player's display name, match count, current rating, win percentage.
    - Recent matches section: 3 most recent matches showing date, W/L result, score string, and partner/opponent names.
    - Primary CTA button: **"Create account to claim your stats"** — links to `/register?inviteToken=[rawToken]`.
    - Secondary link: **"Already have an account? Sign in"** — links to `/sign-in?inviteToken=[rawToken]`.
25. For `status = "claimed"`: show `"This profile has already been claimed."` with a link to `/register`.
26. For `status = "expired"`: show `"This invite link has expired. Ask [InviterName] to send a new one."`.
27. For token not found: show `"Invalid invite link."`.

### 4.7 Registration-to-Claim Bridge
The invite token must survive the full registration flow: open invite page → register → verify email → sign in → claim. This is implemented using `localStorage`.

28. When the user clicks "Create account" on the invite landing page, the link goes to `/register?inviteToken=[rawToken]`.
29. The `/register` page must read the `inviteToken` query parameter on mount and store it in `localStorage` under the key `pendingInviteToken`.
30. After the user signs in (on the `/sign-in` page), the post-login redirect logic must check `localStorage` for `pendingInviteToken`. If present, redirect to `/invite/[pendingInviteToken]` instead of the default `/command`.
31. When the `/invite/[token]` page detects an authenticated session AND the shadow is still unclaimed, it must show a **one-click claim UI**: `"Claim [PlayerName]'s profile — this is you"` with a single "Claim Profile" button.
32. On claim: call `POST /api/invite/[token]/claim` (see 4.8). On success, clear `pendingInviteToken` from `localStorage` and redirect to `/command`.
33. The same `localStorage` check must apply when a user with the `inviteToken` query param signs in directly via `/sign-in?inviteToken=[rawToken]` — store it in localStorage before the sign-in form submits, so the post-login redirect picks it up.

### 4.8 Claim via Invite (API)
34. `POST /api/invite/[token]/claim` must be an authenticated endpoint.
35. It must look up the `InviteToken` by token hash and validate: not expired, not already claimed, shadow player still unclaimed.
36. It must call the existing claim logic — equivalent to `POST /api/players/[id]/claim` — to link the shadow player to the current user's account (`userId`, `claimed = true`, `claimedAt`, `trustTier = "verified_email"`).
37. It must update the `InviteToken` record: set `claimedAt = now()` and `claimedByUserId = session.user.id`.
38. It must write an audit event with `actionType: "claim_via_invite"`.
39. It must call `sendInviteClaimedEmail` (see 4.10) to notify the inviter.
40. It must call `revalidateTag("command", "default")` to bust the command screen cache.
41. Return `200 { ok: true }` on success.

### 4.9 Middleware
42. `/invite` and `/api/invite` must be added to `PUBLIC_PREFIXES` in `middleware.ts`.

### 4.10 Email Functions
43. Add `sendInviteEmail(recipientEmail: string, inviterName: string, shadowPlayerName: string, inviteUrl: string)` to `lib/email.ts`. Email content: subject `"[InviterName] wants you to see your pickleball stats"`, body with shadow player name, match count teaser, and a CTA button linking to the invite URL.
44. Add `sendInviteClaimedEmail(inviterEmail: string, claimedPlayerName: string)` to `lib/email.ts`. Email content: subject `"Good news — [PlayerName] joined Vector!"`, body: `"[PlayerName] claimed their profile. You can now see their updated stats and predict your next matchup."`.
45. Both functions must follow the existing Resend pattern in `lib/email.ts` (`sendVerificationEmail` as reference). In development (no `RESEND_API_KEY`), log the email to console instead of sending.

### 4.11 Edge Cases
46. If the shadow player is already claimed when an invite link is opened, display the "already claimed" state (requirement 25).
47. If the authenticated user already has a claimed player profile and opens an invite link, display: `"You already have a profile ([YourPlayerName]). If you think this invite is for you, contact your group admin."` — do not show the claim CTA.
48. Multiple users may create invite tokens for the same shadow. All tokens remain valid. The first user to claim wins; subsequent claimer attempts return a `409` from the claim endpoint.

---

## 5. Non-Goals (Out of Scope)

- Admin-initiated invites (admin can already force-link via `/api/admin/players/[id]/link`).
- Inviting users to create a fresh profile (invites are only for existing unclaimed shadow players).
- In-app notifications (a notification dot, banner, or inbox). Email only for v1.
- Invite analytics dashboard (view counts, conversion rates).
- Invite link revocation by the sender.
- Bulk invite (inviting multiple shadows at once).
- Social proof on the landing page (e.g., showing how many players are already on Vector).

---

## 6. Design Considerations

**Invite landing page (`/invite/[token]`):**
```
┌──────────────────────────────────────┐
│ ● Vector                             │
│                                      │
│ Ali Taha invited you to claim        │
│ your pickleball stats                │
│                                      │
│ Your stats are already here.         │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Sam Taylor                       │ │
│ │ 14 matches · 1,043 rating        │ │
│ │ 58% win rate                     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Recent matches                       │
│  W  vs Jordan/Chris  21-17, 18-21... │
│  L  vs Ali/Taylor    15-21, 19-21    │
│  W  vs Mike/Sam      21-15, 21-18    │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │  Create account to claim →       │ │
│ └──────────────────────────────────┘ │
│  Already have an account? Sign in   │
└──────────────────────────────────────┘
```

**Invite button placement** — appears in `ClaimProfilePrompt` search results alongside the existing "This is me" button:
```
┌─────────────────────────────────────┐
│ Sam Taylor                          │
│ 14 matches · 1,043 rating           │
│                                     │
│ [This is me]      [Invite]          │
└─────────────────────────────────────┘
```

**Style:** Match the dark zinc app palette. W/L results use the app's existing `text-emerald-400` (win) and `text-rose-400` (loss) colors. CTA button uses `bg-zinc-100 text-zinc-900` (same as the "Save Changes" button pattern used elsewhere).

---

## 7. Technical Considerations

- **Token generation**: Follow the same pattern as `app/api/auth/register/route.ts` — `crypto.randomBytes(32).toString("hex")` for the raw token; `crypto.createHash("sha256").update(rawToken).digest("hex")` for the stored `tokenHash`.
- **Prisma named relations**: The `InviteToken` model has two relations to `User` (`invitedBy` and `claimedBy`). Prisma requires named relations when a model has multiple relations to the same target. Use `@relation("InvitesSent", ...)` and `@relation("InvitesClaimed", ...)` as specified in the schema above — and add the corresponding `invitesSent InviteToken[]` and `invitesClaimed InviteToken[]` fields to the `User` model.
- **`localStorage` bridge**: The `pendingInviteToken` key in `localStorage` is the mechanism that carries the invite token through the registration → email verification → sign-in flow. The sign-in page at `app/sign-in/page.tsx` currently redirects to `/command` on successful login. This must be changed to check `localStorage.getItem("pendingInviteToken")` first. Extract this redirect logic into a reusable `redirectAfterSignIn(router)` function.
- **Claim logic reuse**: `POST /api/invite/[token]/claim` should NOT duplicate the claim logic. It should import and call the same underlying service function used by `POST /api/players/[id]/claim`. If that logic isn't already extracted to a service function in `lib/services/`, extract it first.
- **Public route access**: `middleware.ts` has a `PUBLIC_PREFIXES` array. Review the file before editing and add `/invite` and `/api/invite`.
- **Email in development**: The Resend integration already has a dev fallback in `lib/email.ts` — if `RESEND_API_KEY` is not set, it logs to console. New email functions must follow this same pattern.
- **`npx prisma generate`**: Must be run after any `schema.prisma` changes. See project memory — forgetting this causes silent runtime errors.

---

## 8. Success Metrics

- Invite-to-registration conversion rate ≥ 30% (of users who open an invite link, at least 30% create an account).
- Invite-to-claim conversion rate ≥ 80% (of users who register via an invite link, at least 80% complete the claim).
- Inviter notification emails successfully sent on claim (verify via Resend dashboard or console logs).

---

## 9. Open Questions

None — all design decisions were finalized during the planning session.

---

## Relevant Files

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `InviteToken` model; add `send_invite`, `claim_via_invite` to `AuditActionType` enum; add named relation fields to `User` model |
| `middleware.ts` | Add `/invite` and `/api/invite` to PUBLIC_PREFIXES |
| `lib/email.ts` | Add `sendInviteEmail` and `sendInviteClaimedEmail` |
| `app/api/invite/route.ts` | **NEW** — POST, authenticated, creates invite token |
| `app/api/invite/[token]/route.ts` | **NEW** — GET, public, returns shadow player data + invite status |
| `app/api/invite/[token]/claim/route.ts` | **NEW** — POST, authenticated, claims shadow via invite token |
| `app/invite/[token]/page.tsx` | **NEW** — public invite landing page |
| `components/players/InviteButton.tsx` | **NEW** — copy-link + optional email invite sheet |
| `components/command/ClaimProfilePrompt.tsx` | Add `<InviteButton>` to unclaimed shadow search results |
| `app/sign-in/page.tsx` | Extract post-login redirect to `redirectAfterSignIn(router)` that checks `localStorage` |
| `app/register/page.tsx` | Read `inviteToken` query param on mount and store in `localStorage` |
| `lib/services/players.ts` | Extract claim logic to a shared service function (if not already) |
