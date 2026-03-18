## Relevant Files

- `lib/services/command.ts` - Wrap `getCommandData` (line 64) with `unstable_cache`.
- `lib/services/tournament.ts` - Wrap `getTournamentData` (line 201) with `unstable_cache`.
- `app/api/cron/recompute/route.ts` - Add `revalidateTag("command")` after recompute (created in background-recompute tasks). If that task isn't done yet, use `app/api/admin/recompute/route.ts` as a temporary fallback.
- `app/api/matches/route.ts` - Add `revalidateTag("tournament")` when a tagged match is saved (tag is set at line 214).
- `app/api/command/route.ts` - Calls `getCommandData(session.user.id)` at line 17; no changes needed but verify it still works after wrapping.
- `app/api/admin/tournament/route.ts` - Calls `getTournamentData(tag)` at line 13; no changes needed but verify it still works.

### Notes

- `unstable_cache` only activates in **production builds** (`npm run build && npm start`). In `npm run dev`, caching is bypassed — always verify cache behavior with a production build.
- `revalidateTag` can only be called from Route Handlers or Server Actions, not from plain utility functions. All invalidation calls must stay inside route files.
- `getCommandData` takes a `filter?` optional second argument. The cache key must include both `userId` and `filter` to avoid serving the wrong user's data or wrong filter results.
- `unstable_cache` caches per unique combination of arguments — each `userId` gets its own cache entry automatically.
- The `revalidatePath("/command")` call that currently exists in `app/api/matches/route.ts` (line 264) can be replaced by `revalidateTag("command")` once caching is in place, or left alongside it.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after the parent task.

## Tasks

- [ ] 1.0 Cache the dashboard query in command.ts
  - [ ] 1.1 Open `lib/services/command.ts`. Add `unstable_cache` to the import from `"next/cache"` at the top of the file (or add a new import line if `"next/cache"` isn't imported yet).
  - [ ] 1.2 Change the function declaration from:
    ```typescript
    export async function getCommandData(userId: string, filter?: CommandFilter): Promise<CommandData> {
    ```
    to a `const` wrapped with `unstable_cache`:
    ```typescript
    export const getCommandData = unstable_cache(
      async (userId: string, filter?: CommandFilter): Promise<CommandData> => {
    ```
  - [ ] 1.3 Close the `unstable_cache` wrapper after the function body's closing `}`. Add the cache key array and options as the second and third arguments:
    ```typescript
      },
      ["command-data"],
      {
        tags: ["command"],
        revalidate: 300, // 5-minute fallback in case cron-triggered invalidation misses
      }
    );
    ```
  - [ ] 1.4 Run `npx tsc --noEmit` to confirm no TypeScript errors. The callers (`app/api/command/route.ts` line 17) do not need to change since the function signature is identical.

- [ ] 2.0 Invalidate command cache after recompute
  - [ ] 2.1 Open `app/api/cron/recompute/route.ts` (created in the background-recompute task). Add `revalidateTag` to the import from `"next/cache"`:
    ```typescript
    import { revalidatePath, revalidateTag } from "next/cache";
    ```
  - [ ] 2.2 After `await runRecompute("nightly")` succeeds, add `revalidateTag("command")` before the existing `revalidatePath("/command")` call (or replace `revalidatePath` with `revalidateTag` — both work, but `revalidateTag` is more targeted):
    ```typescript
    await runRecompute("nightly");
    revalidateTag("command");       // invalidates all users' cached command data
    revalidatePath("/command");     // optional: also invalidates Next.js page cache
    ```
  - [ ] 2.3 If the background-recompute task hasn't been completed yet, apply the same `revalidateTag("command")` call to `app/api/admin/recompute/route.ts` instead (after the `await runRecompute(runType, body.notes)` call succeeds, around line 83).
  - [ ] 2.4 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [ ] 3.0 Cache the tournament leaderboard in tournament.ts
  - [ ] 3.1 Open `lib/services/tournament.ts`. Add `unstable_cache` to the imports at the top of the file:
    ```typescript
    import { unstable_cache } from "next/cache";
    ```
  - [ ] 3.2 Find `getTournamentData` at line 201. Change the function declaration from:
    ```typescript
    export async function getTournamentData(tag: string): Promise<TournamentData> {
    ```
    to:
    ```typescript
    export const getTournamentData = unstable_cache(
      async (tag: string): Promise<TournamentData> => {
    ```
  - [ ] 3.3 Close the `unstable_cache` wrapper after the function body's closing `}`:
    ```typescript
      },
      ["tournament-data"],
      {
        tags: ["tournament"],
        revalidate: 60, // 60-second fallback
      }
    );
    ```
  - [ ] 3.4 Run `npx tsc --noEmit` to confirm no TypeScript errors. The caller (`app/api/admin/tournament/route.ts` line 13) does not need to change.

- [ ] 4.0 Invalidate tournament cache when a tagged match is saved
  - [ ] 4.1 Open `app/api/matches/route.ts`. Add `revalidateTag` to the existing `"next/cache"` import at line 2:
    ```typescript
    import { revalidatePath, revalidateTag } from "next/cache";
    ```
  - [ ] 4.2 Find where the `tag` variable is used in the transaction (line 222 — saved to the match). After the transaction completes and the match is created, add a conditional invalidation based on whether the match had a tag:
    ```typescript
    // After the transaction block, before the recompute try/catch:
    if (tag) {
      revalidateTag("tournament");
    }
    ```
  - [ ] 4.3 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [ ] 5.0 Verify caching behavior end-to-end
  - [ ] 5.1 Build the app in production mode: `npm run build && npm start`. Do NOT use `npm run dev` — caching is disabled in dev mode.
  - [ ] 5.2 Open the Command screen in the browser. Load it twice in quick succession and check the Vercel function logs (or local terminal output) — the second load should NOT trigger a new DB query (cache hit).
  - [ ] 5.3 Submit a test match, wait for the cron to run (or manually trigger `POST /api/admin/recompute`), then reload the Command screen — it should reflect updated ratings (cache was invalidated by `revalidateTag("command")`).
  - [ ] 5.4 Open a tournament leaderboard. Load it twice — the second load should serve from cache (no new DB call).
  - [ ] 5.5 Submit a match with a `tag` field matching the tournament. Reload the leaderboard — it should show the new match (cache was invalidated by `revalidateTag("tournament")`).
  - [ ] 5.6 Verify no stale data is shown beyond the configured `revalidate` fallback window (300s for command, 60s for tournament) by waiting for the fallback period and confirming data auto-refreshes.
