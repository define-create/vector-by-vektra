## Relevant Files

- `app/api/matches/route.ts` - Remove synchronous `runRecompute()` call and related `ratingUpdated` logic from the POST handler.
- `app/api/cron/recompute/route.ts` - New file. GET handler for Vercel Cron that runs recompute and revalidates the cache.
- `app/api/admin/recompute/route.ts` - Existing admin-triggered recompute (POST). No changes needed — admin manual trigger remains intact.
- `vercel.json` - Replace the existing (broken) daily cron entry with one pointing to the new `/api/cron/recompute` route at a 5-minute schedule.
- `.env.local` - Add `CRON_SECRET` for local development testing.

### Notes

- **The existing cron is broken:** `vercel.json` points to `/api/admin/recompute` which is a POST handler, but Vercel Cron sends GET requests. The existing daily cron has never worked. This task fixes it properly.
- **Auth header format:** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. The new route must check this header (not `x-cron-secret` as the admin route does).
- **Admin manual recompute is untouched:** The `/api/admin/recompute` POST route and admin UI button remain unchanged.
- **Vercel plan check:** Vercel Hobby supports cron at most once per day; Pro supports up to once per minute. Confirm the plan before setting `*/5 * * * *`.
- The `ratingUpdated` field returned by `POST /api/matches` will always be `false` after this change (recompute no longer runs inline). Update or remove it from the response if it causes confusion on the client.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after the parent task.

## Tasks

- [x] 1.0 Remove synchronous recompute from match submission
  - [x] 1.1 Open `app/api/matches/route.ts`. Find the `try` block after the transaction (around line 258–267) that calls `await runRecompute("nightly")` and `revalidatePath("/command")`.
  - [x] 1.2 Delete the entire `try/catch` block for recompute, the `let ratingUpdated = false;` declaration, and `ratingUpdated = true;` inside it.
  - [x] 1.3 Remove `ratingUpdated` from the JSON response object (or set it to a static `false` with a comment explaining ratings update via cron).
  - [x] 1.4 Remove the unused `runRecompute` import from the top of the file (leave `revalidatePath` only if it's used elsewhere in the file; otherwise remove it too).
  - [x] 1.5 Verify the file compiles without TypeScript errors: `npx tsc --noEmit`.

- [x] 2.0 Create the cron-triggered recompute API route
  - [x] 2.1 Create the directory `app/api/cron/recompute/` if it doesn't exist.
  - [x] 2.2 Create `app/api/cron/recompute/route.ts` with the following content:
    ```typescript
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
  - [x] 2.3 Verify the file compiles without TypeScript errors: `npx tsc --noEmit`.

- [x] 3.0 Update vercel.json to use the new cron route
  - [x] 3.1 Open `vercel.json`. Replace the existing cron entry (which incorrectly points to `/api/admin/recompute`) with the new `/api/cron/recompute` path.
  - [x] 3.2 Vercel Hobby plan confirmed — using `"schedule": "0 3 * * *"` (daily at 3am).

- [x] 4.0 Configure CRON_SECRET environment variable
  - [x] 4.1 Generate a secure random secret: run `openssl rand -hex 32` in a terminal. Copy the output.
  - [x] 4.2 Add `CRON_SECRET=<generated-value>` to `.env.local` for local development.
  - [x] 4.3 Add `CRON_SECRET` to Vercel project settings → Environment Variables (Production and Preview environments).

- [x] 5.0 Deploy and verify
  - [x] 5.1 Deploy to Vercel (push to the main branch or trigger a manual deployment).
  - [x] 5.2 In Vercel dashboard → Project → Cron Jobs, confirm the new cron entry at `/api/cron/recompute` is listed with the correct schedule.
  - [x] 5.3 Manually trigger the cron route to verify it works: in Vercel dashboard → Cron Jobs, click "Run Now" (or send a GET request with the correct `Authorization: Bearer <CRON_SECRET>` header using curl or Postman).
  - [x] 5.4 Confirm the cron response is `{ "ok": true, "completedAt": "..." }` with status 200.
  - [x] 5.5 Submit a test match in the app and confirm the response comes back immediately (< 1 second) without waiting for recompute.
  - [x] 5.6 Wait for the next cron cycle and confirm the test match's updated rating appears on the Command screen.
