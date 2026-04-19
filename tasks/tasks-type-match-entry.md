## Relevant Files

- `lib/import/parse-match.ts` - New pure TypeScript parser function. Exports `parseMatchText(text): ParseResult`. No dependencies.
- `lib/import/parse-match.test.ts` - Unit tests for the parser (happy path + key error cases).
- `components/MatchTextInput.tsx` - New React client component. Ghost-hint overlay textarea. Props: `value`, `onChange`.
- `app/(tabs)/enter/page.tsx` - Modified to add `entryMode` state, "Switch to text mode" toggle row, "Type match" panel, and populate-on-OK logic.

### Notes

- Unit tests should be placed alongside the source file: `lib/import/parse-match.ts` and `lib/import/parse-match.test.ts` in the same directory.
- Use `npx jest lib/import/parse-match.test.ts` to run parser tests only, or `npx jest` to run all tests.
- The parser is a pure function — no React, no DOM, no side effects. Test it independently of the UI.
- Do NOT modify `app/api/matches/route.ts`, `lib/services/players.ts`, or `prisma/schema.prisma`.
- No new npm dependencies allowed.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

---

## Tasks

- [x] 1.0 Build the deterministic parser
  - [x] 1.1 Create directory `lib/import/` if it doesn't exist
  - [x] 1.2 Create `lib/import/parse-match.ts` and define the `ParsedMatch` and `ParseResult` types
  - [x] 1.3 Implement verb detection — build a regex that matches all win verbs (`beat`, `defeated`, `def`, `d.`) and loss verbs (`lost to`, `fell to`), case-insensitive, and captures which side of the verb is team1 vs team2
  - [x] 1.4 Implement team splitting — split each side of the verb on `&` or `and` (case-insensitive) to extract two player names per team; trim whitespace from each name
  - [x] 1.5 Implement score extraction — find `\d+-\d+` in the right-hand side; return descriptive error `"Couldn't find a score — expected a format like 11-7"` if missing
  - [x] 1.6 Implement optional tag extraction — find `#(\S+)` anywhere after the score; omit `tag` from result if not present
  - [x] 1.7 Wire up `parseMatchText(text: string): ParseResult` — call steps in order, return `{ ok: true, match }` or `{ ok: false, error }` with a specific message for each failure case
  - [x] 1.8 Verify the function compiles with no TypeScript errors (`npx tsc --noEmit`)

- [x] 2.0 Write unit tests for the parser
  - [x] 2.1 Create `lib/import/parse-match.test.ts`
  - [x] 2.2 Happy path — win verb: `"Jordan & Mike defeated Sam & Taylor 11-7 #League"` → correct `team1`, `team2`, `outcome: "win"`, score, tag
  - [x] 2.3 Happy path — loss verb: `"Sam & Taylor lost to Jordan & Mike 11-7"` → `outcome: "loss"`, no tag (tag is optional)
  - [x] 2.4 Happy path — `and` separator: `"Jordan and Mike def Sam and Taylor 11-7"` → parses correctly
  - [x] 2.5 Happy path — abbreviated verb `d.`: `"Jordan & Mike d. Sam & Taylor 11-7"` → `outcome: "win"`
  - [x] 2.6 Happy path — `fell to` verb: `"Sam & Taylor fell to Jordan & Mike 11-7 #Sunday"` → `outcome: "loss"`
  - [x] 2.7 Error case — missing score → error contains `"score"`
  - [x] 2.8 Error case — missing verb → error contains `"verb"` or `"couldn't find"`
  - [x] 2.9 Error case — only one player name on a team (missing `&` or `and`) → descriptive error
  - [x] 2.10 Run `npx jest lib/import/parse-match.test.ts` and confirm all tests pass

- [x] 3.0 Build the `MatchTextInput` ghost-hint overlay component
  - [x] 3.1 Create `components/MatchTextInput.tsx` as a `"use client"` component with props `value: string` and `onChange: (v: string) => void`
  - [x] 3.2 Implement `getHintStage(text: string)` — returns the current stage (0–5) based on which hard separators have been detected in the typed text (first `&`, verb, second `&`, score pattern, `#`)
  - [x] 3.3 Define the hint strings for each stage matching the PRD table:
    - Stage 0 (nothing): `Player1 & Player2 defeated Player3 & Player4 11-7 #tag`
    - Stage 1 (past first `&`): `Player2 defeated Player3 & Player4 11-7 #tag`
    - Stage 2 (past verb): `Player3 & Player4 11-7 #tag`
    - Stage 3 (past second `&`): `Player4 11-7 #tag`
    - Stage 4 (past score): `#tag` (styled as optional/faded)
    - Stage 5 (past `#`): `tag`
  - [x] 3.4 Render the wrapper `<div>` with `position: relative` containing:
    - Ghost `<div>` (absolute, behind): `pointer-events: none`, text = user's typed value (transparent) + hint remainder (zinc-600)
    - `<textarea>` (on top): `background: transparent`, forwards `value` and `onChange`
  - [x] 3.5 Ensure textarea and ghost div share identical Tailwind classes for `font`, `text-sm`, `leading`, `p-3`, `tracking` (pixel-accurate alignment)
  - [ ] 3.6 Verify the component renders without errors in the Next.js dev server

- [x] 4.0 Integrate into the `/enter` page
  - [x] 4.1 Read `app/(tabs)/enter/page.tsx` to understand current state shape (`team1Player1Name`, `partnerName`, `opponent1Name`, `opponent2Name`, `outcome`, `games`, `tag`) and the existing `toggleAdminMode` reset pattern
  - [x] 4.2 Add three new state variables: `entryMode` (`"manual" | "text"`, default `"manual"`), `parseText` (`""`) and `parseError` (`null`)
  - [x] 4.3 Add a `resetTextMode()` helper that clears `parseText` and `parseError`
  - [x] 4.4 Add the "Switch to text mode" toggle row — styled identically to the "Enter on behalf of players" row (`rounded-xl bg-zinc-800/60 px-4 py-3`, same `<Switch>` component). For admin users place it directly below the admin toggle row; for non-admin users it is the only toggle row. Toggling in either direction calls the existing form reset logic AND `resetTextMode()`
  - [x] 4.5 Conditionally hide the player-slot fields and score input when `entryMode === "text"`
  - [x] 4.6 Render the "Type match" panel when `entryMode === "text"`:
    - Instruction line: `"Type your match, follow the hints"` (`text-xs text-zinc-500`)
    - `<MatchTextInput value={parseText} onChange={setParseText} />`
    - Inline rose-style error when `parseError` is set
    - OK button (disabled when `parseText.trim() === ""`, filled zinc / turns emerald on valid content)
    - Cancel button (bordered/ghost, always enabled)
  - [x] 4.7 Implement OK handler: call `parseMatchText(parseText)`; on success populate all form state fields and set `entryMode = "manual"`; on failure set `parseError`
  - [x] 4.8 Implement Cancel handler: set `entryMode = "manual"` and call `resetTextMode()` — do NOT touch other form state
  - [x] 4.9 Import `parseMatchText` from `lib/import/parse-match` and `MatchTextInput` from `components/MatchTextInput`
  - [x] 4.10 Verify TypeScript compiles with no errors (`npx tsc --noEmit`)

- [ ] 5.0 Manual verification & regression check
  - [ ] 5.1 Start the dev server (`npm run dev`) and open `/enter`
  - [ ] 5.2 Confirm "Switch to text mode" toggle row appears; defaults OFF; toggling ON shows the text panel (player fields hidden)
  - [ ] 5.3 Type `"Jordan & Mike defeated Sam & Taylor 11-7 #League"` — verify ghost hint advances at each separator
  - [ ] 5.4 Press OK — verify form switches to manual mode, pre-filled with correct players, score 11-7, tag "League", outcome WIN
  - [ ] 5.5 Try an ambiguous name (e.g. a first name shared by two players) — verify existing disambiguation dropdown appears as normal
  - [ ] 5.6 Submit the pre-filled form — verify match is created correctly via the existing route
  - [ ] 5.7 Type an invalid string (e.g. `"Jordan & Mike defeated Sam & Taylor"` — no score) — verify rose error message appears, text mode stays active
  - [ ] 5.8 Press Cancel — verify returns to manual mode with form state unchanged
  - [ ] 5.9 Toggle text mode on then off — verify all form fields are reset (same as toggling admin mode)
  - [ ] 5.10 For admin users: verify both toggle rows appear stacked, admin toggle still works correctly
  - [ ] 5.11 Run all unit tests (`npx jest`) and confirm no regressions
