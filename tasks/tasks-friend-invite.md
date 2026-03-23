## Relevant Files

- `prisma/schema.prisma` - Add `InviteToken` model; add `send_invite`, `claim_via_invite` to `AuditActionType` enum; add `invitesSent` and `invitesClaimed` back-relation fields to `User` model
- `middleware.ts` - Add `/invite` and `/api/invite` to PUBLIC_PREFIXES
- `lib/email.ts` - Add `sendInviteEmail` and `sendInviteClaimedEmail` functions
- `lib/services/players.ts` - Extract or verify claim logic is in a shared service function (reused by claim-via-invite)
- `app/api/invite/route.ts` - **NEW** POST, authenticated — creates invite token, optionally sends email
- `app/api/invite/[token]/route.ts` - **NEW** GET, public — returns shadow player data + invite status + recent matches
- `app/api/invite/[token]/claim/route.ts` - **NEW** POST, authenticated — claims shadow profile via invite token
- `app/invite/[token]/page.tsx` - **NEW** Public invite landing page (server component, Option B design)
- `components/players/InviteButton.tsx` - **NEW** Client component — copy-link + optional email invite sheet
- `components/command/ClaimProfilePrompt.tsx` - Add `<InviteButton>` to unclaimed shadow search results
- `app/register/page.tsx` - Read `inviteToken` query param on mount and store in localStorage
- `app/sign-in/page.tsx` - Extract post-login redirect to `redirectAfterSignIn(router)` that checks localStorage

### Notes

- **Design spec**: `mockups/friend-invite-option-b.html` — use this as the visual reference for all UI. Key elements: inviter avatar with initials + "Played N matches with you" context leads; stats card with win-streak dots (W/L squares); match tiles (card style, not plain rows) for history; "Played together" badge on in-app player cards; invite sheet with "method cards" for copy-link and email; `✦ Invite [FirstName]` button label.
- **No `prisma migrate deploy`** — apply DB migration via Supabase SQL editor. pgBouncer is incompatible with `prisma migrate deploy`.
- **Always run `npx prisma generate`** after any `schema.prisma` change. Forgetting this causes silent `PrismaClientValidationError` at runtime.
- **Named Prisma relations** — `InviteToken` has two relations to `User`. Use `@relation("InvitesSent", ...)` and `@relation("InvitesClaimed", ...)`. Add `invitesSent InviteToken[]` and `invitesClaimed InviteToken[]` to the `User` model.
- **Claim logic reuse** — `POST /api/invite/[token]/claim` must NOT duplicate claim logic from `POST /api/players/[id]/claim`. Check `lib/services/players.ts` first; extract to a shared function if needed.
- **localStorage bridge key**: `pendingInviteToken`
- **Token pattern** — `crypto.randomBytes(32).toString("hex")` raw; `crypto.createHash("sha256").update(rawToken).digest("hex")` stored hash. Follow `app/api/auth/register/route.ts`.
- **Email dev fallback** — follow existing pattern in `lib/email.ts`: if `RESEND_API_KEY` is not set, log to console instead of sending.
- No unit tests required — verify manually in browser.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/friend-invite`

- [x] 1.0 Database schema — Add `InviteToken` model
  - [x] 1.1 Open `prisma/schema.prisma` and add the `InviteToken` model (fields: `id`, `tokenHash`, `playerId`, `invitedByUserId`, `invitedEmail`, `expiresAt`, `claimedAt`, `claimedByUserId`, `createdAt`, plus `player`, `invitedBy`, `claimedBy` relations with named relation strings)
  - [x] 1.2 Add `invitesSent InviteToken[] @relation("InvitesSent")` and `invitesClaimed InviteToken[] @relation("InvitesClaimed")` to the `User` model in `prisma/schema.prisma`
  - [x] 1.3 Add `send_invite` and `claim_via_invite` to the `AuditActionType` enum in `prisma/schema.prisma`
  - [x] 1.4 Run `npx prisma generate` to regenerate the Prisma client
  - [x] 1.5 Derive and apply the SQL migration via Supabase SQL editor: `CREATE TABLE "InviteToken" (...)` and `ALTER TYPE "AuditActionType" ADD VALUE 'send_invite'; ALTER TYPE "AuditActionType" ADD VALUE 'claim_via_invite';`

- [x] 2.0 Email functions — Add invite emails to `lib/email.ts`
  - [x] 2.1 Open `lib/email.ts` and read the existing `sendVerificationEmail` function to understand the Resend pattern and dev fallback
  - [x] 2.2 Add `sendInviteEmail(recipientEmail: string, inviterName: string, shadowPlayerName: string, matchCount: number, inviteUrl: string)`: subject `"[InviterName] wants you to see your pickleball stats"`, body includes shadow player name, match count, and CTA button linking to `inviteUrl`. Use dev console fallback if no `RESEND_API_KEY`.
  - [x] 2.3 Add `sendInviteClaimedEmail(inviterEmail: string, inviterName: string, claimedPlayerName: string)`: subject `"Good news — [PlayerName] joined Vector!"`, body: `"[PlayerName] claimed their profile. You can now see their updated stats and predict your next matchup."`. Use dev console fallback if no `RESEND_API_KEY`.

- [x] 3.0 Invite creation API — `POST /api/invite` (authenticated)
  - [x] 3.1 Create `app/api/invite/route.ts`
  - [x] 3.2 Authenticate the request using the existing session pattern; return 401 if no session
  - [x] 3.3 Parse and validate `{ playerId: string, email?: string }` from the request body; return 400 if `playerId` is missing
  - [x] 3.4 Look up the target player by `playerId`; verify it is a shadow profile (`userId === null` and `claimed === false`); return 400 `{ error: "This player has already claimed their profile." }` if already claimed
  - [x] 3.5 Verify the current user has played with the shadow player: query `MatchParticipant` to confirm the inviter's `playerId` and the shadow's `playerId` share at least one `matchId`; return 403 `{ error: "You must have played with this player to invite them." }` if not
  - [x] 3.6 Generate a raw token: `crypto.randomBytes(32).toString("hex")`; compute its SHA-256 hash
  - [x] 3.7 Create an `InviteToken` record with `tokenHash`, `playerId`, `invitedByUserId`, `invitedEmail` (optional), and `expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)`
  - [x] 3.8 If `email` is provided in the request body, call `sendInviteEmail` with the recipient email, inviter's display name, shadow player's display name, match count, and invite URL
  - [x] 3.9 Return `{ token: rawToken, url: "/invite/<rawToken>" }`

- [x] 4.0 Public invite data API — `GET /api/invite/[token]` (public)
  - [x] 4.1 Create `app/api/invite/[token]/route.ts`
  - [x] 4.2 Hash the incoming `token` param with SHA-256 and look up the `InviteToken` record including `player` and `invitedBy` (with their linked `player` for display name)
  - [x] 4.3 If not found, return `404 { error: "Invalid invite link." }`
  - [x] 4.4 Determine `status`: `"claimed"` if `claimedAt` is set, `"expired"` if `expiresAt < now`, otherwise `"active"`
  - [x] 4.5 Fetch the 3 most recent matches for the shadow player: join `MatchParticipant` → `Match`, order by `Match.playedAt DESC`, limit 3. For each match include: `date`, `result` ("W" or "L" relative to the shadow's team), `score` string (e.g. "21–17, 18–21, 11–8"), `partnerName`, and `opponentNames` (both opponents as display name strings)
  - [x] 4.6 Return: `{ status, inviterName, player: { displayName, matchCount, rating, winPct }, recentMatches }`. For `status = "claimed"` or `"expired"`, still return player name and status. Exclude `createdByUserId` and all internal IDs.

- [x] 5.0 Claim via invite API — `POST /api/invite/[token]/claim` (authenticated)
  - [x] 5.1 Create `app/api/invite/[token]/claim/route.ts`
  - [x] 5.2 Authenticate the request; return 401 if no session
  - [x] 5.3 Hash the `token` param and look up the `InviteToken` record
  - [x] 5.4 Validate: token exists, not expired (`expiresAt > now`), not already claimed (`claimedAt === null`), shadow player still unclaimed (`player.userId === null && player.claimed === false`). Return appropriate 400/404/409 errors if any check fails.
  - [x] 5.5 Check that the current authenticated user does not already have a claimed player profile; return 409 `{ error: "You already have a profile linked to your account." }` if so
  - [x] 5.6 Open `lib/services/players.ts` and read the existing claim logic (used by `POST /api/players/[id]/claim`). If claim logic is not already in a shared function, extract it to `claimPlayerForUser(playerId: string, userId: string, prisma)` — then update `POST /api/players/[id]/claim` to call this function
  - [x] 5.7 Call the shared claim function to link the shadow player to the current user (`userId`, `claimed = true`, `claimedAt = now`, `trustTier = "verified_email"`)
  - [x] 5.8 Update the `InviteToken` record: set `claimedAt = now()` and `claimedByUserId = session.user.id`
  - [x] 5.9 Write an audit event with `actionType: "claim_via_invite"`
  - [x] 5.10 Fetch the inviter's email from the `invitedBy` user record and call `sendInviteClaimedEmail` to notify them
  - [x] 5.11 Call `revalidateTag` to bust the command screen cache (follow the pattern used in `POST /api/players/[id]/claim`)
  - [x] 5.12 Return `200 { ok: true }`

- [x] 6.0 Middleware — expose public invite routes
  - [x] 6.1 Open `middleware.ts` and read the existing `PUBLIC_PREFIXES` array
  - [x] 6.2 Add `"/invite"` and `"/api/invite"` to `PUBLIC_PREFIXES`

- [x] 7.0 Invite landing page — `app/invite/[token]/page.tsx`
  - [x] 7.1 Create `app/invite/[token]/page.tsx` as a server component; it must be accessible without authentication
  - [x] 7.2 Call `GET /api/invite/[token]` (or query DB directly via Prisma) to fetch invite data; derive `status`, `inviterName`, `player`, and `recentMatches`
  - [x] 7.3 For `status = "active"`: render the full landing page using the Option B design from `mockups/friend-invite-option-b.html`
  - [x] 7.4 For `status = "claimed"`: show `"This profile has already been claimed."` with a link to `/register`
  - [x] 7.5 For `status = "expired"`: show `"This invite link has expired. Ask [InviterName] to send a new one."`
  - [x] 7.6 For token not found (404 from API): show `"Invalid invite link."` with a link to `/register`
  - [x] 7.7 If the page detects an authenticated session AND `status = "active"` AND the shadow is still unclaimed AND the current user has no existing claimed player: render the one-click claim UI
  - [x] 7.8 If authenticated user already has a claimed player profile: show "You already have a profile" message

- [x] 8.0 Invite button + sheet — `InviteButton` component + wire into `ClaimProfilePrompt`
  - [x] 8.1 Create `components/players/InviteButton.tsx` as a client component (`"use client"`)
  - [x] 8.2 Accept props: `playerId: string`, `playerName: string`, `playerFirstName: string`
  - [x] 8.3 Render the invite trigger button styled per Option B
  - [x] 8.4 On click: open a bottom sheet with the title `"Invite [playerName]"`
  - [x] 8.5 Sheet layout with Copy invite link card and Send by email card
  - [x] 8.6 Show loading/error states
  - [x] 8.7 Include a `"Cancel"` dismiss link at the bottom of the sheet
  - [x] 8.8 Open `components/command/ClaimProfilePrompt.tsx` and read the existing player search result card structure
  - [x] 8.9 Import `InviteButton` and add it to each unclaimed shadow player card. Add `"Played together"` badge to eligible cards.

- [x] 9.0 Registration-to-claim bridge — localStorage + post-login redirect
  - [x] 9.1 Open `app/register/page.tsx` and read the existing registration flow
  - [x] 9.2 On component mount, read the `inviteToken` query parameter; store in localStorage and show invite detected banner
  - [x] 9.3 Open `app/sign-in/page.tsx` and read the existing post-login redirect logic
  - [x] 9.4 On the sign-in page, check for `inviteToken` query param and store in localStorage
  - [x] 9.5 Extract the post-login redirect logic into a `redirectAfterSignIn(router)` utility function
  - [x] 9.6 Update the sign-in page to call `redirectAfterSignIn(router)` after successful authentication
  - [x] 9.7 In the invite landing page's one-click claim handler: after claim returns `{ ok: true }`, clear localStorage and redirect to `/command`
