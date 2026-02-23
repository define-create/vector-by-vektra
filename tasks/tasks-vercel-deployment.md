## Relevant Files

- `vector-by-vektra/next.config.ts` - Next.js config; review for any settings that could affect production build.
- `vector-by-vektra/middleware.ts` - Auth middleware protecting all routes; must work correctly on Vercel Edge.
- `vector-by-vektra/prisma.config.ts` - Prisma config; loads `.env.local` locally — on Vercel this file silently no-ops and Vercel env vars take over.
- `vector-by-vektra/package.json` - Contains `postinstall: prisma generate` — runs automatically during Vercel build.
- `vector-by-vektra/.env.local` - Local-only secrets (DO NOT commit); values must be manually copied to Vercel environment variables.
- `vector-by-vektra/tasks/prd-vercel-deployment.md` - PRD reference for this deployment.

### Notes

- This task list is primarily infrastructure/configuration steps — most steps are done in the Vercel dashboard and GitHub, not in code files.
- No database migration is required — the Supabase schema is already up to date.
- `NEXTAUTH_URL` must exactly match the Vercel-assigned URL — no trailing slash.
- After the first successful deployment, mark all tasks complete and update `MEMORY.md` task status to `8.0 ✅`.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just the parent.

---

## Tasks

- [x] 0.0 Prepare main branch for production
  - [x] 0.1 On your current working branch (`publish/vercel` or `feature/vector-mvp`), run `npx tsc --noEmit` and confirm 0 TypeScript errors.
  - [x] 0.2 Run `npx jest` and confirm all 54 tests pass.
  - [x] 0.3 Commit any uncommitted changes: `git add -p` then `git commit -m "..."`.
  - [x] 0.4 Switch to `main`: `git checkout main`.
  - [x] 0.5 Merge the work branch into main: `git merge feature/vector-mvp` (resolve any conflicts if they arise).
  - [x] 0.6 Push main to GitHub: `git push origin main`.

- [x] 1.0 Create and configure Vercel project
  - [x] 1.1 Go to [vercel.com](https://vercel.com) → click **Add New Project**.
  - [x] 1.2 Select **Import Git Repository** → find and select this GitHub repository.
  - [x] 1.3 In the **Configure Project** screen, set **Root Directory** to `vector-by-vektra/` (click "Edit" next to Root Directory and type the path). This is required because the repo root is not the app root.
  - [x] 1.4 Confirm Vercel auto-detects the framework as **Next.js**. Build command and output directory should be left at defaults.
  - [x] 1.5 Choose a project name (this determines the URL: `https://<name>.vercel.app`). Note the name down — you need it for `NEXTAUTH_URL` in the next task.
  - [x] 1.6 **Do NOT click Deploy yet** — proceed to Task 2.0 to set environment variables first.

- [x] 2.0 Set environment variables in Vercel
  - [x] 2.1 In the Vercel Configure Project screen (or after creation: **Settings → Environment Variables**), add `DATABASE_URL` — copy the Supabase **transaction pooler** URL from your local `.env.local` (port 6543, ends in `?pgbouncer=true&connection_limit=1`). Set scope: **Production**.
  - [x] 2.2 Add `DIRECT_URL` — copy the Supabase **session pooler** URL from `.env.local` (port 5432). Set scope: **Production**.
  - [x] 2.3 Add `NEXTAUTH_SECRET` — copy the value from your local `.env.local`. Set scope: **Production**.
  - [x] 2.4 Add `NEXTAUTH_URL` — set to `https://<name>.vercel.app` using the project name you chose in step 1.5. No trailing slash. Set scope: **Production**.
  - [x] 2.5 Add `CRON_SECRET` — generate a random secret string (e.g. `openssl rand -base64 32` in a terminal). This is required for the nightly recompute cron job in `vercel.json` to authenticate against `/api/admin/recompute`. Set scope: **Production**.
  - [x] 2.6 Confirm `RESEND_API_KEY` is **not** added — leave it absent. Email verification links will appear in Vercel function logs instead.
  - [x] 2.7 Double-check all five variables are saved and scoped to Production before proceeding.

- [x] 3.0 Verify first deployment build
  - [x] 3.1 Click **Deploy** in Vercel to trigger the first build, or it may auto-trigger when you linked `main`.
  - [x] 3.2 Open the build log and watch for the `prisma generate` step (runs during `npm install` → `postinstall`). Confirm it completes without errors.
  - [x] 3.3 Confirm the full build completes with **0 errors** and the deployment status shows **Ready**.
  - [x] 3.4 Open the deployed URL (`https://<name>.vercel.app`) in a browser — confirm it loads (redirects to `/sign-in` since you're not logged in).

- [x] 4.0 Verify production runtime end-to-end
  - [x] 4.1 Navigate to `https://<name>.vercel.app/sign-in` — confirm the sign-in page renders correctly.
  - [x] 4.2 Navigate to `/register` — register a new test user account.
  - [x] 4.3 Open Vercel dashboard → your project → **Functions** tab → **Logs** (Real-time). Find the log line containing the email verification URL (it will look like `[verify-email] Verification URL: https://...`).
  - [x] 4.4 Copy and open the verification URL in a browser — confirm the account is verified and you are redirected to `/sign-in` or `/command`.
  - [x] 4.5 Sign in with the test user credentials — confirm you are redirected to `/command` and the dashboard loads.
  - [x] 4.6 Navigate to `/enter` and submit a test match — confirm the success screen appears and the match shows up in Recent Matches on `/command`.
  - [x] 4.7 Open the Supabase dashboard → **Table Editor** → `Match` table — confirm the new match record appears with a non-midnight `matchDate` timestamp.
  - [x] 4.8 Navigate to `/admin` — confirm it redirects to `/sign-in` (or `/command`) since the test user is not an admin. This verifies the middleware is protecting admin routes.
