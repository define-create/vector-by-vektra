# PRD: Deploy Vector by Vektra to Vercel

---

## 1. Introduction / Overview

Vector by Vektra is a Next.js 16 web application currently running locally. This task covers deploying it to production on Vercel using an existing Vercel account, so that real users can access it via a public URL.

The app connects to an existing Supabase Postgres database (same project used in development), uses NextAuth for authentication, and Prisma 7 with a `pg` adapter for database access. No new infrastructure is required — only Vercel project configuration and environment variable setup.

---

## 2. Goals

1. The app is accessible at a live public URL (`*.vercel.app`).
2. All existing features work in production exactly as they do locally.
3. The `main` branch is the production branch — every push to `main` triggers a Vercel deployment.
4. Secrets and credentials are stored securely in Vercel environment variables, never committed to the repo.
5. Email verification links are logged to the Vercel function logs (no Resend key set) — acceptable for initial launch.

---

## 3. User Stories

- **As a developer**, I want to push to `main` and have Vercel automatically build and deploy the app so I don't need to deploy manually.
- **As a user**, I want to open the Vercel URL in a mobile browser and use the app as if it were a native app.
- **As a developer**, I want the production app to connect to the existing Supabase database so all player and match data is immediately available.

---

## 4. Functional Requirements

### 4.1 Repository & Branch Setup

1. The GitHub repository must have a `main` branch that contains the production-ready code.
2. All work from `feature/vector-mvp` (and `publish/vercel`) must be merged into `main` before connecting to Vercel.
3. Vercel must be configured to deploy automatically on every push to `main`.

### 4.2 Vercel Project Setup

4. Create a new Vercel project linked to the GitHub repository using the Vercel dashboard (vercel.com → "Add New Project").
5. Vercel must detect the framework as **Next.js** automatically (no manual framework config needed).
6. The **Root Directory** in Vercel must be set to `vector-by-vektra/` (the subdirectory containing `package.json`), since the repo root is not the app root.
7. Build command: `npm run build` (default — Vercel auto-detects).
8. Output directory: `.next` (default — Vercel auto-detects).
9. Install command: `npm install` (default — this also runs `postinstall` → `prisma generate`).

### 4.3 Environment Variables

The following environment variables must be set in the Vercel project dashboard under **Settings → Environment Variables**, scoped to the **Production** environment:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL | Port 6543, `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase session pooler URL | Port 5432, same host |
| `NEXTAUTH_SECRET` | Long random string | Same value as local `.env.local` |
| `NEXTAUTH_URL` | `https://<your-project>.vercel.app` | Must match the Vercel deployment URL exactly |
| `RESEND_API_KEY` | *(leave unset)* | Email links will log to Vercel function logs instead |

> **Important:** `NEXTAUTH_URL` must be set to the exact URL Vercel assigns (e.g. `https://vector-by-vektra.vercel.app`). If unset, NextAuth callbacks will fail.

> **Important:** Do NOT set `RESEND_API_KEY` for this initial deployment. The app's fallback behavior logs the verification URL to the server log, which is acceptable for now.

### 4.4 Build Verification

10. After the first deployment, the Vercel build log must show 0 errors.
11. `prisma generate` must run successfully during the build (triggered by `postinstall`).
12. The deployed app must return HTTP 200 on the root path (`/`).

### 4.5 Runtime Verification

13. Navigating to `/sign-in` must load the sign-in page.
14. Registering a new user must succeed; the verification link must appear in Vercel function logs (Functions → Real-time Logs).
15. After email verification (via log URL), signing in must redirect to `/command`.
16. Entering a match via `/enter` must save to the Supabase database and show up in Recent Matches on `/command`.

---

## 5. Non-Goals

- Custom domain — use the auto-generated `*.vercel.app` URL for now.
- Separate production database — same Supabase project as development.
- Sending real emails — Resend integration is deferred; verification links are logged to console.
- CI/CD pipeline beyond Vercel's built-in GitHub integration.
- Preview deployments for feature branches (not configured for this initial launch).
- Vercel Analytics or Speed Insights.

---

## 6. Technical Considerations

### Prisma 7 + Vercel

- `prisma generate` runs automatically via `postinstall` during `npm install` on Vercel. The generated client is written to `app/generated/prisma/client/` within the project — this is correct and will be bundled into the deployment.
- `prisma.config.ts` calls `dotenv.config({ path: '.env.local', quiet: true })`. On Vercel, `.env.local` does not exist — `quiet: true` suppresses the error, and Vercel injects env vars directly into `process.env`. No change to this file is needed.

### Connection Pooling

- The `DATABASE_URL` must use Supabase's **transaction pooler** (port 6543, `?pgbouncer=true&connection_limit=1`). This is required for Vercel's serverless functions, which create a new process per request. The transaction pooler handles connection reuse efficiently.

### NEXTAUTH_URL

- This must be set to the **exact** Vercel deployment URL before the first real user tries to sign in. NextAuth uses it to construct callback URLs. If the URL contains a trailing slash or a typo, OAuth redirects and sign-in callbacks will fail with a "redirect_uri_mismatch" or 404 error.

### No Database Migration Needed

- The existing Supabase database schema is already up to date. No `prisma migrate` or SQL execution is required for this deployment.

---

## 7. Success Metrics

- The app loads at the Vercel URL with no errors.
- A new user can register, verify their email (via log URL), sign in, and enter a match end-to-end.
- Vercel build completes with 0 errors and 0 TypeScript errors.
- The Supabase dashboard shows new records created from production requests.

---

## 8. Open Questions

- What should the Vercel project be named? (Determines the auto-generated URL, e.g. `vector-by-vektra.vercel.app`)
- Is the GitHub repository already connected to the Vercel account, or does it need to be linked for the first time?
