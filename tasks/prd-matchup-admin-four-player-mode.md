# PRD: Matchup Admin Four-Player Mode

## 1. Introduction / Overview

The Matchup Projection screen currently locks the logged-in user into Player 1 ("You"), leaving only 3 free slots (partner, opp1, opp2). This limits admins to matchup projections that always include themselves.

Since the Matchup tab is an exploratory analysis tool, admins should be able to compare **any four players freely** — not just combinations involving themselves. This is useful for tournament seeding, fair matchup planning, and ad-hoc analysis of player combinations the admin has never personally played in.

A toggle — visible only to admins — switches the screen into a 4-player free-selection mode where all four slots are open.

---

## 2. Goals

- Allow admin users to project win probability for any four-player combination, regardless of whether they are personally involved.
- Reuse the same admin toggle pattern already established on the Enter screen for UX consistency.
- Require zero changes to the existing `/api/matchup` endpoint (it already accepts 4 arbitrary player IDs).

---

## 3. User Stories

**As an admin**, I want to toggle "Analyze any four players" so that I can explore win probabilities for player combinations that don't include me.

**As an admin**, when I enable the toggle, I want all existing player slots to reset so I can start fresh with 4 freely chosen players.

**As an admin**, I want to see the projection result labeled with the players' actual names (e.g. "Alice & Bob — 62% WIN") so the output is meaningful without "You" being implied.

**As a regular user**, I want the Matchup tab to look and behave exactly as it does today — the toggle should be invisible to me.

---

## 4. Functional Requirements

1. The admin toggle row must only render when the current session user has `role === "admin"`.
2. The toggle label must read: **"Analyze any four players"**.
3. The toggle visual must be identical to the Enter screen toggle: `rounded-xl bg-zinc-800/60 px-4 py-3` container with a label and an emerald/zinc pill switch.
4. When the toggle is turned **on**, all existing player slots (partner, opp1, opp2) must be reset to null, and a new Player 1 slot must appear at the top of the player selector.
5. When the toggle is turned **off**, all four slots must be reset to null, and the screen returns to normal 3-slot mode (logged-in user implicit as Player 1).
6. The admin toggle state must reset to **off** whenever the user navigates away from the Matchup tab and returns.
7. In admin mode, the Team 1 card header must display **"Team 1"** (instead of "Your Partner"), mirroring the Enter screen's admin label pattern.
8. In admin mode, the Team 2 card header must display **"Team 2"** (instead of "Opponents").
9. In admin mode, slot labels inside the Team 1 card must be: **"Player 1"** (new free slot) and **"Player 2"** (the existing partner slot).
10. The matchup projection must not fire until all 4 slots are filled.
11. The `ProjectionCard` output must display player names (e.g. *"Alice & Bob — 62% WIN"*), not "You", when the logged-in user is not Player 1.
12. The `/api/matchup` endpoint must not be modified — it already accepts 4 arbitrary `player1`/`player2`/`player3`/`player4` IDs.

---

## 5. Non-Goals (Out of Scope)

- Long-press URL pre-population of `player1` param (can be added later).
- Chip-tap player assignment on the Matchup tab (deferred).
- Admin mode state persistence across page reloads or sessions.
- Any changes to the matchup projection algorithm or API.

---

## 6. Design Considerations

**Toggle placement:** Above `PlayerPairSelector`, at the top of the scrollable content area in `MatchupsClient` — same relative position as the Enter screen toggle.

**Slot structure (normal mode):**
| Slot | Label | Value |
|---|---|---|
| 1 | *(implicit: You)* | `myPlayerId` (hardcoded) |
| 2 | Your Partner | free |
| 3 | Opponent 1 | free |
| 4 | Opponent 2 | free |

**Slot structure (admin mode):**
| Slot | Label | Value |
|---|---|---|
| 1 | Player 1 | free |
| 2 | Player 2 | free |
| 3 | Opponent 1 | free |
| 4 | Opponent 2 | free |

**Projection result labeling:** `ProjectionCard` already falls back to `displayName` when `myPlayerId !== player1.id`. Verify the output reads naturally — e.g. *"Alice & Bob — 62% WIN"* rather than *"You — 62% WIN"*.

---

## 7. Technical Considerations

**API:** `/api/matchup?player1=&player2=&player3=&player4=` — fully team-agnostic, session only checked for auth. No changes needed.

**Admin detection:** `session.user.role === "admin"` — matches the pattern already used in `app/(tabs)/enter/page.tsx` (line 35).

**Files to modify:**

| File | Change |
|---|---|
| `app/(tabs)/stats/page.tsx` | Read `isAdmin` from session, pass to `StatsTabView` |
| `components/stats/StatsTabView.tsx` | Add `isAdmin` prop, pass to `MatchupsClient` |
| `components/matchups/MatchupsClient.tsx` | Add `isAdmin` prop, local `adminMode` state, toggle UI, updated API call |
| `components/matchups/PlayerPairSelector.tsx` | Add `adminMode` prop, 4th slot when active, extended `onChange` |
| `components/matchups/ProjectionCard.tsx` | Verify display-name fallback renders correctly in admin mode |

**Key implementation pattern (from Enter screen):**
- Use `key={`slotName-${adminMode}`}` on each `PlayerSelector` to force re-mount and clear inputs on toggle.
- `toggleAdminMode()` sets `adminMode` opposite value and resets all slot state to `null`.

---

## 8. Success Metrics

- Admin users can generate a matchup projection for any 4-player combination without themselves being one of the players.
- Regular users see no change to the Matchup tab UI or behaviour.
- The `ProjectionCard` displays player names (not "You") correctly when the logged-in user is not Player 1.
- Navigating away and back resets the toggle to off.

---

## 9. Open Questions

- Should `ProjectionCard` show a small "Team 1 vs Team 2" header label in admin mode to make it clearer which team the win % applies to? (Currently it only shows the percentage and player names.)
