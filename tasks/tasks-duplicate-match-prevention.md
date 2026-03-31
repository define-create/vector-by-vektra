## Relevant Files

- `prisma/schema.prisma` - Add `fingerprint String?` field to the `Match` model.
- `lib/services/matchFingerprint.ts` - New file: pure function that computes a perspective-neutral match fingerprint.
- `lib/services/matchFingerprint.test.ts` - Unit tests for the fingerprint utility.
- `app/api/matches/route.ts` - POST handler: add fingerprint pre-check logic and P2002 race-condition catch.
- `app/api/matches/[id]/route.ts` - PATCH handler: recompute fingerprint on score edit, check for collision.
- `app/(tabs)/enter/page.tsx` - Enter form: add `duplicateMatchId` state, soft 409 warning UI, "Save anyway" flow.
- `app/match/[id]/page.tsx` - New file: match detail page (permalink + duplicate error destination).

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `matchFingerprint.ts` and `matchFingerprint.test.ts` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests.
- **The DB migration (Task 1.1) must be run manually in the Supabase SQL editor before deploying any code that writes `fingerprint`.** pgBouncer is incompatible with `prisma migrate deploy`.
- After editing `prisma/schema.prisma`, always run `npx prisma generate`. A stale client causes silent `Unknown field` errors at runtime.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 1.0 Database migration and schema update
  - [x] 1.1 Run the following SQL in the Supabase SQL editor (not via `prisma migrate`):
    ```sql
    ALTER TABLE "Match" ADD COLUMN "fingerprint" TEXT;
    CREATE UNIQUE INDEX match_fingerprint_active ON "Match" (fingerprint) WHERE "voidedAt" IS NULL;
    ```
    Verify both commands succeed before proceeding. The partial index (not a plain `UNIQUE` constraint) is required so that voiding a match frees its fingerprint for re-entry.
  - [x] 1.2 In `prisma/schema.prisma`, add `fingerprint  String?` to the `Match` model (after `flagReason`, before the relations block). Do **not** add `@unique` — the uniqueness constraint lives only in the DB partial index, which Prisma cannot express in schema syntax.
  - [x] 1.3 Run `npx prisma generate` to regenerate the Prisma client in `app/generated/prisma/`. Confirm no errors.

- [x] 2.0 Fingerprint utility
  - [x] 2.1 Create `lib/services/matchFingerprint.ts` with the exported function `computeMatchFingerprint(team1, team2, matchDate, games)`. The function must:
    - Sort player IDs within each team alphabetically.
    - Normalize team order: if `sortedTeam1[0] > sortedTeam2[0]`, swap teams and flip all game scores (team1Score ↔ team2Score).
    - Format `matchDate` as `YYYY-MM-DD` using `.toISOString().slice(0, 10)`.
    - Sort game score pairs ascending by normalized team-1 score (then team-2 score as tiebreaker).
    - Return the string `"p1,p2;p3,p4;YYYY-MM-DD;t1score-t2score,..."`.
  - [x] 2.2 Create `lib/services/matchFingerprint.test.ts` and write unit tests covering:
    - Symmetry: swapping team1/team2 and flipping scores produces the same fingerprint.
    - Score ordering: games entered in different orders produce the same fingerprint.
    - Different scores produce a different fingerprint.
    - Different players produce a different fingerprint.
    - Different dates produce a different fingerprint.

- [x] 3.0 Match creation API — fingerprint logic (POST)
  - [x] 3.1 In `app/api/matches/route.ts`, add `force?: boolean` to the `CreateMatchBody` interface.
  - [x] 3.2 Add `import { computeMatchFingerprint } from "@/lib/services/matchFingerprint";` at the top of the file.
  - [x] 3.3 After the "Guard: all four players must be distinct" block (~line 221) and before the `prisma.$transaction` call, insert the fingerprint pre-check logic:
    - Extract `force` from `body`.
    - Declare `let matchFingerprint: string | null = null;`
    - If `force` is falsy:
      - Compute the fingerprint using `computeMatchFingerprint([team1P1.id, partnerPlayer.id], [opp1Player.id, opp2Player.id], matchDate, body.games)`.
      - Query `prisma.match.findFirst({ where: { fingerprint, voidedAt: null } })` (no user filter).
      - If found and `existing.enteredByUserId === session.user.id`: leave `matchFingerprint = null` (same-user re-entry — allow silently, no fingerprint stored).
      - If found and `existing.enteredByUserId !== session.user.id`: return `NextResponse.json({ error: "duplicate_match", existingMatchId: existing.id }, { status: 409 })`.
      - If not found: set `matchFingerprint = fingerprint`.
  - [x] 3.4 In the `tx.match.create({ data: { ... } })` call inside the transaction, add `fingerprint: matchFingerprint` to the `data` object.
  - [x] 3.5 Wrap the `const match = await prisma.$transaction(...)` call (and only that call) in a `try/catch`. In the catch block:
    - Check `err?.code === "P2002"` and that the target includes `"fingerprint"`.
    - If so, perform a follow-up `prisma.match.findFirst({ where: { fingerprint: matchFingerprint, voidedAt: null } })` to retrieve the conflicting match ID (Prisma does not expose it from the error object).
    - Return `NextResponse.json({ error: "duplicate_match", existingMatchId: existing?.id ?? null }, { status: 409 })`.
    - Re-throw all other errors so the outer catch still handles them.

- [x] 4.0 Match edit API — fingerprint maintenance (PATCH)
  - [x] 4.1 In `app/api/matches/[id]/route.ts`, add `force?: boolean` to the `PatchMatchBody` interface.
  - [x] 4.2 Add `import { computeMatchFingerprint } from "@/lib/services/matchFingerprint";` at the top of the file.
  - [x] 4.3 After the 20-minute edit window check and before the `prisma.$transaction` call, add fingerprint recompute logic:
    - Declare `let updatedFingerprint: string | null | undefined = undefined;` (`undefined` means "don't touch the existing value").
    - If `hasGames && !body.force`:
      - Fetch the match's participants: `prisma.matchParticipant.findMany({ where: { matchId: id }, orderBy: { team: "asc" } })`.
      - Separate into `team1` (team === 1) and `team2` (team === 2) player ID arrays.
      - Compute `newFingerprint = computeMatchFingerprint([team1[0], team1[1]], [team2[0], team2[1]], new Date(match.matchDate), body.games!)`.
      - Query for a collision: `prisma.match.findFirst({ where: { fingerprint: newFingerprint, voidedAt: null, id: { not: id } } })`.
      - If collision found: return `NextResponse.json({ error: "duplicate_match", existingMatchId: collision.id }, { status: 409 })`.
      - If no collision: set `updatedFingerprint = newFingerprint`.
    - Else if `hasGames && body.force`: set `updatedFingerprint = null`.
  - [x] 4.4 In the transaction, update the match record to include the fingerprint when `updatedFingerprint !== undefined`. Currently the transaction only updates tag when `hasTag`. Add a combined `tx.match.update` that handles both tag and fingerprint:
    - Consolidate: if `hasTag` OR `updatedFingerprint !== undefined`, call `tx.match.update({ where: { id }, data: { ...(hasTag && { tag: tagValue }), ...(updatedFingerprint !== undefined && { fingerprint: updatedFingerprint }) } })`.
    - Make sure the existing tag-only update path is replaced (not duplicated).

- [x] 5.0 Enter form — duplicate warning UI
  - [x] 5.1 In `app/(tabs)/enter/page.tsx`, add `const [duplicateMatchId, setDuplicateMatchId] = useState<string | null>(null);` alongside the other submission state variables (near line 66–71).
  - [x] 5.2 Modify the `submit()` function signature to `async function submit(force = false)`. Inside the function:
    - At the top, also call `setDuplicateMatchId(null)` alongside the existing `setSubmitError(null)`.
    - Add `...(force && { force: true })` to the body object in both the admin and non-admin branches.
  - [x] 5.3 In `submit()`, after `const res = await fetch(...)`, add handling for `res.status === 409` **before** the existing `if (!res.ok)` check:
    ```ts
    if (res.status === 409) {
      const data = await res.json();
      setDuplicateMatchId(data.existingMatchId ?? null);
      setSubmitting(false);
      return;
    }
    ```
  - [x] 5.4 Update `canSubmit()` to return `false` while a duplicate warning is active: add `!duplicateMatchId &&` at the start of the return expression.
  - [x] 5.5 Replace the `{submitError && (...)}` block at ~line 588 with the following conditional:
    - If `duplicateMatchId` is set: show an amber warning panel containing:
      - Message: *"A match with these players and this score was already recorded today."*
      - A `<Link href={"/match/" + duplicateMatchId}>View existing match</Link>` (tappable, underlined).
      - A **"Cancel"** button that calls `setDuplicateMatchId(null)` (secondary style).
      - A **"Save anyway"** button that calls `submit(true)` (primary/destructive style).
    - Else if `submitError` is set: show the existing rose error paragraph.
  - [x] 5.6 In the bottom submit button, verify the `disabled` condition correctly reflects the updated `canSubmit()` (it uses `canSubmit()` already, so no change needed — just confirm).

- [x] 6.0 Match detail page (`/match/[id]`)
  - [x] 6.1 Create `app/match/[id]/page.tsx` as a Next.js server component. Add an auth guard at the top: get the session via `getServerSession(authOptions)`; if no session, call `redirect("/login")`.
  - [x] 6.2 Fetch the match using `prisma.match.findUnique({ where: { id: params.id }, include: { participants: { include: { player: true }, orderBy: { team: "asc" } }, games: { orderBy: { gameOrder: "asc" } }, enteredBy: { select: { name: true } } } })`.
  - [x] 6.3 Handle the two special cases before rendering:
    - If `!match`: render a simple `<div>Match not found.</div>` (or a styled card).
    - If `match.voidedAt`: render `<div>This match is no longer available.</div>`.
  - [x] 6.4 Fetch `RatingSnapshot` data for ELO deltas:
    - Fetch the latest `RatingRun`: `prisma.ratingRun.findFirst({ orderBy: { createdAt: "desc" } })`.
    - Fetch all snapshots for this match in the latest run: `prisma.ratingSnapshot.findMany({ where: { matchId: match.id, runId: latestRun.id } })`.
    - For each snapshot, fetch the player's most recent prior snapshot: `prisma.ratingSnapshot.findFirst({ where: { playerId: s.playerId, runId: latestRun.id, matchDate: { lt: match.matchDate } }, orderBy: { matchDate: "desc" } })`.
    - Build a `Map<playerId, delta | null>`: delta = `thisSnapshot.rating - prevSnapshot.rating`; `null` if no prior snapshot (first-ever match for that player).
    - If `latestRun` is null, skip delta computation entirely (all deltas will be null).
  - [x] 6.5 Derive display values from the match data:
    - Separate `match.participants` into `team1` (team === 1) and `team2` (team === 2).
    - Count game wins per team to determine the overall winner.
    - Format `match.matchDate` as a readable date string (e.g. `"Mar 31, 2026"`).
    - Format `match.createdAt` similarly for "entered on" display.
  - [x] 6.6 Render the page following the existing app visual language (dark zinc background, rounded cards). Include:
    - Match date (and event tag if `match.tag` is set).
    - Team 1 vs Team 2 layout: each player's display name as a tappable link to their profile (`/profile/[player.id]` or equivalent existing route), with ELO delta displayed next to their name (e.g. `+12` in green / `−8` in red). Omit delta silently if null.
    - Game-by-game scores table (team1Score vs team2Score per row).
    - Final outcome label (e.g. "Team 1 wins").
    - "Entered by [name] on [date]" footer line.
    - Back navigation (e.g. `<Link href="/">← Back</Link>`).
