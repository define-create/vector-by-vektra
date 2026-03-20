# PRD: Performance — Database Indexes & Connection Pooling

## 1. Introduction / Overview

As Vector grows, two foundational infrastructure issues will degrade response times for all users simultaneously: missing database indexes cause full table scans on every query, and a single pgbouncer connection means concurrent requests queue behind each other.

This is a low-risk, zero-downtime change that should be implemented first because it improves every other query in the system without any code changes.

---

## 2. Goals

- Eliminate full table scans on the most frequently queried tables
- Allow multiple concurrent users to execute DB queries in parallel instead of serially
- Reduce average dashboard load time by 40–60% at current user counts
- Set a solid foundation before tackling query-level optimizations

---

## 3. User Stories

- **As a user**, when I open the app during a tournament evening (many concurrent users), the dashboard loads in under 1 second instead of timing out.
- **As a user**, submitting a match does not slow down while another user is also submitting a match at the same time.
- **As an admin**, player search returns results quickly even as the player count grows into the thousands.

---

## 4. Functional Requirements

### 4.1 Database Indexes

Add the following indexes to `prisma/schema.prisma`. After editing the schema, run `npx prisma generate` and then apply the migration via the Supabase SQL editor (pgBouncer is incompatible with DDL migrations run through Prisma directly).

**MatchParticipant**
- `@@index([playerId])` — used on every dashboard load, stats query, and match history fetch

**Match**
- `@@index([voidedAt, matchDate])` — all "active matches" queries filter on `voidedAt: null` and order by `matchDate`
- `@@index([tag, voidedAt])` — tournament leaderboard queries filter by tag

**RatingSnapshot**
- `@@index([playerId, matchId])` — critical for CI/Drift calculations and rating history

**Player**
- `@@index([displayName, deletedAt])` — player search uses case-insensitive name matching (`contains` → ILIKE in Postgres)

**RatingRun**
- `@@index([status, startedAt])` — recompute concurrency check scans all runs to find active ones

**Files to modify:**
- `prisma/schema.prisma` — add `@@index(...)` entries to the relevant models

**Migration SQL to run in Supabase SQL editor:**
```sql
CREATE INDEX IF NOT EXISTS idx_match_participant_player_id ON "MatchParticipant"("playerId");
CREATE INDEX IF NOT EXISTS idx_match_voided_date ON "Match"("voidedAt", "matchDate");
CREATE INDEX IF NOT EXISTS idx_match_tag_voided ON "Match"("tag", "voidedAt");
CREATE INDEX IF NOT EXISTS idx_rating_snapshot_player_match ON "RatingSnapshot"("playerId", "matchId");
CREATE INDEX IF NOT EXISTS idx_player_display_deleted ON "Player"("displayName", "deletedAt");
CREATE INDEX IF NOT EXISTS idx_rating_run_status_started ON "RatingRun"("status", "startedAt");
```

### 4.2 pgbouncer Connection Limit

Increase `connection_limit` from `1` to `10` in the Supabase database connection string.

**Where to change:** Supabase project settings → Database → Connection string (Transaction mode / pgBouncer URL). Update the `connection_limit` parameter in the connection URL stored in the environment variable (likely `DATABASE_URL` in `.env`).

**Why 10:** Supabase Free/Pro plans support 60 connections by default. Reserving 10 for the app leaves headroom for other tools (Prisma Studio, migrations, admin). Do not exceed 20 without checking the Supabase plan limits.

**Files to modify:**
- `.env` / `.env.local` — update `DATABASE_URL` parameter
- Vercel project environment variables — update `DATABASE_URL` in production

---

## 5. Non-Goals (Out of Scope)

- Query rewrites or consolidation (covered in a separate PRD)
- Caching layer (covered in a separate PRD)
- Background recompute (covered in a separate PRD)
- Changing the database provider or ORM

---

## 6. Technical Considerations

- **Index creation is safe and non-blocking** in Postgres when using `CREATE INDEX IF NOT EXISTS` (Postgres 9.2+). Supabase runs Postgres 15.
- **pgBouncer incompatibility reminder**: Do NOT run `npx prisma migrate deploy` for these index changes — pgBouncer in transaction mode does not support DDL. Run the raw SQL directly in the Supabase SQL editor.
- After updating `schema.prisma` with `@@index(...)` entries, run `npx prisma generate` so Prisma's client is aware of them (even though they don't affect client behavior, keeping schema in sync avoids drift).
- The `connection_limit` increase requires no code changes — just an environment variable update.

---

## 7. Success Metrics

- Dashboard load time (P95) drops by ≥ 40% at current user count (measure via Vercel Analytics or browser DevTools Network tab before/after)
- Player search returns results in < 200ms
- No query plan shows "Seq Scan" on `MatchParticipant`, `Match`, or `RatingSnapshot` for the common filter combinations (verify via `EXPLAIN ANALYZE` in Supabase SQL editor)
- Zero timeout errors during concurrent match submission on tournament nights

---

## 8. Open Questions

- What is the current Supabase plan? (Free = 60 max connections, Pro = more) — this determines the safe upper bound for `connection_limit`.
- Are there other services or scripts connecting to the DB that count against the connection pool? (e.g., cron jobs, admin scripts)
