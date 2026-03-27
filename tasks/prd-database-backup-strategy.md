# PRD: Database Backup Strategy

## 1. Introduction / Overview

Vector's match history, player profiles, and user accounts are irreplaceable data. If lost, they cannot be reconstructed. Currently, **no backup infrastructure exists** — there are no scheduled exports, no verified point-in-time recovery window, and no documented recovery procedure.

This feature establishes a 3-layer automated backup system before go-live:

1. **Supabase Pro PITR** — 7-day point-in-time recovery via Supabase's built-in system
2. **Nightly pg_dump → AWS S3** — full database export to independent cloud storage, automated via GitHub Actions
3. **Weekly JSON export → Supabase Storage** — lightweight human-readable export of all core tables via a Vercel cron job

The feature is considered **done** when: (a) backups run nightly with zero manual effort and alert on failure, AND (b) a full restore drill has been completed successfully.

---

## 2. Goals

- Ensure all match, player, and user data can be recovered after any failure scenario
- Achieve a Recovery Point Objective (RPO) of ≤ 24 hours
- Achieve a Recovery Time Objective (RTO) of < 2 hours
- Store off-site backups independently of Supabase infrastructure
- Alert the developer immediately when a backup fails
- Provide a documented restore procedure that can be followed under stress

---

## 3. User Stories

**As the app owner**, I want nightly database backups uploaded to AWS S3 so that I can recover all data even if Supabase has an outage or account issue.

**As the app owner**, I want an email alert if a backup fails so that I know immediately and can take manual action before the next day's backup.

**As the app owner**, I want a weekly JSON export of all match and player data so that I have a human-readable snapshot I can inspect without needing `psql`.

**As the app owner**, I want a written restore procedure so that I can recover the database under pressure without having to figure out the steps from scratch.

**As the app owner**, I want to have completed a restore drill before go-live so that I know the backups actually work — not just that they exist.

---

## 4. Functional Requirements

### 4.1 Pre-requisite (Manual — Supabase Dashboard)
1. The Supabase project **must be upgraded to Pro plan** ($25/mo) to enable 7-day point-in-time recovery (PITR) and daily snapshots. The Free plan has no backup capability.
2. After upgrading, verify that the Backups tab in Supabase Dashboard shows a 7-day PITR window.

### 4.2 Layer 2 — Nightly pg_dump to AWS S3 (GitHub Actions)
3. A GitHub Actions workflow file **must be created** at `.github/workflows/db-backup.yml`.
4. The workflow **must run automatically** every day at 04:00 UTC (1 hour after the nightly rating recompute at 03:00 UTC).
5. The workflow **must be triggerable manually** via the GitHub Actions UI (`workflow_dispatch`).
6. The workflow **must connect** to the Supabase direct connection (port 5432, not the pgBouncer pooler) using credentials stored as GitHub Secrets.
7. The workflow **must run `pg_dump`** with the following flags: `--format=plain --no-owner --no-acl`, producing a standard SQL file.
8. The output **must be compressed** with gzip before upload (`.sql.gz` format).
9. The compressed file **must be uploaded** to an AWS S3 bucket using the AWS CLI.
10. The filename **must include a timestamp** in the format `vector-backup-YYYYMMDD-HHMMSS.sql.gz`.
11. The S3 bucket **must have a lifecycle rule** that automatically deletes backup files older than 30 days.
12. If any step of the workflow fails, an **email alert must be sent** via the Resend API to the developer's email address.

### 4.3 AWS S3 Setup (Manual — AWS Console)
13. A private S3 bucket named `vector-db-backups` **must be created** in the `us-east-1` region (or any US region).
14. Versioning **must be enabled** on the bucket.
15. An IAM user **must be created** with a policy scoped to only `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, and `s3:DeleteObject` on that specific bucket.
16. The IAM access key and secret **must be stored as GitHub Secrets** (not committed to the repository).

### 4.4 GitHub Secrets Required
The following secrets must be added to the repository (Settings → Secrets and variables → Actions):

| Secret Name | Description |
|---|---|
| `DB_HOST` | Supabase direct host (from `DIRECT_URL` env var, port 5432) |
| `DB_USER` | Supabase database user (typically `postgres`) |
| `DB_PASSWORD` | Supabase database password |
| `DB_NAME` | Database name (typically `postgres`) |
| `AWS_ACCESS_KEY_ID` | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `BACKUP_BUCKET` | S3 bucket name (`vector-db-backups`) |
| `RESEND_API_KEY` | Same Resend key used in the app (for failure alerts) |
| `ALERT_EMAIL` | Developer's email address for failure notifications |

### 4.5 Layer 3 — Weekly JSON Export (Vercel Cron)
17. A new API route **must be created** at `app/api/cron/data-export/route.ts`.
18. The route **must be protected** with the same `CRON_SECRET` bearer token used by the existing recompute cron.
19. The route **must export** all rows from: `User`, `Player`, `Match`, `MatchParticipant`, and `Game` tables as a single JSON object.
20. The export **must be compressed** with gzip and uploaded to a Supabase Storage bucket named `exports`.
21. The filename **must include the date** in the format `export-YYYYMMDD.json.gz`.
22. The route **must delete** any export files older than 28 days from the `exports` bucket (keeping the last 4 weekly snapshots).
23. A new environment variable `SUPABASE_SERVICE_ROLE_KEY` **must be added** to Vercel production environment for the Storage upload to work.
24. `vercel.json` **must be updated** to add a second cron entry: `{ "path": "/api/cron/data-export", "schedule": "0 2 * * 0" }` (Sundays at 02:00 UTC).

---

## 5. Non-Goals (Out of Scope)

- **Real-time replication or read replicas** — not needed at current scale
- **Encrypted backups** — S3 server-side encryption (SSE-S3) is acceptable; custom encryption keys are not required
- **Database monitoring / query alerting** — out of scope for this feature
- **Automated restore** — restores are manual procedures; no automated failover is required
- **Multi-region redundancy** — a single S3 bucket in one region is sufficient
- **GDPR/data residency compliance** — no EU data residency requirement; US region storage is acceptable

---

## 6. Design Considerations

No UI changes are required. This feature is entirely infrastructure and backend.

**Files to create/modify:**

| File | Change |
|---|---|
| `.github/workflows/db-backup.yml` | Create — nightly pg_dump workflow |
| `app/api/cron/data-export/route.ts` | Create — weekly JSON export route |
| `vercel.json` | Add second cron entry for data-export |

---

## 7. Technical Considerations

- **Why GitHub Actions instead of Vercel cron for pg_dump:** Vercel serverless functions have a 60-second maximum execution time. A `pg_dump` on a growing database can exceed this. GitHub Actions runners have no such limit and come with `pg_dump` pre-installed on Ubuntu.
- **Use port 5432 (direct), not 6543 (pgBouncer):** `pg_dump` requires a direct PostgreSQL connection. The pgBouncer pooler (port 6543) is incompatible with `pg_dump`.
- **`DB_HOST` value:** Extract from the `DIRECT_URL` environment variable (not `DATABASE_URL`). The host part is the Supabase project URL, e.g., `db.xxxxxxxxxxxx.supabase.co`.
- **RatingSnapshot is recomputable:** The `RatingSnapshot` and `CommunityStats` tables do not need to be treated as irreplaceable — they can be fully rebuilt by running the admin recompute (`POST /api/admin/recompute`). However, they will be included in the pg_dump anyway.
- **Supabase Storage for Layer 3:** The `exports` bucket must be created manually in the Supabase Dashboard before the cron runs for the first time. Set it to private (not public).
- **SUPABASE_SERVICE_ROLE_KEY:** Found in Supabase Dashboard → Project Settings → API → `service_role` key. This key bypasses Row Level Security — treat it like a password and never expose it client-side.

---

## 8. Disaster Recovery Runbook

### Scenario A: Accidental data deletion (within 7 days)
1. Go to Supabase Dashboard → your project → Backups
2. Select "Point in Time Recovery"
3. Choose a timestamp before the incident occurred
4. Supabase will restore the database in-place

### Scenario B: Data loss older than 7 days, or Supabase account issue
1. Download the most recent backup from S3:
   ```bash
   aws s3 cp s3://vector-db-backups/backups/vector-backup-YYYYMMDD-HHMMSS.sql.gz .
   ```
2. Verify integrity: `gunzip -t vector-backup-YYYYMMDD-HHMMSS.sql.gz`
3. Provision a new PostgreSQL database (Supabase, Neon, or Railway)
4. Restore:
   ```bash
   gunzip < vector-backup-YYYYMMDD-HHMMSS.sql.gz | psql $NEW_DATABASE_URL
   ```
5. Update `DATABASE_URL` and `DIRECT_URL` in Vercel → Settings → Environment Variables
6. Redeploy on Vercel (no `prisma migrate` needed — schema is already applied)
7. Run `npx prisma generate` locally to regenerate the Prisma client if needed
8. Verify the app is working by loading the Command screen

### Scenario C: RatingSnapshot corruption (no restore needed)
1. Go to the admin panel
2. Run "Recompute Ratings" — this rebuilds all `RatingSnapshot` rows from `Match` + `Game` data

---

## 9. Success Metrics

This feature is considered **complete** when all of the following are true:

- [ ] Supabase project is on the Pro plan with PITR visible in the Dashboard
- [ ] `.github/workflows/db-backup.yml` exists and has run successfully at least once (manually triggered)
- [ ] A `.sql.gz` file is present in the S3 bucket `vector-db-backups/backups/`
- [ ] `gunzip -t` passes on the downloaded backup file
- [ ] A **full restore drill** has been completed: the backup was restored to a throwaway database and row counts were verified to match
- [ ] The failure alert email has been tested (e.g., by temporarily breaking the workflow and confirming the email arrives)
- [ ] `app/api/cron/data-export/route.ts` exists and has been triggered manually once
- [ ] A JSON export file is present in the Supabase Storage `exports/` bucket

---

## 10. Open Questions

- What is the Supabase project region? The S3 bucket region should ideally match to minimize latency during restores.
- Should the weekly JSON export include the `AuditEvent` and `InviteToken` tables as well? These are smaller tables but contain important audit and trust data.
- Should the GitHub Actions backup run be visible in a status badge on the README?
