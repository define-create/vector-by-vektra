# PRD: Tournament Feature

## 1. Introduction / Overview

Vector by Vektra currently supports individual match entry by players for their own matches. This feature introduces two connected capabilities for admins:

1. **Admin match entry** — the ability to enter any match on behalf of all four players (not just their own), enabling full tournament data capture from a single admin device.
2. **Tournament results screen** — a dedicated admin-only view inside the Admin panel that displays a winners' podium, a full player leaderboard, and a complete match list for any tagged event.

The feature leverages the existing **Event Tag** system (`Match.tag`) as the tournament scope. No new database concepts are required.

**Problem solved:** During a tournament or event, an admin needs to record every match — including matches they did not participate in — and then view aggregated results, standings, and a podium for the top performers.

---

## 2. Goals

1. Allow an admin to enter all matches at an event without being restricted to only their own matches.
2. Provide a dedicated tournament results screen showing player standings (W/L, rating) and a gold/silver/bronze podium.
3. Keep the experience consistent with the existing app — the match list on the tournament screen must look and behave identically to the "Recent Matches" list on the Command screen.
4. Require no changes to the existing rating engine or match submission pipeline — all matches are processed normally.
5. Scope everything to admin users — no new player-facing screens or navigation tabs.

---

## 3. User Stories

**As an admin**, I want to toggle into "entering on behalf of players" mode on the Enter screen so that I can record any match at the event without being forced to include myself as a participant.

**As an admin**, I want to tag every match with the event name using the existing Event Tag field so that the tournament screen can filter all matches for that event.

**As an admin**, I want to view a tournament results screen in the Admin panel where I can select any event tag and see the leaderboard and match history for that event.

**As an admin**, I want to see a winners' podium highlighting the top 3 players (gold, silver, bronze) so that I can celebrate top performers after the event.

**As a player** (who participated in a tournament), I want my tournament matches to appear in my normal match history, affect my rating, and be visible in Matchups and Trajectory exactly as any other match — the tournament tag is just extra context.

---

## 4. Functional Requirements

### 4.1 Admin Match Entry — "On Behalf Of" Mode

1. The Enter screen must display a toggle labelled **"Entering on behalf of players"** that is visible only to users with the `admin` role.
2. When the toggle is **OFF** (default), the Enter screen behaves exactly as it does today — the logged-in user is pre-populated as Team 1, Player 1.
3. When the toggle is **ON**:
   - The "Your team" label must change to **"Team 1"**.
   - The "Opponents" label must change to **"Team 2"**.
   - The logged-in admin must **not** be pre-populated in any player slot.
   - All four player slots must be open for selection using the existing PlayerSelector component.
   - The Event Tag field must remain available and functional.
4. The match submission (API call, rating engine, database write) must be identical regardless of whether the toggle is on or off — no special handling required.
5. Matches entered via admin mode must appear in each participant's match history, affect their ratings, and be visible in Matchups and Trajectory exactly as any other match.

### 4.2 Tournament Screen — Navigation

6. A **"Tournament"** link must be added to the existing Admin panel navigation.
7. The tournament screen must live at `/admin/tournament`.
8. Access must be restricted to admin users via the existing admin auth guard — no changes to auth logic required.

### 4.3 Tournament Screen — Tag Selector

9. The screen must display a tag selector (dropdown or searchable chip list) populated from the existing `GET /api/tags` endpoint.
10. When no tag is selected, the screen must display a prompt: *"Select an event to view results."*
11. Selecting a tag must load all content below (podium, leaderboard, match list) filtered to that tag.

### 4.4 Winners' Podium

12. The podium must display the top 3 ranked players for the selected tag as **Gold (1st)**, **Silver (2nd)**, and **Bronze (3rd)**.
13. Each podium position must show the player's **display name** and their **W/L record** within the tournament.
14. If fewer than 3 players participated, unfilled podium positions must be shown as empty (no error or placeholder name).
15. The podium must only be shown when at least one match exists for the selected tag.

### 4.5 Leaderboard

16. The leaderboard must list **all players** who participated in at least one match with the selected tag, in ranked order.
17. Each row must display: **Rank · Player display name · Wins · Losses · Current all-time rating**.
18. Players must be ranked using the following algorithm (applied in order):
    - **Step 1 — Most wins**: Count team wins within the tagged event. Higher wins = higher rank.
    - **Step 2 — Head-to-head record**: Among players tied on wins, compare their direct match results against each other. The player who won more head-to-head encounters ranks higher.
    - **Step 3 — Head-to-head point differential**: Among players still tied, sum the point differentials from all direct matches between those players. Higher differential ranks higher.
    - **Step 4 — Persistent tie**: If still tied after all three steps, both players share the same rank. No further resolution is applied.
19. "Current all-time rating" means the player's live rating as used throughout the app — not a tournament-specific snapshot.

### 4.6 Match List

20. The match list must display all matches associated with the selected tag, in **reverse chronological order** (most recent first).
21. The match list must use the **same visual design** as the "Recent Matches" list on the Command screen: same row format, same typography (`text-sm`), same `rounded-xl bg-zinc-800` container, same row dividers (`border-t border-zinc-700/50`), same zinc colour palette.
22. Each row must show: **date · WIN/LOSS (emerald for win, rose for loss) · Team 1 names vs Team 2 names · score**.
23. Since there is no personal "my perspective" on this screen, WIN/LOSS must reflect **Team 1's result** as entered.
24. The match list must use full-page scroll (not a nested scroll widget), consistent with the Matchups screen pattern.

---

## 5. Non-Goals (Out of Scope)

- **No player-facing tournament screen** — only admins can access the tournament results view.
- **No new navigation tab** — the tournament screen is accessed exclusively from the Admin panel.
- **No tournament lifecycle management** — there is no concept of "starting" or "ending" a tournament. The scope is purely the Event Tag; any match with that tag is included.
- **No tournament-specific rating calculations** — all rating changes use the standard engine. There is no separate tournament ELO or bracket scoring.
- **No concurrent tournament management** — the screen shows one tag at a time; there is no concept of "active" vs "closed" tournaments.
- **No schema changes** — the existing `Match.tag`, `MatchParticipant`, `GameScore`, and `RatingSnapshot` tables are sufficient.
- **No notifications or sharing** — results are view-only within the admin panel.

---

## 6. Design Considerations

### Visual Consistency
All UI elements must follow existing design conventions:
- Section labels: `text-sm uppercase tracking-widest text-zinc-500`
- Stat cards: `rounded-xl bg-zinc-800/60`
- Match rows: `rounded-xl bg-zinc-800`, row dividers `border-t border-zinc-700/50`
- Colours: `text-emerald-400` for WIN, `text-rose-400` for LOSS
- Typography scale: `text-sm` for row data, `text-2xl` for prominent numbers

### Enter Screen Toggle
The toggle must be visually unobtrusive and placed near the top of the Enter screen. It should not interfere with the existing flow for non-admin users (who never see it).

### Podium Layout
The podium positions (gold/silver/bronze) should be visually distinct — for example, centre/tallest for gold, flanked by silver and bronze — using the existing zinc palette with accent colours for medal positions.

### Existing Components to Reuse
- `PlayerSelector` — all four player slots in admin entry mode
- `GET /api/tags` — tag selector autocomplete on the tournament screen
- Match row layout from `MatchHistoryList` — apply identically to tournament match list

---

## 7. Technical Considerations

- **No schema changes required.** All data is available via existing models: `Match.tag`, `MatchParticipant` (with `team`, `outcome` fields), `GameScore`, `Player`, `RatingSnapshot`.
- **New API route:** `GET /api/admin/tournament?tag=...` — returns ranked leaderboard and full match list for the given tag. Tiebreaking logic lives in a new service file.
- **New service:** `lib/services/tournament.ts` — encapsulates leaderboard ranking (wins → head-to-head record → head-to-head point differential → tie) and match list assembly.
- **Admin role check** on the new API route must use the existing session/role pattern (`session.user.role === "admin"`).
- **Enter screen toggle** should use local component state (`useState`). No server-side or persistent state needed for the toggle position.
- **Win/Loss perspective on tournament match list:** Since there is no "self" on this screen, use Team 1 (`team: 1`) participant's `outcome` field to determine WIN/LOSS label.

### Estimated Files Affected

| Area | File |
|---|---|
| Admin Enter toggle | `app/(tabs)/enter/page.tsx` |
| Admin nav | `app/admin/layout.tsx` (or admin nav component) |
| Tournament page | `app/admin/tournament/page.tsx` _(new)_ |
| Tournament service | `lib/services/tournament.ts` _(new)_ |
| Tournament API route | `app/api/admin/tournament/route.ts` _(new)_ |
| Tournament components | `components/admin/tournament/Podium.tsx`, `LeaderboardTable.tsx`, `TournamentMatchList.tsx` _(new)_ |

---

## 8. Success Metrics

1. An admin can enter a complete tournament (10+ matches, 8+ players) using the "on behalf of" mode without error.
2. All entered matches appear correctly in each participant's Command screen match history, Trajectory, and Matchups.
3. The tournament screen leaderboard correctly ranks players by wins, applies head-to-head tiebreakers, and displays the podium for the top 3.
4. The match list on the tournament screen is visually indistinguishable in style from the "Recent Matches" list on the Command screen.
5. Zero TypeScript errors (`npm run build` passes clean).
6. Existing tests continue to pass — no regression to the rating engine or match entry pipeline.

---

## 9. Open Questions

_None — all requirements have been clarified and agreed upon during the feature definition session._
