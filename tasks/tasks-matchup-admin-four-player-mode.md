## Relevant Files

- `app/(tabs)/stats/page.tsx` - Server component; reads session and passes `isAdmin` down to `StatsTabView`.
- `components/stats/StatsTabView.tsx` - Client wrapper; threads `isAdmin` prop through to `MatchupsClient`.
- `components/matchups/MatchupsClient.tsx` - Main client component; owns `adminMode` state, toggle UI, and API call logic.
- `components/matchups/PlayerPairSelector.tsx` - Player slot UI; extended with optional 4th slot and admin-mode labels.
- `components/matchups/ProjectionCard.tsx` - Result display; verify player-name fallback works correctly in admin mode.

### Notes

- No API changes required. `/api/matchup` already accepts 4 arbitrary player IDs (`player1`–`player4`).
- Admin detection uses `session.user.role === "admin"` — same pattern as `app/(tabs)/enter/page.tsx` line 35.
- Use `key={`slotName-${adminMode}`}` on each `PlayerSelector` to force re-mount (and clear input) on toggle — same pattern as Enter screen.
- There are no automated tests for these UI components; verify manually by logging in as admin and non-admin.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just each parent task.

---

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/matchup-admin-four-player-mode`

- [x] 1.0 Pass `isAdmin` from server to client components
  - [x] 1.1 In `app/(tabs)/stats/page.tsx`, read `isAdmin` from the session: `const isAdmin = session.user.role === "admin"`
  - [x] 1.2 Add `isAdmin={isAdmin}` to the `<StatsTabView>` JSX call
  - [x] 1.3 In `components/stats/StatsTabView.tsx`, add `isAdmin: boolean` to the `StatsTabViewProps` interface
  - [x] 1.4 Destructure `isAdmin` in the component function signature
  - [x] 1.5 Pass `isAdmin={isAdmin}` to `<MatchupsClient>` in the JSX

- [x] 2.0 Add admin toggle UI and state to `MatchupsClient`
  - [x] 2.1 Add `isAdmin: boolean` to the `MatchupsClientProps` interface
  - [x] 2.2 Destructure `isAdmin` in the component function signature
  - [x] 2.3 Add local state: `const [adminMode, setAdminMode] = useState(false)`
  - [x] 2.4 Add local state for the free Player 1 slot: `const [player1, setPlayer1] = useState<SlotPlayer | null>(null)`
  - [x] 2.5 Add `toggleAdminMode()` function that flips `adminMode` and resets all slots (`player1`, `partner`, `opp1`, `opp2`) to `null`
  - [x] 2.6 Render the toggle row when `isAdmin` is true, above `<PlayerPairSelector>`
  - [x] 2.7 Pass `adminMode={adminMode}` to `<PlayerPairSelector>`

- [x] 3.0 Extend `PlayerPairSelector` with 4th slot and admin-mode labels
  - [x] 3.1 Add `adminMode?: boolean` to the `PlayerPairSelectorProps` interface (default `false`)
  - [x] 3.2 Add `initialPlayer1?: SlotPlayer | null` to props for future pre-population support
  - [x] 3.3 Add `player1: SlotPlayer | null` to the `onChange` callback type signature
  - [x] 3.4 Add local state for Player 1
  - [x] 3.5 Update the `notify()` function to include `player1` in the `onChange` call
  - [x] 3.6 Partner slot label: `{adminMode ? "Player 2" : "Your Partner"}`
  - [x] 3.7 Opponents section label unchanged; card header pattern not applicable (no cards in this component)
  - [x] 3.8 In admin mode, render a `PlayerSelector` slot for Player 1 above the partner slot, labeled `"Player 1"`. Uses `key={`player1-${adminMode}`}`.
  - [x] 3.9 In admin mode, update the partner slot label from `"Your Partner"` to `"Player 2"`. Uses `key={`partner-${adminMode}`}`.
  - [x] 3.10 Ensure `excludeIds` passed to each `PlayerSelector` includes `player1?.id` when in admin mode

- [x] 4.0 Update `MatchupsClient` API call for admin mode
  - [x] 4.1 Update the `onChange` handler for `PlayerPairSelector` to also capture the `player1` value from the callback
  - [x] 4.2 Update the fetch URL construction: in admin mode use `player1.id` from state; in normal mode use `myPlayerId` as before
  - [x] 4.3 Update the "all slots filled" guard: in admin mode, require `player1` to be non-null before firing the fetch
  - [x] 4.4 Pass `myPlayerId` to `ProjectionCard` as-is (unchanged) — the card uses it only for "You" label logic

- [x] 5.0 Verify `ProjectionCard` output in admin mode
  - [x] 5.1 Read `components/matchups/ProjectionCard.tsx` — confirmed `displayName` shown when `myPlayerId !== player1.id`
  - [x] 5.2 No unconditional "You" rendering found — already conditional, no change needed
  - [ ] 5.3 Manual test as admin: enable toggle, fill all 4 slots, confirm result shows player names not "You"
  - [ ] 5.4 Manual test as non-admin: confirm toggle is not visible and screen behaves as before
  - [ ] 5.5 Manual test: navigate away and return — confirm admin toggle resets to off
