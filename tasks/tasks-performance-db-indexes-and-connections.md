## Relevant Files

- `prisma/schema.prisma` - Add `@@index(...)` entries to MatchParticipant, Match, RatingSnapshot, Player, and RatingRun models.

### Notes

- Do NOT run `npx prisma migrate deploy` through pgBouncer — it will fail. Apply index SQL directly in the Supabase SQL editor.
- After editing `schema.prisma`, always run `npx prisma generate` to keep the Prisma client in sync.
- The `connection_limit` change is environment variable only — no code changes required.
- Verify query plans with `EXPLAIN ANALYZE` in the Supabase SQL editor before and after.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after the parent task.

## Tasks

- [x] 1.0 Add database indexes to schema.prisma
  - [x] 1.1 Open `prisma/schema.prisma` and locate the `MatchParticipant` model. Add `@@index([playerId])` at the bottom of the model (before the closing `}`).
  - [x] 1.2 Locate the `Match` model. Add `@@index([voidedAt, matchDate])` and `@@index([tag, voidedAt])` at the bottom of the model.
  - [x] 1.3 Locate the `RatingSnapshot` model. Add `@@index([playerId, matchId])` at the bottom of the model.
  - [x] 1.4 Locate the `Player` model. Add `@@index([displayName, deletedAt])` at the bottom of the model.
  - [x] 1.5 Locate the `RatingRun` model. Add `@@index([status, startedAt])` at the bottom of the model.
  - [x] 1.6 Run `npx prisma generate` to sync the Prisma client with the updated schema. Confirm it completes without errors.

- [x] 2.0 Apply indexes to the database via Supabase SQL editor
  - [x] 2.1 Open the Supabase dashboard → SQL Editor for this project.
  - [x] 2.2 Run the following SQL (safe to run — `IF NOT EXISTS` prevents errors if any index already exists):
    ```sql
    CREATE INDEX IF NOT EXISTS idx_match_participant_player_id ON "MatchParticipant"("playerId");
    CREATE INDEX IF NOT EXISTS idx_match_voided_date ON "Match"("voidedAt", "matchDate");
    CREATE INDEX IF NOT EXISTS idx_match_tag_voided ON "Match"("tag", "voidedAt");
    CREATE INDEX IF NOT EXISTS idx_rating_snapshot_player_match ON "RatingSnapshot"("playerId", "matchId");
    CREATE INDEX IF NOT EXISTS idx_player_display_deleted ON "Player"("displayName", "deletedAt");
    CREATE INDEX IF NOT EXISTS idx_rating_run_status_started ON "RatingRun"("status", "startedAt");
    ```
  - [x] 2.3 Confirm all 6 `CREATE INDEX` statements succeeded (no errors in the SQL editor output).

- [x] 3.0 Increase pgBouncer connection_limit in environment variables
  - [x] 3.1 Open `.env.local` and find the `DATABASE_URL` value. It will contain a query parameter like `connection_limit=1`. Change it to `connection_limit=10`.
  - [x] 3.2 Log in to the Vercel dashboard → Project → Settings → Environment Variables. Find `DATABASE_URL` and apply the same change (`connection_limit=1` → `connection_limit=10`) for Production (and Preview if set).
  - [x] 3.3 Redeploy the Vercel project (or trigger a new deployment) for the environment variable change to take effect in production.

- [x] 4.0 Verify indexes are active and queries use them
  - [x] 4.1 In the Supabase SQL editor, run `EXPLAIN ANALYZE` on the most common dashboard query pattern to confirm it uses an index scan instead of a sequential scan:
    ```sql
    EXPLAIN ANALYZE
    SELECT * FROM "MatchParticipant" WHERE "playerId" = '<any-valid-player-id>';
    ```
    The output should show `Index Scan` on `idx_match_participant_player_id`, not `Seq Scan`.
  - [x] 4.2 Run the same check for the Match table:
    ```sql
    EXPLAIN ANALYZE
    SELECT * FROM "Match" WHERE "voidedAt" IS NULL ORDER BY "matchDate" DESC LIMIT 20;
    ```
    Should show `Index Scan` on `idx_match_voided_date`.
  - [x] 4.3 Load the app dashboard in the browser and measure the API response time for `/api/command` before and after (use browser DevTools → Network tab). Target: ≥ 40% reduction in response time.
