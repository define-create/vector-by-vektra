## Relevant Files

- `app/(tabs)/enter/page.tsx` - Add admin toggle, 4th player slot, and admin-mode payload flag.
- `app/api/matches/route.ts` - Handle `adminMode: true` in request body — skip auto-adding session user, use all 4 explicit player IDs.
- `app/admin/layout.tsx` - Add `Tournament` entry to `NAV_LINKS` array.
- `app/admin/tournament/page.tsx` - New tournament results page (tag selector, podium, leaderboard, match list). _(new)_
- `app/api/admin/tournament/route.ts` - New `GET` route returning leaderboard + match list for a tag. _(new)_
- `lib/services/tournament.ts` - New service: win computation, ranking algorithm (wins → H2H record → H2H point diff → tie), data assembly. _(new)_
- `lib/services/tournament.test.ts` - Unit tests for ranking algorithm edge cases. _(new)_
- `components/admin/tournament/TagSelector.tsx` - Searchable tag dropdown using `GET /api/tags`. _(new)_
- `components/admin/tournament/Podium.tsx` - Gold/silver/bronze podium display. _(new)_
- `components/admin/tournament/LeaderboardTable.tsx` - Ranked player list (rank · name · wins · losses · rating). _(new)_
- `components/admin/tournament/TournamentMatchList.tsx` - Match rows styled identically to Command screen "Recent Matches". _(new)_

### Notes

- Unit tests should be placed alongside the code files they test (`tournament.ts` and `tournament.test.ts` in `lib/services/`).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests.
- The Enter page uses `useSession()` from `next-auth/react` (SessionProvider already in `app/providers.tsx`) — use this to check `session.user.role === "admin"` client-side for showing the toggle.
- `MatchParticipant` has no stored `outcome` field — wins are computed from `Game.team1Score` vs `Game.team2Score` (team with more game wins takes the match).
- Middleware at `middleware.ts` already guards all `/api/admin/*` routes — no manual auth check needed inside the new API route.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/tournament`

- [x] 1.0 Admin Enter screen — "On Behalf Of" toggle
  - [x] 1.1 In `app/(tabs)/enter/page.tsx`, import `useSession` from `next-auth/react` and derive `isAdmin = session?.user?.role === "admin"`.
  - [x] 1.2 Add `adminMode` boolean state (default `false`). Render a toggle labelled **"Entering on behalf of players"** near the top of the form, visible only when `isAdmin` is true.
  - [x] 1.3 When `adminMode` is ON, add a new first player slot for **"Team 1 Player 1"** (using the existing `PlayerSelector` component). In normal mode this slot is hidden (the entering user is added server-side).
  - [x] 1.4 When `adminMode` is ON, rename the existing labels: "Your partner" → **"Team 1 Player 2"**, "Opponent 1" → **"Team 2 Player 1"**, "Opponent 2" → **"Team 2 Player 2"**.
  - [x] 1.5 Include an `adminMode: boolean` flag and the explicit `team1Player1Id` in the match submission payload when admin mode is ON.
  - [x] 1.6 In `app/api/matches/route.ts`, read the `adminMode` flag from the request body. When `true`, use all four explicit player IDs (team1Player1, team1Player2/partner, team2Player1/opp1, team2Player2/opp2) directly — skip the step that auto-resolves and adds the session user as a participant.
  - [x] 1.7 Verify the existing normal-mode submission is completely unaffected when `adminMode` is `false` or absent.

- [x] 2.0 Tournament service — leaderboard ranking algorithm
  - [x] 2.1 Create `lib/services/tournament.ts`. Define and export interfaces: `TournamentPlayer` (id, displayName, rating, wins, losses), `TournamentMatch` (id, matchDate, team1Names, team2Names, team1Won, score), `TournamentData` (leaderboard: TournamentPlayer[], matches: TournamentMatch[]).
  - [x] 2.2 Implement internal helper `computeTeam1Won(games: { team1Score: number; team2Score: number }[]): boolean` — count games where `team1Score > team2Score`; return true if team 1 won more games.
  - [x] 2.3 Implement `getTournamentData(tag: string): Promise<TournamentData>`. Fetch all non-voided matches where `tag` matches, including `participants` (with `player`), `games`, and current player `rating` from the `Player` model.
  - [x] 2.4 Build win/loss counts per player: for each match, use `computeTeam1Won` to determine the winner; increment `wins` for all players on the winning team and `losses` for all players on the losing team.
  - [x] 2.5 Implement tiebreaker Step 1 (primary sort): sort players by `wins` descending.
  - [x] 2.6 Implement tiebreaker Step 2 (head-to-head record): among players tied on wins, count direct match encounters between them (as teammates vs. each other counts; direct opposition counts). The player who won more of those encounters ranks higher.
  - [x] 2.7 Implement tiebreaker Step 3 (head-to-head point differential): among players still tied after Step 2, sum total points scored minus points conceded in all direct matches between those players. Higher differential ranks higher.
  - [x] 2.8 Implement tiebreaker Step 4 (persistent tie): players still tied after Step 3 share the same rank — no further resolution. Assign shared rank numbers correctly (e.g., two tied 2nds means next player is 4th).
  - [x] 2.9 Build the `matches` list: for each match, derive `team1Names` and `team2Names` from participants, compute `score` string (e.g., `"11–6, 9–11, 11–8"`), set `team1Won` from `computeTeam1Won`. Sort descending by `matchDate`.
  - [x] 2.10 Return `{ leaderboard, matches }`.

- [x] 3.0 Tournament API route
  - [x] 3.1 Create `app/api/admin/tournament/route.ts`. Export `async function GET(req: NextRequest)`.
  - [x] 3.2 Extract the `tag` query parameter from `req.nextUrl.searchParams`. If missing or empty, return `NextResponse.json({ error: "tag is required" }, { status: 400 })`.
  - [x] 3.3 Call `getTournamentData(tag)` from the tournament service and return `NextResponse.json(data)`.

- [x] 4.0 Tournament screen components
  - [x] 4.1 Create `components/admin/tournament/TagSelector.tsx`. Fetch tags from `GET /api/tags` on mount. Render a searchable dropdown or chip list. Emit the selected tag string via an `onChange` prop. When no tag is selected, render nothing (the parent page handles the empty state prompt).
  - [x] 4.2 Create `components/admin/tournament/Podium.tsx`. Accept `top3: TournamentPlayer[]` (1–3 items). Render gold (centre, tallest), silver (left), bronze (right) podium positions. Each slot shows player display name and W/L record. Empty positions render as blank. Use the existing zinc palette with amber/gray/orange accent text for medal labels.
  - [x] 4.3 Create `components/admin/tournament/LeaderboardTable.tsx`. Accept `players: TournamentPlayer[]`. Render a `rounded-xl bg-zinc-800` list (matching existing card style). Each row: rank number · display name · wins · losses · rating (rounded integer). Use `text-sm` typography and `border-t border-zinc-700/50` row dividers.
  - [x] 4.4 Create `components/admin/tournament/TournamentMatchList.tsx`. Accept `matches: TournamentMatch[]`. Render rows **identically** to Command screen `MatchHistoryList`: `rounded-xl bg-zinc-800` container, `border-t border-zinc-700/50` dividers, `text-sm` text. Each row: date (short month + day) · WIN/LOSS badge (`text-emerald-400` / `text-rose-400`, based on `team1Won`) · Team 1 names vs Team 2 names (flex-1 middle) · score (right-aligned). WIN/LOSS reflects Team 1's result as entered.

- [x] 5.0 Tournament page and admin panel navigation
  - [x] 5.1 In `app/admin/layout.tsx`, add `{ href: "/admin/tournament", label: "Tournament" }` to the `NAV_LINKS` array.
  - [x] 5.2 Create `app/admin/tournament/page.tsx` as a client component (`"use client"`). Manage `selectedTag` state. Render `TagSelector` at the top.
  - [x] 5.3 When no tag is selected, render the prompt: *"Select an event to view results."*
  - [x] 5.4 When a tag is selected, fetch `GET /api/admin/tournament?tag=<tag>` and store the result in state. Show a loading indicator while fetching.
  - [x] 5.5 Render the `Podium` with the top 3 players from the leaderboard (slice `leaderboard.slice(0, 3)`).
  - [x] 5.6 Render the `LeaderboardTable` with the full leaderboard.
  - [x] 5.7 Render the `TournamentMatchList` with all matches. Use full-page scroll (no nested scroll widget).

- [x] 6.0 Tests and verification
  - [x] 6.1 Write unit tests in `lib/services/tournament.test.ts` covering:
    - Basic win counting (multiple players, clear winner)
    - Head-to-head tiebreaker (two tied players, H2H resolves)
    - Point differential tiebreaker (H2H record still tied, points resolve)
    - Persistent tie (still tied after all steps — both share same rank)
    - `computeTeam1Won` helper (2-game match, 3-game match, edge cases)
  - [x] 6.2 Run `npx jest lib/services/tournament.test.ts` and confirm all tests pass.
  - [x] 6.3 Run `npx jest` (all tests) to confirm no regressions.
  - [x] 6.4 Run `npm run build` to confirm zero TypeScript errors.
  - [x] 6.5 Manual test — admin match entry: log in as admin, toggle "Entering on behalf of players" ON, enter a match with 4 players and a tag. Verify the match appears in all 4 players' Command screen match history and affects their ratings.
  - [x] 6.6 Manual test — tournament screen: navigate to `/admin/tournament`, select the tag used in 6.5, verify podium and leaderboard display correctly, verify match list matches the entered match with correct WIN/LOSS and score.
  - [x] 6.7 Manual test — normal user: log in as a non-admin user, open the Enter screen, confirm the "Entering on behalf of players" toggle is not visible.
