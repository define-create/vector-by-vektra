## Relevant Files

- `components/enter/PlayerSelector.tsx` - Main component to extend with disambiguation state and warning UI.
- `components/enter/PlayerSelector.test.tsx` - Unit tests for PlayerSelector disambiguation behaviour.
- `app/(tabs)/enter/page.tsx` - EnterPage: wires `confirmedNew` prop and updates `canProceed` logic.

### Notes

- Unit tests should typically be placed alongside the code files they are testing.
- Use `npx jest [optional/path/to/test/file]` to run tests.
- `PlayerSelector` is a controlled component — disambiguation state must be surfaced to the parent so `canProceed` can gate the Next button.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Already on `feature/improvements-02` — no new branch needed; skip this task.

- [x] 1.0 Extend PlayerSelector with disambiguation state
  - [x] 1.1 Add a `onDisambiguated?: (confirmed: boolean) => void` callback prop to `PlayerSelectorProps` so the parent can track whether each slot is "clear to proceed".
  - [x] 1.2 Add local state `matchWarning: Player[]` (players returned by last search when user has a name-only value) and `confirmedNew: boolean` (user explicitly chose "create new").
  - [x] 1.3 In the existing search `useEffect`, after results arrive: if `isSelectedRef.current` is false (name-only), store the results in `matchWarning`; if results are empty, clear `matchWarning`.
  - [x] 1.4 Add an `onBlur` handler to the `<input>` that fires `onDisambiguated` with `false` when `matchWarning.length > 0` and `confirmedNew` is false, and with `true` otherwise.
  - [x] 1.5 Reset `matchWarning` and `confirmedNew` to their initial values whenever `clearSelection` is called or the input value changes (i.e., inside `handleInputChange`).
  - [x] 1.6 When a player is selected from the dropdown (`selectPlayer`), clear `matchWarning`, set `confirmedNew` to false, and call `onDisambiguated(true)`.
  - [x] 1.7 When "No, create new player" is clicked, set `confirmedNew` to true and call `onDisambiguated(true)`.

- [x] 2.0 Render the "did you mean" warning UI in PlayerSelector
  - [x] 2.1 Below the existing `{value && !value.id && value.name && <p ...>New player — shadow profile will be created</p>}` line, add a conditional block: render only when `matchWarning.length > 0 && !confirmedNew && value && !value.id`.
  - [x] 2.2 Inside the warning block render an amber container (`border-amber-800/60 bg-amber-900/10`) with the heading: *"Players with this name already exist — is one of them the person you mean?"*
  - [x] 2.3 List each player in `matchWarning`: show `displayName`, match count, and rating. Each row has a **"Select"** button that calls `selectPlayer(p)` (reuses existing function — closes dropdown, sets ID).
  - [x] 2.4 Add a **"No, this is a new player"** text link below the list that sets `confirmedNew = true` and calls `onDisambiguated(true)`. After confirming, the amber block disappears and the existing amber "New player — shadow profile will be created" text remains as before.
  - [x] 2.5 Suppress the `open` dropdown while the warning block is visible (set `open` to false when `matchWarning.length > 0 && !confirmedNew`) so the dropdown and warning don't overlap.

- [x] 3.0 Wire confirmation into EnterPage's canProceed logic
  - [x] 3.1 In `EnterPage`, add state to track per-slot disambiguation status: `partnerOk`, `opponent1Ok`, `opponent2Ok` (booleans, default `true`). In admin mode add `team1Player1Ok` too.
  - [x] 3.2 Pass `onDisambiguated` callbacks to each `<PlayerSelector>` that update the corresponding `*Ok` state variable.
  - [x] 3.3 Reset each `*Ok` flag to `true` when the corresponding player value is cleared (onChange receives `null`).
  - [x] 3.4 In `canProceed()`, for the `"partner"` case add `&& partnerOk` (and `&& team1Player1Ok` in admin mode); for `"opponents"` add `&& opponent1Ok && opponent2Ok`.
  - [x] 3.5 Verify the Next button remains enabled when a player is selected via the dropdown (has an `id`) — `onDisambiguated(true)` is called by `selectPlayer`, so `*Ok` is `true`.

- [x] 4.0 Write unit tests
  - [x] 4.1 Create `components/enter/PlayerSelector.test.tsx`. Mock `fetch` to return a list of matching players.
  - [x] 4.2 Test: typing a name and blurring without selecting renders the amber warning block with player names listed.
  - [x] 4.3 Test: clicking "Select" on a warning-block player calls `onChange` with `{ id, name }` and hides the warning.
  - [x] 4.4 Test: clicking "No, this is a new player" hides the warning block and leaves value as name-only.
  - [x] 4.5 Test: typing then clearing the input hides the warning block.
  - [x] 4.6 Test: when search returns no results, the warning block is not shown (only the existing "No match" dropdown entry appears).
  - [x] 4.7 Run all tests: `npx jest components/enter/PlayerSelector` — all should pass.

- [ ] 5.0 Manual smoke test & polish
  - [ ] 5.1 Open the Enter screen. Type a name that matches an existing player but do NOT click the result — click away (blur). Confirm the amber warning appears listing the existing player(s).
  - [ ] 5.2 Click "Select" on one of the listed players. Confirm the warning disappears, the green "✓ Name · Rating · matches" indicator appears, and Next becomes enabled.
  - [ ] 5.3 Click "No, this is a new player". Confirm the warning disappears, the amber "New player — shadow profile will be created" text appears, and Next is enabled.
  - [ ] 5.4 Type a name that has no existing players. Confirm no warning block appears, only the existing "No match — will create a shadow profile" dropdown item.
  - [ ] 5.5 Test the Opponents step with the same scenarios to confirm both opponent slots behave identically.
  - [ ] 5.6 In admin mode, test Team 1 Player 1 slot as well.
  - [ ] 5.7 Submit a match with a confirmed-new name — confirm it creates a shadow profile as before (no regression).
