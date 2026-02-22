## Relevant Files

### Infrastructure & Configuration
- `prisma/schema.prisma` — Full database schema: all tables plus PRD delta additions (claimedAt, trustTier, ratingVolatility, effectiveK, expectedScore, notes)
- `vercel.json` — Vercel cron config (03:00 UTC nightly recompute), region config
- `.env.local` — Environment variables (not committed — use .env.example as template)
- `middleware.ts` — Role-based route protection (admin routes, authenticated-only routes)
- `lib/db.ts` — Prisma client singleton (connection pooling safe for serverless)

### Rating Engine (`/lib/rating-engine/`)
- `lib/rating-engine/types.ts` — TypeScript types for MatchRecord, PlayerState, RatingResult, SnapshotWrite
- `lib/rating-engine/elo.ts` — Core doubles-aware ELO functions: teamRating(), expectedScore(), kFactor()
- `lib/rating-engine/elo.test.ts` — Unit tests for ELO core
- `lib/rating-engine/replay.ts` — Full replay batch function: fetch → reset → replay all → return snapshots
- `lib/rating-engine/replay.test.ts` — Unit tests for replay (determinism, void exclusion, ordering)
- `lib/rating-engine/post-replay.ts` — Post-replay metric computation: computeRatingConfidence(), computeRatingVolatility()
- `lib/rating-engine/post-replay.test.ts` — Unit tests for confidence and volatility formulas
- `lib/rating-engine/index.ts` — Public barrel export for the rating engine module

### Derived Metrics (`/lib/metrics/`)
- `lib/metrics/compounding-index.ts` — CI formula (Section 10.1): Nᵢ, Sᵢ, M, A, final CI
- `lib/metrics/compounding-index.test.ts` — Unit tests for CI
- `lib/metrics/drift-score.ts` — Drift Score formula (Section 10.2): PEᵢ, DriftRaw, DriftScore
- `lib/metrics/drift-score.test.ts` — Unit tests for Drift Score
- `lib/metrics/volatility-band.ts` — Volatility band formula (Section 10.4): U, V, W, clamped band
- `lib/metrics/volatility-band.test.ts` — Unit tests for volatility band
- `lib/metrics/upcoming-probability.ts` — Upcoming Match Probability: ELO logistic against most frequent recent opponent

### Service Layer
- `lib/services/players.ts` — findOrCreateShadowPlayer(), claimShadowProfile()
- `lib/services/matches.ts` — createMatch(), editMatch() with 60-minute lock enforcement
- `lib/services/audit.ts` — writeAuditEvent() helper (ensures immutability, never updates)

### API Routes
- `app/api/auth/[...nextauth]/route.ts` — Auth.js NextAuth handler
- `app/api/auth/register/route.ts` — POST: user registration (email, password, handle)
- `app/api/auth/verify-email/route.ts` — GET: email verification token confirmation
- `app/api/matches/route.ts` — POST: create match (with shadow profile auto-creation)
- `app/api/matches/[id]/route.ts` — PATCH: edit match (60-minute window enforced server-side)
- `app/api/players/search/route.ts` — GET: player autocomplete search by name/handle
- `app/api/players/recent/route.ts` — GET: recent partners and opponents for chip suggestions
- `app/api/players/[id]/claim/route.ts` — POST: claim shadow profile (email verified required)
- `app/api/command/route.ts` — GET: all Command screen data (rating, win%, CI, Drift, last match, edit timer state, upcoming probability)
- `app/api/trajectory/route.ts` — GET: trajectory data by horizon (ratingSeries, winRate, record, pointDifferential)
- `app/api/matchups/[playerId]/route.ts` — GET: matchup data (rating, confidence, H2H, win probability, volatility band)
- `app/api/admin/recompute/route.ts` — POST: trigger recompute (CRON_SECRET guard, concurrency lock, cooldown, reason required)
- `app/api/admin/matches/route.ts` — GET: list matches for admin (with search/filter)
- `app/api/admin/matches/[id]/void/route.ts` — POST: void match (set voidedAt, write AuditEvent)
- `app/api/admin/players/route.ts` — GET: list players for admin
- `app/api/admin/players/merge/route.ts` — POST: merge two players (reassign participants, soft-delete loser, write AuditEvent)
- `app/api/admin/players/[id]/route.ts` — PATCH: edit player identity (write AuditEvent)
- `app/api/admin/audit-events/route.ts` — GET: read-only audit log

### App Layout & Navigation
- `app/layout.tsx` — Root layout (dark theme, font, session provider)
- `app/(tabs)/layout.tsx` — Tabs layout with bottom navigation shell
- `components/nav/BottomNav.tsx` — Four-tab bottom nav (Command, Enter, Matchups, Trajectory)

### Screens (App Router Pages)
- `app/(tabs)/command/page.tsx` — Command screen (Server Component, fetches /api/command)
- `app/(tabs)/enter/page.tsx` — Enter screen (Client Component, multi-step match entry form)
- `app/(tabs)/matchups/page.tsx` — Matchups screen (free default view + Pro search gate)
- `app/(tabs)/trajectory/page.tsx` — Trajectory screen (chart + segmented control + under-chart stats)
- `app/admin/layout.tsx` — Admin layout (role guard, separate from bottom nav)
- `app/admin/page.tsx` — Admin dashboard / index
- `app/admin/recompute/page.tsx` — Recompute panel + status page
- `app/admin/matches/page.tsx` — Void match UI
- `app/admin/players/page.tsx` — Merge players + identity edit UI
- `app/admin/audit/page.tsx` — Audit log view
- `app/register/page.tsx` — Registration page
- `app/sign-in/page.tsx` — Sign-in page

### UI Components
- `components/command/EditTimer.tsx` — Client Component: countdown timer (MM:SS interval, "Locked" on expiry)
- `components/enter/PlayerSelector.tsx` — Autocomplete + recent chips player selector
- `components/enter/GameScoreInput.tsx` — Numeric keypad with auto-advance between score fields
- `components/enter/OutcomeToggle.tsx` — WIN / LOSS toggle
- `components/matchups/ProGate.tsx` — Quiet Pro gate label on locked search bar
- `components/trajectory/RatingChart.tsx` — Rating slope line chart (from RatingSnapshots)
- `components/admin/RecomputeModal.tsx` — Reason dropdown + confirmation modal

### Notes

- Unit tests should be placed alongside the source files they test (e.g., `elo.ts` and `elo.test.ts`).
- Use `npx jest [optional/path/to/test/file]` to run tests.
- Never import from `lib/rating-engine` in API route handlers directly — always call through the service layer or the recompute route.
- The rating engine must be a **pure function**: same inputs always produce same outputs. No database calls inside `/lib/rating-engine/elo.ts` or `replay.ts` — data is fetched before calling these functions.
- All API routes that mutate data must be authenticated. Use the session from Auth.js.
- Never hard-delete records. Always use soft-delete patterns (`voidedAt`, `deletedAt`).
- Reference `tasks/prd-vector-by-vektra.md` for all formulas, schema field definitions, and requirement details.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after completing each sub-task, not just the parent.

Example:
- `- [ ] 1.1 Initialize Next.js project` → `- [x] 1.1 Initialize Next.js project`

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Create and checkout a new branch: `git checkout -b feature/vector-mvp`

- [ ] 1.0 Project scaffolding, infrastructure & database schema
  - [ ] 1.1 Initialize Next.js 14 App Router project with TypeScript strict mode: `npx create-next-app@latest vector-by-vektra --typescript --app --tailwind --eslint`
  - [ ] 1.2 Install Prisma and database dependencies: `npm install prisma @prisma/client`; run `npx prisma init`
  - [ ] 1.3 Install remaining dependencies: `npm install next-auth @auth/prisma-adapter bcryptjs @types/bcryptjs`
  - [ ] 1.4 Configure `prisma/schema.prisma` datasource with `provider = "postgresql"`, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")` and `previewFeatures = ["driverAdapters"]` if needed for pgBouncer
  - [ ] 1.5 Write the `Users` model in `prisma/schema.prisma` (id, email, emailVerifiedAt, handle, displayName, role, plan, passwordHash, createdAt)
  - [ ] 1.6 Write the `Players` model (id, userId nullable, displayName, claimed, claimedAt, trustTier, rating, ratingConfidence, ratingVolatility, createdAt, deletedAt)
  - [ ] 1.7 Write the `Matches` model (id, enteredByUserId, matchDate, lockedAt, voidedAt, dataSource, createdAt)
  - [ ] 1.8 Write the `MatchParticipants` model (id, matchId, playerId, team)
  - [ ] 1.9 Write the `Games` model (id, matchId, gameOrder, team1Score, team2Score)
  - [ ] 1.10 Write the `RatingRuns` model (id, runType, startedAt, finishedAt, status, notes)
  - [ ] 1.11 Write the `RatingSnapshots` model (id, runId, playerId, matchId, matchDate, rating, effectiveK, expectedScore)
  - [ ] 1.12 Write the `AuditEvents` model (id, entityType, entityId, actionType, adminUserId, metadata Json, createdAt) — no updatedAt, no soft-delete
  - [ ] 1.13 Run `npx prisma migrate dev --name init` and verify all tables appear in the Supabase dashboard
  - [ ] 1.14 Create `lib/db.ts` — Prisma client singleton safe for serverless (use global variable pattern to avoid hot-reload connection exhaustion)
  - [ ] 1.15 Create `.env.local` with DATABASE_URL (pgBouncer), DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, CRON_SECRET
  - [ ] 1.16 Create `.env.example` with all variable names but no values (safe to commit)
  - [ ] 1.17 Create `vercel.json` with cron job: `{ "crons": [{ "path": "/api/admin/recompute", "schedule": "0 3 * * *" }] }`
  - [ ] 1.18 Configure Tailwind CSS dark mode as default (add `darkMode: 'class'` to `tailwind.config.ts`; add `class="dark"` to root `<html>` in `app/layout.tsx`)
  - [ ] 1.19 Create `app/(tabs)/layout.tsx` with bottom navigation shell rendering `<BottomNav />` and `{children}`
  - [ ] 1.20 Create `components/nav/BottomNav.tsx` — four tabs: Command (`/`), Enter (`/enter`), Matchups (`/matchups`), Trajectory (`/trajectory`); highlight active tab
  - [ ] 1.21 Create placeholder `page.tsx` files for all four tabs (Command, Enter, Matchups, Trajectory) returning a heading only

- [ ] 2.0 Authentication & user management
  - [ ] 2.1 Create `app/api/auth/[...nextauth]/route.ts` — configure Auth.js with PrismaAdapter and CredentialsProvider (email + bcrypt password check); include `role` in the session token
  - [ ] 2.2 Create `app/api/auth/register/route.ts` — POST handler: validate email/handle uniqueness, hash password with bcrypt, create `User` record (role='user', plan='free'), return 201 or error
  - [ ] 2.3 Add email verification token generation to the register route: create a signed token (e.g., using `crypto.randomBytes`), store hashed token + expiry on the user, send verification email
  - [ ] 2.4 Create `app/api/auth/verify-email/route.ts` — GET handler: validate token, set `emailVerifiedAt = now()`, invalidate the token
  - [ ] 2.5 Set up an email sender (Resend or Nodemailer with SMTP) — add `EMAIL_FROM` and SMTP/API env vars; create `lib/email.ts` with a `sendVerificationEmail()` function
  - [ ] 2.6 Create `middleware.ts` — protect `/admin/*` routes (redirect to `/sign-in` if not admin); protect `/api/admin/*` routes (return 403 if not admin); protect all other authenticated routes
  - [ ] 2.7 Build `app/register/page.tsx` — registration form (email, handle, display name, password, confirm password); calls POST `/api/auth/register`; redirects to sign-in on success with a "Check your email" message
  - [ ] 2.8 Build `app/sign-in/page.tsx` — sign-in form (email, password); uses `signIn()` from Auth.js; redirects to Command on success

- [ ] 3.0 Rating engine & batch processing
  - [ ] 3.1 Create `lib/rating-engine/types.ts` — export TypeScript interfaces: `MatchRecord` (matchId, matchDate, createdAt, team1PlayerIds, team2PlayerIds, team1Won), `PlayerState` (playerId, rating), `SnapshotWrite` (playerId, matchId, matchDate, rating, effectiveK, expectedScore, runId)
  - [ ] 3.2 Create `lib/rating-engine/elo.ts` — implement and export: `teamRating(r1, r2)` → average; `expectedScore(teamARating, teamBRating)` → logistic; `kFactor(baseK, recencyWeight, marginWeight)` → product; `computeRatingDelta(winner, loser, expectedWinner)` → K × (1 − E)
  - [ ] 3.3 Write `lib/rating-engine/elo.test.ts` — test: expectedScore(1000, 1000) ≈ 0.5; expectedScore(1200, 1000) > 0.5; kFactor output is positive and bounded; rating delta is positive for wins, negative for losses
  - [ ] 3.4 Create `lib/rating-engine/replay.ts` — implement `replayAllMatches(matches: MatchRecord[], runId: string): { snapshots: SnapshotWrite[], finalRatings: Map<string, number> }`: (1) initialize all players at 1000, (2) sort matches by matchDate then createdAt, (3) for each match compute teamRatings, expectedScore, kFactor, delta, update ratings, push SnapshotWrite
  - [ ] 3.5 Write `lib/rating-engine/replay.test.ts` — test: two players, one match → both get snapshots; voided matches excluded when caller filters; same input always produces same output (determinism); chronological ordering respected
  - [ ] 3.6 Create `lib/rating-engine/post-replay.ts` — implement `computeRatingConfidence(playerId, allMatches, snapshots): number` using the four-component formula from Section 10.3 (Cₙ, Cᵣ, Cᵈ, Cₛ); implement `computeRatingVolatility(playerId, snapshots): number` (σΔ of last 20 rating deltas)
  - [ ] 3.7 Write `lib/rating-engine/post-replay.test.ts` — test each confidence component independently (Cₙ saturates at high n; Cᵣ decays with d; Cᵈ penalizes low diversity; Cₛ penalizes high σΔ); full product is clamped 0–1
  - [ ] 3.8 Create `lib/rating-engine/index.ts` — barrel export: `export { replayAllMatches } from './replay'`, `export { computeRatingConfidence, computeRatingVolatility } from './post-replay'`, `export type { MatchRecord, SnapshotWrite } from './types'`
  - [ ] 3.9 Create `app/api/admin/recompute/route.ts` — POST handler with full guard chain:
    - (a) Validate `x-cron-secret` header equals `CRON_SECRET` env var; return 401 if missing/wrong
    - (b) Check `runType` in request body or header to distinguish cron vs admin trigger
    - (c) For admin trigger: check no `RatingRun` with `status = 'running'`; check last admin run started < 10 min ago; require `notes` field (max 120 chars)
    - (d) Create `RatingRun` with `status = 'running'`, `runType`, `startedAt = now()`
    - (e) Write `AuditEvent` (for admin triggers only)
    - (f) Fetch all non-voided matches; call `replayAllMatches()`
    - (g) Bulk-insert all `RatingSnapshot` records
    - (h) Update all `Players.rating`, `ratingConfidence`, `ratingVolatility` in a transaction
    - (i) Update `RatingRun` with `status = 'succeeded'`, `finishedAt = now()`
    - (j) On any error: set `RatingRun.status = 'failed'`; return 500

- [ ] 4.0 Match entry & shadow profiles
  - [ ] 4.1 Create `lib/services/players.ts` — implement `findOrCreateShadowPlayer(displayName: string, prisma): Promise<Player>`: search for existing unclaimed player by display name (case-insensitive); if not found, create new Player with `userId = null`, `claimed = false`, `trustTier = 'unverified'`, `rating = 1000`
  - [ ] 4.2 Create `lib/services/audit.ts` — implement `writeAuditEvent(params: { entityType, entityId, actionType, adminUserId?, metadata? }, prisma): Promise<void>`; this must use a Prisma `create()` (never `update()` or `upsert()` on AuditEvents)
  - [ ] 4.3 Create `app/api/matches/route.ts` — POST handler:
    - Require authenticated session
    - Validate body: matchDate, partnerId or partnerName, opponent1Id or opponent1Name, opponent2Id or opponent2Name, outcome (win|loss), games array (gameOrder, team1Score, team2Score)
    - For each name-only player: call `findOrCreateShadowPlayer()`
    - Create `Match` with `enteredByUserId = session.user.id`, `dataSource = 'manual'`, `createdAt = now()`
    - Create `MatchParticipants` (entering user's player + partner = team 1; two opponents = team 2)
    - Create `Games` records
    - Return created match with `editExpiresAt = createdAt + 60 minutes`
  - [ ] 4.4 Create `app/api/matches/[id]/route.ts` — PATCH handler:
    - Require authenticated session
    - Verify match belongs to session user (`enteredByUserId`)
    - Check `now() <= match.createdAt + 60 minutes`; if expired, return 403 with "Match is locked"
    - Update Games records (scores/outcome only — participants cannot change)
    - Return updated match
  - [ ] 4.5 Create `app/api/players/search/route.ts` — GET handler: accept `?q=` query param; search `Players.displayName` case-insensitively (ILIKE); return top 10 results with id, displayName, rating, claimed
  - [ ] 4.6 Create `app/api/players/recent/route.ts` — GET handler: return the current user's last 5 distinct partners and last 5 distinct opponents from their match history (for chip suggestions in Enter screen)
  - [ ] 4.7 Create `app/api/players/[id]/claim/route.ts` — POST handler:
    - Require authenticated session with `emailVerifiedAt` set; return 403 if email not verified
    - Check target player has `userId = null` (not yet claimed); return 409 if already claimed
    - Check session user does not already have a player profile (`Players.userId = session.user.id`); return 409 if so
    - Update Player: set `userId`, `claimed = true`, `claimedAt = now()`, `trustTier = 'verified_email'`
    - Call `writeAuditEvent({ actionType: 'claim', entityType: 'Player', entityId: playerId })`
    - Return updated player
  - [ ] 4.8 Build `components/enter/PlayerSelector.tsx` — Client Component: text input with debounced autocomplete fetching from `/api/players/search`; shows recent chips (from `/api/players/recent`) by default; allows typing a new name if no match found (will create shadow profile on submit)
  - [ ] 4.9 Build `components/enter/OutcomeToggle.tsx` — Client Component: WIN / LOSS two-option toggle; styled as large tap targets
  - [ ] 4.10 Build `components/enter/GameScoreInput.tsx` — Client Component: renders two numeric inputs (Team 1 / Team 2) per game; numeric keyboard on mobile; auto-advances focus to next field on input; supports adding multiple games
  - [ ] 4.11 Build `app/(tabs)/enter/page.tsx` — Client Component orchestrating the 5-step flow: partner selector → opponent selectors → outcome toggle → game scores → submit; calls POST `/api/matches`; shows success state with "Match recorded" after submit

- [ ] 5.0 Player-facing screens
  - [ ] 5.1 Create `lib/metrics/compounding-index.ts` — implement `computeCI(snapshots: SnapshotWrite[]): number` per Section 10.1: normalize deltas by Kᵢ → Nᵢ; compute surplus Sᵢ = Actualᵢ − Eᵢ; compute M = avg(Nᵢ × Sᵢ); compute A = slope of Nᵢ series (linear regression); return CI = 100 × (0.7M + 0.3A)
  - [ ] 5.2 Write `lib/metrics/compounding-index.test.ts` — test: flat performance → CI near 0; improving performance against tough opponents → CI > 0; declining → CI < 0
  - [ ] 5.3 Create `lib/metrics/drift-score.ts` — implement `computeDriftScore(snapshots: SnapshotWrite[], actuals: number[]): number` per Section 10.2: PEᵢ = Actualᵢ − Eᵢ; DriftRaw = avg(PEᵢ); return 100 × DriftRaw
  - [ ] 5.4 Write `lib/metrics/drift-score.test.ts` — test: all wins when expected → positive drift; all losses when expected → negative drift; results match expectations → near 0
  - [ ] 5.5 Create `lib/metrics/volatility-band.ts` — implement `computeVolatilityBand(p: number, confidenceA: number, confidenceB: number, volatilityA: number, volatilityB: number): { lower: number, upper: number, width: number }` per Section 10.4
  - [ ] 5.6 Write `lib/metrics/volatility-band.test.ts` — test: high confidence + low volatility → narrow band (≤5%); low confidence + high volatility → wide band (≥10%); width always within 3%–20% clamp
  - [ ] 5.7 Create `lib/metrics/upcoming-probability.ts` — implement `computeUpcomingProbability(currentPlayerRating: number, recentOpponents: { rating: number }[]): number | null`: find the most frequently faced opponent in last 20 matches; compute ELO logistic win probability; return null if no match history
  - [ ] 5.8 Create `app/api/command/route.ts` — GET handler: fetch current player's data and return:
    - `rating`: Players.rating
    - `winPct90d`: win % over last 90 days from match history
    - `compoundingIndex`: compute from last 10 RatingSnapshots using CI formula
    - `driftScore`: compute from last 10 RatingSnapshots using Drift formula
    - `lastMatch`: summary of most recent match (date, outcome, opponent names, score)
    - `editTimer`: `{ expiresAt: string | null }` — only if a match exists with createdAt + 60min > now
    - `upcomingProbability`: from `computeUpcomingProbability()`
  - [ ] 5.9 Create `app/api/trajectory/route.ts` — GET handler: accept `?horizon=10games|7days|30days`; filter `RatingSnapshots` for current player by horizon; return `{ ratingSeries: { matchDate, rating }[], winRate, record: { wins, losses }, pointDifferential }`
  - [ ] 5.10 Create `app/api/matchups/[playerId]/route.ts` — GET handler (authenticated): fetch opponent player; compute win probability (ELO logistic); compute volatility band; return `{ rating, ratingConfidence, h2h: { wins, losses }, winProbability, volatilityBand }` — requires Pro plan check; if free user and player is not a direct opponent, return 403
  - [ ] 5.11 Build `components/command/EditTimer.tsx` — Client Component: receives `expiresAt` prop; uses `setInterval` to decrement and display "Editable for MM:SS"; clears interval and shows "Locked" when expired
  - [ ] 5.12 Build `app/(tabs)/command/page.tsx` — Server Component: fetches `/api/command`; renders rating (large numeric), 90-day win%, CI value, Drift Score value, last match summary, `<EditTimer />`, upcoming probability; no scrolling required (all visible on mobile viewport)
  - [ ] 5.13 Build `components/trajectory/RatingChart.tsx` — Client Component: receives `ratingSeries` array; renders a simple line chart (use a lightweight library like `recharts` or `chart.js` with react-chartjs-2); x-axis = matchDate, y-axis = rating
  - [ ] 5.14 Build `app/(tabs)/trajectory/page.tsx` — Client Component: segmented control for horizon (10 Games / 7 Days / 1 Month, default 10 Games); fetches `/api/trajectory?horizon=` on segment change; renders `<RatingChart />`; under chart: win%, record (W-L), point differential
  - [ ] 5.15 Build `components/matchups/ProGate.tsx` — Client Component: renders a muted, disabled search input with a small "Pro" badge label; quiet, no modal
  - [ ] 5.16 Build `app/(tabs)/matchups/page.tsx` — Server Component: for free users, fetch and render last 5 opponents (rating + H2H record) from `/api/players/recent`; render `<ProGate />` search bar below; for Pro users, render enabled search bar that calls `/api/matchups/[playerId]` and displays full matchup card

- [ ] 6.0 Admin panel
  - [ ] 6.1 Create `app/admin/layout.tsx` — admin layout: check `session.user.role === 'admin'` server-side; redirect to `/` if not admin; render admin navigation (separate from bottom nav) and `{children}`
  - [ ] 6.2 Create `app/api/admin/matches/route.ts` — GET handler (admin only): accept `?q=` search param; return paginated list of matches with player names, dates, void status
  - [ ] 6.3 Create `app/api/admin/matches/[id]/void/route.ts` — POST handler (admin only): set `Match.voidedAt = now()`; call `writeAuditEvent({ actionType: 'void_match', entityType: 'Match', entityId: id })`; return updated match
  - [ ] 6.4 Build `app/admin/matches/page.tsx` — search/list matches; "Void" button per match; confirmation dialog ("Void this match? This cannot be undone without an admin recompute."); calls POST `/api/admin/matches/[id]/void`
  - [ ] 6.5 Create `app/api/admin/players/route.ts` — GET handler (admin only): list players with search by displayName
  - [ ] 6.6 Create `app/api/admin/players/merge/route.ts` — POST handler (admin only): accept `{ keepId, mergeId }`; in a Prisma transaction: reassign all `MatchParticipants.playerId` from mergeId → keepId; set `Players.deletedAt = now()` on merge player; call `writeAuditEvent({ actionType: 'merge_players', metadata: { keepId, mergeId } })`
  - [ ] 6.7 Create `app/api/admin/players/[id]/route.ts` — PATCH handler (admin only): accept `{ displayName }` (and any other identity fields); update `Player`; call `writeAuditEvent({ actionType: 'identity_edit', entityId: id, metadata: { before, after } })`
  - [ ] 6.8 Build `app/admin/players/page.tsx` — two panels: (1) Merge: select two players via search, preview merge, confirm; (2) Identity edit: select player, edit displayName, save; both panels post to their respective API routes
  - [ ] 6.9 Create `app/api/admin/audit-events/route.ts` — GET handler (admin only): return `AuditEvents` sorted by `createdAt DESC`, paginated; never expose an update or delete endpoint for this table
  - [ ] 6.10 Build `app/admin/audit/page.tsx` — read-only paginated table of AuditEvents (createdAt, actionType, entityType, entityId, adminUserId, metadata preview)
  - [ ] 6.11 Build `components/admin/RecomputeModal.tsx` — Client Component: reason dropdown (Merge / Void match / Identity correction / Other); confirmation text "This rewrites ratings and snapshots."; Confirm and Cancel buttons; on confirm, calls POST `/api/admin/recompute` with reason in body
  - [ ] 6.12 Build `app/admin/recompute/page.tsx` — status display (last run: time, duration, trigger type, status badge running/succeeded/failed, notes); "Trigger Recompute" button that opens `<RecomputeModal />`; poll or refresh to show live status when a run is in progress
  - [ ] 6.13 Build `app/admin/page.tsx` — admin index with links to: Void Matches, Merge/Edit Players, Audit Log, Recompute
