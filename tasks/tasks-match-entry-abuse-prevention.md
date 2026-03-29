## Relevant Files

- `prisma/schema.prisma` - Add `flaggedAt` and `flagReason` fields to the `Match` model.
- `lib/rate-limit.ts` - Replace `matchEntryLimiter` with tiered `matchEntryLimiterUser` and `matchEntryLimiterAdmin`; add `matchAnomalyCounter` export.
- `proxy.ts` - Apply role-aware rate limiter for match entry (read JWT role, choose limiter accordingly).
- `app/api/matches/route.ts` - Add `adminMode` role check; post-create anomaly detection and flagging logic; trigger flag notification email.
- `lib/email.ts` - Add `sendFlagNotification` function for admin alert emails.
- `app/api/admin/matches/route.ts` - Add `?flagged=true` filter support; include `flaggedAt`/`flagReason` in response; add `flaggedCount` in pagination metadata.
- `app/admin/matches/page.tsx` - Add flagged badge, flagged-only filter toggle, and flag indicator chip on match rows.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- After editing `prisma/schema.prisma`, always run `npx prisma generate`. Apply the DB migration via the Supabase SQL editor — do NOT use `prisma migrate deploy`.
- The anomaly counter uses the same Upstash Redis instance already configured in `lib/rate-limit.ts`. Use a raw `INCR` + `EXPIRE` approach (or a separate `Ratelimit` instance) to keep it distinct from the hard rate-limit logic.
- A user can trigger at most one flag notification email per hour. Use a Redis key (e.g., `flag-notif:{userId}`) with a 1-hour TTL to gate email sends.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/match-entry-abuse-prevention`

- [x] 1.0 Schema: add `flaggedAt` and `flagReason` to `Match`
  - [x] 1.1 In `prisma/schema.prisma`, add two optional fields to the `Match` model: `flaggedAt DateTime?` and `flagReason String?`
  - [x] 1.2 Run `npx prisma generate` to regenerate the Prisma client
  - [x] 1.3 Apply the migration in the Supabase SQL editor:
        ```sql
        ALTER TABLE "Match" ADD COLUMN "flaggedAt" TIMESTAMP;
        ALTER TABLE "Match" ADD COLUMN "flagReason" TEXT;
        ```

- [x] 2.0 Rate limiting: replace single limiter with tiered user/admin limiters
  - [x] 2.1 In `lib/rate-limit.ts`, add `matchEntryLimiterUser`: `Ratelimit.slidingWindow(20, "60 m")`, keyed by `userId`
  - [x] 2.2 In `lib/rate-limit.ts`, add `matchEntryLimiterAdmin`: `Ratelimit.slidingWindow(500, "60 m")`, keyed by `userId` (effectively unrestricted)
  - [x] 2.3 In `lib/rate-limit.ts`, add `matchAnomalyCounter`: a raw Upstash Redis counter (using `INCR` + `EXPIRE`) or a separate `Ratelimit` instance tracking submissions per user per 60-minute window — this is used for anomaly detection only, not for blocking
  - [x] 2.4 Remove (or deprecate) the old `matchEntryLimiter` export from `lib/rate-limit.ts`
  - [x] 2.5 In `proxy.ts`, update the match entry rate-limit block (`pathname === "/api/matches" && method === "POST"`):
        - Read the role from the JWT token: `token?.role`
        - If `role === "admin"`, apply `matchEntryLimiterAdmin`; otherwise apply `matchEntryLimiterUser`
        - Keep the same 429 / `Retry-After` response format

- [x] 3.0 API: fix `adminMode` role check and add anomaly detection + flagging
  - [x] 3.1 In `app/api/matches/route.ts`, immediately after loading the session and before any body parsing or player resolution, add: if `body.adminMode === true` and `session.user.role !== 'admin'`, return `403 { error: "Admin mode requires admin role" }`
  - [x] 3.2 Confirm the role is available on the session object (check `lib/auth.ts` / `types/next-auth.d.ts` — it should already be there since the proxy uses `token.role`); if not, expose it in the session callbacks
  - [x] 3.3 After the match is successfully created (after the `prisma.$transaction` call), add anomaly detection — skip entirely if `session.user.role === 'admin'`:
        - Increment the per-user Redis counter for the current 1-hour window using `matchAnomalyCounter`
        - If the counter value is **greater than 10**, proceed to flag the match (step 3.4)
        - If 10 or under, no action needed
  - [x] 3.4 When the threshold is exceeded, update the newly created match record:
        ```ts
        await prisma.match.update({
          where: { id: match.id },
          data: { flaggedAt: new Date(), flagReason: "anomaly:high_volume" },
        });
        ```
  - [x] 3.5 After flagging the match, check a Redis key `flag-notif:{userId}` — if it does NOT exist (no notification sent in the past hour), call `sendFlagNotification(...)` (step 4) and then set the key with a 3600-second TTL
  - [x] 3.6 Wrap the anomaly detection + flagging block in a try/catch so that any Redis or email failure does not cause the match creation response to fail — log errors but return the created match normally

- [x] 4.0 Email: add flag notification function
  - [x] 4.1 In `lib/email.ts`, add a new exported function `sendFlagNotification` with the following signature:
        ```ts
        export async function sendFlagNotification(params: {
          flaggedUserHandle: string;
          flaggedUserDisplayName: string;
          matchId: string;
          matchDate: Date;
          matchCountInWindow: number;
          adminEmails: string[];
        }): Promise<void>
        ```
  - [x] 4.2 Inside `sendFlagNotification`, follow the same pattern as other functions in `lib/email.ts`: dev fallback logs to console if `RESEND_API_KEY` is absent, production throws if missing
  - [x] 4.3 Send the email to all addresses in `adminEmails` (send one email per admin, or use `bcc` if Resend supports it):
        - Subject: `[Vector] Suspicious match entry — @{flaggedUserHandle}`
        - Body: display name, handle, number of matches in the past hour, the triggering match ID and date, and a link to `/admin/matches?flagged=true`
  - [x] 4.4 In `app/api/matches/route.ts` (step 3.5), before calling `sendFlagNotification`, query all admin emails:
        ```ts
        const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
        ```
        Pass `admins.map(a => a.email)` to `sendFlagNotification`

- [x] 5.0 Admin UI: surface flagged matches
  - [x] 5.1 In `app/api/admin/matches/route.ts`, add support for `?flagged=true` query param — when present, add `flaggedAt: { not: null }, voidedAt: null` to the Prisma `where` clause for both `findMany` and `count`
  - [x] 5.2 In the same route, include `flaggedAt` and `flagReason` in the match response payload (add to the `.map()` output)
  - [x] 5.3 In the same route, add a `flaggedCount` field to the `pagination` response object: a separate `prisma.match.count({ where: { flaggedAt: { not: null }, voidedAt: null } })` query (runs regardless of the `?flagged` filter so the badge always has a value)
  - [x] 5.4 In `app/admin/matches/page.tsx`, extend the `AdminMatch` type to include `flaggedAt: string | null` and `flagReason: string | null`
  - [x] 5.5 In `app/admin/matches/page.tsx`, add `flaggedCount` to the state (populated from `data.pagination.flaggedCount`) and display a **"Flagged" badge** in the page header next to the title — show the count; hide the badge (or show it greyed out) when count is 0
  - [x] 5.6 Add a `showFlagged` boolean state and a toggle button (e.g., "Show flagged only") near the search input — when toggled on, append `&flagged=true` to the API fetch URL and reset to page 1
  - [x] 5.7 In the matches table, add a "Flag" column header and render a red **"Flagged"** chip (similar styling to the existing "Voided" chip) on rows where `flaggedAt` is not null, showing the `flagReason` as a tooltip or small sub-label
  - [x] 5.8 Pass `flagged` param through the `fetchMatches` function — ensure the filter state is included in the `URLSearchParams` on each fetch
