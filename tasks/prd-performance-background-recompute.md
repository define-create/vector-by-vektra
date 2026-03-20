# PRD: Performance — Background ELO Recompute via Vercel Cron

## 1. Introduction / Overview

Currently, every time a user submits a match, the app immediately runs a full ELO replay — fetching every non-voided match ever played and recalculating all ratings from scratch. This runs synchronously, blocking the HTTP response and — because pgBouncer uses a single connection — blocking every other user's request for the duration.

This PRD covers decoupling match submission from recompute: matches are saved instantly, and the ELO recompute runs as a background job on a schedule via Vercel Cron.

---

## 2. Goals

- Match submission (`POST /api/matches`) completes in < 300ms regardless of total match count
- Recompute never blocks concurrent users
- Ratings are recalculated on a regular schedule (acceptable lag: a few minutes)
- No new paid infrastructure required (Vercel Cron is included on all Vercel plans)

---

## 3. User Stories

- **As a user**, when I submit a match result during a tournament, the app confirms it immediately — I don't wait 5+ seconds for ratings to recalculate.
- **As a user**, I see my updated rating reflected on the dashboard within a few minutes of submitting a match.
- **As an admin**, I can still trigger a manual recompute from the admin panel when needed (e.g., after voiding a match).

---

## 4. Functional Requirements

### 4.1 Remove Synchronous Recompute from Match Submission

**File:** `app/api/matches/route.ts`

Remove the `await runRecompute("nightly")` call and the `revalidatePath("/command")` that follows it from the `POST` handler. The match is saved; ratings will be updated on the next cron run.

The response should return immediately after the match and its participants/games are saved to the database.

### 4.2 Create a Cron-Triggered Recompute API Route

**New file:** `app/api/cron/recompute/route.ts`

This route:
1. Verifies the request is from Vercel Cron by checking the `Authorization` header: `Bearer ${process.env.CRON_SECRET}`. Return `401` if the header is missing or wrong.
2. Calls `runRecompute("nightly")` (the existing function in `lib/services/recompute.ts` — no changes to the recompute logic itself).
3. After recompute completes, calls `revalidatePath("/command")` to invalidate the Next.js cache so users see fresh data.
4. Returns `{ ok: true, completedAt: new Date().toISOString() }`.

```typescript
// app/api/cron/recompute/route.ts
import { NextResponse } from "next/server";
import { runRecompute } from "@/lib/services/recompute";
import { revalidatePath } from "next/cache";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await runRecompute("nightly");
  revalidatePath("/command");

  return NextResponse.json({ ok: true, completedAt: new Date().toISOString() });
}
```

### 4.3 Register the Cron Job in vercel.json

**File:** `vercel.json` (create if it does not exist)

Add a cron entry to run the recompute every 5 minutes:

```json
{
  "crons": [
    {
      "path": "/api/cron/recompute",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

The `*/5 * * * *` schedule runs every 5 minutes. Adjust to `*/2 * * * *` for 2-minute intervals or `* * * * *` for every minute if faster rating refresh is needed. Vercel's free Hobby plan supports cron jobs running at most once per day; Pro plan supports up to once per minute — confirm the plan before setting the interval.

### 4.4 Add CRON_SECRET Environment Variable

**Where to add:**
- `.env` / `.env.local` for local development: `CRON_SECRET=<any random string>`
- Vercel project settings → Environment Variables → `CRON_SECRET` for production

Generate a secure random value: `openssl rand -hex 32`

### 4.5 Admin Manual Recompute (Preserve Existing Functionality)

The admin panel currently has a "Recompute" button. This calls the existing recompute API directly. This should remain unchanged — admins can still trigger an immediate recompute after voiding a match or correcting data. No changes needed to admin recompute UI or its API route.

### 4.6 Snapshot Optimization (Bonus — Reduce Recompute Duration)

**File:** `lib/services/recompute.ts`

The current recompute deletes all `RatingSnapshot` rows and re-inserts them from scratch on every run. This can be replaced with an upsert:

```typescript
// Instead of: deleteMany + createMany
await prisma.ratingSnapshot.createMany({
  data: snapshots.map((s) => ({ ... })),
  skipDuplicates: true, // or use upsert per record
});
```

Full replacement of this optimization is optional for this PRD — the primary goal is decoupling recompute from match submission. The snapshot optimization reduces the cron job's DB write load and is a good follow-up.

---

## 5. Non-Goals (Out of Scope)

- Real-time rating updates (push to client via WebSocket/SSE) — polling on page load is sufficient
- Incremental ELO recalculation (only computing the new match's impact rather than full replay) — a larger architectural change for a future PRD
- Queue-based job processing (Bull, Inngest, etc.) — Vercel Cron is sufficient at current scale
- Parallelizing player updates within a single recompute run

---

## 6. Technical Considerations

- **Vercel Cron invokes the route as a standard HTTP GET request** with the `Authorization: Bearer <CRON_SECRET>` header. The route must be a `GET` handler (not `POST`).
- **Vercel Hobby plan** only allows cron jobs with daily frequency. If the app is on Hobby, the minimum viable approach is to keep manual admin recompute and remove blocking from match submission — ratings will only update when an admin triggers recompute. Upgrade to Pro for automated scheduling.
- **Recompute duration**: At 1K matches, recompute takes ~2–5 seconds. At 10K matches, possibly 20–60 seconds. Vercel functions have a 60s timeout on Pro. If recompute grows beyond that, the snapshot optimization (4.6) and incremental recalculation become necessary.
- **Race condition**: If two cron invocations overlap (unlikely with 5-minute intervals but possible if recompute is slow), the existing `RatingRun` concurrency check in `recompute.ts` already prevents double-runs. No additional protection needed.

---

## 7. Success Metrics

- `POST /api/matches` response time < 300ms (P95), independent of total match count
- Zero user-visible "waiting" after match submission
- Ratings reflect the latest match within ≤ 5 minutes (or whatever cron interval is set)
- Cron job succeeds without error in Vercel deployment logs

---

## 8. Open Questions

- Is the app on Vercel Hobby or Pro plan? This determines minimum cron frequency.
- Is a 5-minute rating refresh lag acceptable to users, or is something faster needed?
- Should the match submission response include a message like "Ratings will update shortly" to set expectations?
