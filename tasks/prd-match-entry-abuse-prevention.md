# PRD: Match Entry Abuse Prevention

## 1. Introduction / Overview

Any authenticated user can currently POST to `/api/matches` and submit match results that immediately affect ELO ratings. The rate limiter (30 matches per 60 seconds) provides no practical protection. A motivated bad actor can spam wins for themselves, fabricate losses for rivals, or exploit an undiscovered security hole — the `adminMode` flag in the request body is accepted from any user with no server-side role check, meaning any user can enter matches for arbitrary players by setting `adminMode: true`.

This feature introduces a layered defence: close the `adminMode` security hole, restrict non-admin match submission to participants only, apply a meaningful rate limit to non-admins, and add anomaly detection that flags suspicious submission patterns for admin review without blocking legitimate activity.

---

## 2. Goals

1. Close the `adminMode` privilege-escalation hole so only users with `role === 'admin'` can use it.
2. Ensure non-admin users can only submit matches they are a participant in.
3. Replace the ineffective 30/60s rate limit with a tiered limit: tight for regular users, unrestricted for admins.
4. Detect and flag unusual submission volume (>10 matches in a rolling 1-hour window) for admin review.
5. Notify admins by email when a flag is triggered.
6. Surface flagged matches in the admin panel so admins can void them if fraudulent.

---

## 3. User Stories

- **As a regular user**, I can submit match results only for matches I actually played in, so the system prevents me from fabricating matches for other players.
- **As an admin**, I can enter matches on behalf of any players (admin mode) without a rate limit, so I can efficiently log a full tournament day.
- **As an admin**, I receive an email notification when a user triggers the anomaly threshold, so I can review potentially fraudulent activity promptly.
- **As an admin**, I can see flagged matches in the admin panel and void them if they are fraudulent, so bad data does not permanently affect player ratings.
- **As any user**, legitimate match entry is never blocked by abuse controls, only unusual volumes are flagged.

---

## 4. Functional Requirements

### 4.1 — Fix `adminMode` Server-Side Role Check

1. In `POST /api/matches`, after loading the session, if `body.adminMode === true` the server **must** verify that `session.user.role === 'admin'`. If the role check fails, return `403 Forbidden` with `{ error: "Admin mode requires admin role" }`.
2. This check must happen before any player resolution logic.

### 4.2 — Participant Enforcement for Non-Admin Users

3. When a non-admin user submits a match (normal mode, `adminMode` absent or `false`), the session user is automatically assigned as team 1 player 1. This is already the case — no change needed to the assignment logic.
4. The existing "all four players must be distinct" guard already prevents a user from padding their own team. No additional participant check is needed for normal mode beyond confirming the session user is team1P1, which is already enforced.
5. *Note:* Non-admins cannot use admin mode (requirement 4.1), so they cannot enter matches for arbitrary players.

### 4.3 — Tiered Rate Limiting

6. Create two separate rate limiters in `lib/rate-limit.ts`:
   - **`matchEntryLimiterUser`**: sliding window of **20 matches per 60 minutes** — applied to non-admin users, keyed by `userId`.
   - **`matchEntryLimiterAdmin`**: no practical limit (or a very high ceiling, e.g., 500 per hour) — applied to admin users, keyed by `userId`.
7. In `proxy.ts`, replace the single `matchEntryLimiter` check with role-aware logic:
   - Read the role from the JWT token (`token?.role`).
   - Apply `matchEntryLimiterAdmin` if `role === 'admin'`, otherwise apply `matchEntryLimiterUser`.
8. Remove (or retain but no longer use) the old `matchEntryLimiter` export.
9. When a non-admin hits the limit, the proxy returns `429 Too Many Requests` with `Retry-After` header as before. No change to the response format.

### 4.4 — Anomaly Detection & Flagging

10. After a match is successfully created in `POST /api/matches`, check whether the submitting user has exceeded the anomaly threshold — **admin users are fully exempt from this check**:
    - Use Upstash Redis (already available via `lib/rate-limit.ts`'s Redis instance) to maintain a per-user sliding counter with a 1-hour window.
    - **Threshold**: if a non-admin user has submitted **more than 10 matches** within the past 60 minutes, the match is flagged.
    - Skip the anomaly check entirely when `session.user.role === 'admin'`.

11. When the threshold is exceeded, set `flaggedAt = now()` and `flagReason = "anomaly:high_volume"` on the newly created match record (see schema changes in §7).

12. The match is **accepted and counts toward ratings regardless of the flag**. The flag is a signal for admin review only — it does not block or defer the match.

13. After setting the flag, the system sends a notification email to all users with `role === 'admin'` (see §4.5).

14. A user triggers at most **one email per hour** per user being flagged. Subsequent flagged matches within the same hour increment the flag count but do not send additional emails (use a Redis key to track whether a notification has been sent recently for that user).

### 4.5 — Admin Email Notification

15. When a match is flagged (requirement 11), send an email to all admin users containing:
    - Subject: `[Vector] Suspicious match entry — @{handle}`
    - Body: The user's display name and handle, the number of matches they have submitted in the past hour, the match ID and date that triggered the flag, and a link to the admin flagged matches view (e.g., `/admin/matches?flagged=true`).
16. Use the existing email infrastructure (same transport/sender used for verification/invite emails).

### 4.6 — Admin Panel: Flagged Matches UI

17. In the admin matches list page, add a **"Flagged" badge** displaying the count of currently-flagged, non-voided matches. The badge should be prominently visible (e.g., in the page header or tab bar).
18. Add a **"Show flagged only" toggle/filter** to the matches list. When active, the list is filtered to `flaggedAt IS NOT NULL AND voidedAt IS NULL`.
19. Each flagged match row in the admin list should display a visual indicator (e.g., a red "Flagged" chip) and show the `flagReason`.
20. No new page is required — flagging surfaces within the existing matches admin UI.
21. Admins void fraudulent matches using the existing void functionality. No new "dismiss flag" action is required in this phase.

---

## 5. Non-Goals (Out of Scope)

- **Match confirmation flow** (both teams confirm before match counts) — not in this phase.
- **"Dismiss flag" without voiding** — admins handle false positives by doing nothing; the flag persists but causes no harm.
- **Per-match anomaly analysis** (e.g., detecting implausible score sequences) — out of scope.
- **Configurable thresholds via admin UI** — thresholds are hardcoded constants; no settings UI.
- **Retroactive flagging** of existing matches — only newly submitted matches are evaluated.
- **Push/in-app notifications** — email only in this phase.
- **Blocking flagged users** — flagging is advisory; no automatic account suspension.

---

## 6. Design Considerations

- The flagged matches filter should be easy to find but not alarming to admins on quiet days when the badge shows 0.
- The email body should give the admin enough context to act (user identity, match count, match link) without requiring them to log in just to understand the alert.
- The "Flagged" badge count should update in real-time or on page load — no live polling required.

---

## 7. Technical Considerations

### Schema Changes

Add two new optional fields to the `Match` model in `prisma/schema.prisma`:

```prisma
model Match {
  // ... existing fields ...
  flaggedAt   DateTime?   // set when anomaly threshold is exceeded
  flagReason  String?     // e.g. "anomaly:high_volume"
}
```

Run `npx prisma generate` after the schema change. Apply the migration via the Supabase SQL editor (not `prisma migrate deploy`):

```sql
ALTER TABLE "Match" ADD COLUMN "flaggedAt" TIMESTAMP;
ALTER TABLE "Match" ADD COLUMN "flagReason" TEXT;
```

### Rate Limiter Implementation

Use Upstash `Ratelimit.slidingWindow` (already in use). The anomaly counter can reuse the same Redis instance — implement it as a separate `Ratelimit` instance or a raw Redis `INCR`/`EXPIRE` counter to avoid conflating rate-limiting semantics with anomaly detection.

### Email Recipients

Query `prisma.user.findMany({ where: { role: 'admin' } })` at notification time to get all admin email addresses. This keeps the list current without hardcoding.

### Key Files to Modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `flaggedAt`, `flagReason` to `Match` |
| `lib/rate-limit.ts` | Replace `matchEntryLimiter` with `matchEntryLimiterUser` + `matchEntryLimiterAdmin`; add anomaly counter |
| `proxy.ts` | Apply role-aware rate limiter in match entry check |
| `app/api/matches/route.ts` | Add `adminMode` role check; add anomaly detection + flagging logic post-create |
| `app/admin/matches/page.tsx` (or equivalent) | Add flagged badge, flagged filter, flag indicator on rows |
| Email service (existing) | Add `sendFlagNotification` email template/function |

---

## 8. Success Metrics

- **Security hole closed**: no non-admin user can successfully use `adminMode: true` (verified by test or manual curl).
- **Rate limit effective**: a script submitting 25 matches in 1 hour as a regular user is blocked after the 20th.
- **Admins unrestricted**: an admin can submit 100+ matches in a session without hitting a 429.
- **Anomaly flagging**: the 11th match submitted within 1 hour by any user has `flaggedAt` set in the database.
- **Email delivery**: admin receives a notification email within ~1 minute of the anomaly threshold being crossed.
- **Admin UI**: flagged matches are visible and filterable in the admin panel within one page load after flagging.

---

## 9. Open Questions

_All questions resolved — no outstanding items._

| # | Question | Decision |
|---|---|---|
| 1 | Flagged badge count when a match is voided? | Badge shows only `flaggedAt IS NOT NULL AND voidedAt IS NULL` — voiding removes the match from the count. |
| 2 | Should admins be exempt from anomaly flagging? | Yes — admins are fully exempt. No flag, no email for admin-submitted matches. |
| 3 | Email recipients for flag notifications? | All users with `role === 'admin'` in the database, queried dynamically at send time. |
| 4 | Non-admin hard cap — 20/hour? | Confirmed. Anomaly flag fires at match 11; hard block fires at match 21. |
