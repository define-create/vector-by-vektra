# PRD: Type Match Entry (Freeform Text Mode on /enter)

## 1. Introduction / Overview

Players using Vector by Vektra currently transcribe match scores from notes or chat threads into the app one field at a time. This feature adds a **"Type match" mode** to the existing `/enter` screen. The user types a match result as a single natural sentence (e.g. `Jordan & Mike defeated Sam & Taylor 11-7 #League`). A client-side parser pre-fills the existing match form, and the user submits through the unchanged flow.

**The parse panel writes nothing to the database.** It is a pure form-filler. All player disambiguation, duplicate detection, and submission logic remain exactly as they are today.

---

## 2. Goals

1. Reduce the number of taps/interactions needed to enter a match by allowing a single typed sentence to populate all form fields at once.
2. Guide the user while they type with a live ghost-hint overlay so they always know what to type next — no separate instructions needed.
3. Introduce zero new API routes, zero new dependencies, and zero changes to the existing submission path.

---

## 3. User Stories

- **As a player**, I want to type a match result as a sentence so that I can enter it faster than filling in four separate player fields.
- **As a player**, I want to see a hint showing what I still need to type so that I never have to remember the format.
- **As a player**, I want the form to be pre-filled from my typed sentence so that I can review it, fix any player name ambiguities, and submit with confidence.
- **As an admin**, I want the existing admin-mode toggle and disambiguation UI to work identically after a text entry populates the form.

---

## 4. Functional Requirements

### 4.1 Mode toggle
1. The `/enter` page must display a toggle row labelled **"Switch to text mode"**, styled identically to the existing "Enter on behalf of players" admin toggle (same `rounded-xl bg-zinc-800/60 px-4 py-3` card row, same switch component).
2. For non-admin users this is the only toggle row. For admin users it appears as a second row directly below the "Enter on behalf of players" row.
3. The toggle must default to **off** (manual mode) on every page load.
4. Turning the toggle on activates "Type match" mode; turning it off returns to manual mode. Both directions must reset all form state (players, scores, outcome, tag) — same behaviour as the admin toggle.

### 4.2 "Type match" panel
4. When "Switch to text mode" is on, the player-slot fields and score input must be hidden and replaced by the `MatchTextInput` component (ghost-hint textarea).
5. Directly above the textarea, the panel must display the static instruction line **"Type your match, follow the hints"** in a muted style (e.g. `text-xs text-zinc-500`) that is visually connected to the ghost hint below it — making clear the hints are inside the textarea.
6. The panel must display **OK** and **Cancel** buttons below the textarea.
7. The OK button must be disabled (or visually inactive) until the textarea contains at least one non-whitespace character.
8. The Cancel button must always be enabled and must turn the toggle off (returning to manual mode) without changing any form state.
9. On OK press, the system must run `parseMatchText(text)`:
   - **On success:** populate the form state with the parsed values and turn the toggle off (returning to manual mode).
   - **On failure:** display a descriptive inline error message below the textarea and remain in text mode.

### 4.3 Accepted input format
8. The parser must accept sentences matching the pattern:
   ```
   Player1 & Player2  <verb>  Player3 & Player4  <score>  [#tag]
   ```
9. Accepted win verbs (team1 wins): `beat`, `defeated`, `def`, `d.`
10. Accepted loss verbs (team1 loses): `lost to`, `fell to`
11. Score format: `\d+-\d+` (e.g. `11-7`). Exactly one game score per entry.
12. Tag: optional `#word` at the end of the sentence (e.g. `#League`, `#SundayFunday`).
13. Player-name separators: `&` or `and`.
14. The parser must be case-insensitive for verbs and separators.

### 4.4 Ghost-hint overlay (`MatchTextInput` component)
15. The textarea must display ghost hint text showing the remaining unfilled tokens of the template, rendered in a muted colour behind the user's input.
16. The full initial hint must be: `Player1 & Player2 defeated Player3 & Player4 11-7 #tag`
17. The hint must advance **only when a hard separator is detected** in the typed text (no mid-word flicker):

    | User has typed past… | Remaining hint shows… |
    |---|---|
    | Nothing | `Player1 & Player2 defeated Player3 & Player4 11-7 #tag` |
    | First `&` | `Player2 defeated Player3 & Player4 11-7 #tag` |
    | Win/loss verb | `Player3 & Player4 11-7 #tag` |
    | Second `&` | `Player4 11-7 #tag` |
    | Score pattern | `#tag` (faded — optional) |
    | `#` | `tag` |

18. The ghost layer must use identical `font`, `font-size`, `line-height`, `padding`, and `letter-spacing` as the textarea so text alignment is pixel-accurate.
19. The ghost layer must be non-interactive (`pointer-events: none`).

### 4.5 Form population
20. On a successful parse, the system must map fields as follows:

    | Parsed value | Form field populated |
    |---|---|
    | `team1[0]` | `team1Player1Name` |
    | `team1[1]` | `partnerName` |
    | `team2[0]` | `opponent1Name` |
    | `team2[1]` | `opponent2Name` |
    | `outcome` | `outcome` (`"win"` or `"loss"`) |
    | `game` | `games` array (single entry) |
    | `tag` (if present) | `tag` |

21. After population, the existing form's player disambiguation UI must activate as normal (e.g. if "Alex" matches two players, the existing dropdown/conflict UI appears).
22. The user must be able to edit any pre-filled field before submitting.

### 4.6 Submission
23. Submission must use the existing `POST /api/matches` route with no changes.
24. `findOrCreateShadowPlayer`, duplicate fingerprint detection, and anomaly detection must all operate identically to the manual entry path.

---

## 5. Non-Goals (Out of Scope)

- **Multiple matches in one entry** — one sentence = one match. If the user types two matches, only the first is parsed.
- **LLM / AI parsing** — the parser is purely deterministic regex/string logic. No external API calls.
- **Bulk import / `/import` route** — that is a separate future feature (Option D in the friction-reduction plan).
- **Voice entry** — out of scope for this feature.
- **New API routes** — this feature adds no new backend endpoints.
- **Changes to admin match edit/void** — unaffected.

---

## 6. Design Considerations

- The "Switch to text mode" toggle row must be visually identical to the "Enter on behalf of players" row: `rounded-xl bg-zinc-800/60 px-4 py-3`, same switch component (green when on, zinc when off).
- The instruction line "Type your match, follow the hints" sits immediately above the textarea in `text-xs text-zinc-500`, making clear the hints appear inside the box below.
- The ghost hint text colour should be `zinc-600` (muted, clearly secondary to the user's input).
- The inline error message should use the same error styling already present on the form (rose background, rose text, small size).
- The textarea should be single-line in appearance but allow overflow — the expected input is short (one sentence).
- OK and Cancel buttons sit side by side below the textarea, styled consistently with other secondary actions on the page (Cancel: bordered/ghost; OK: filled zinc, turns emerald when parse succeeds).

---

## 7. Technical Considerations

- **New files:**
  - `lib/import/parse-match.ts` — pure TypeScript function, no dependencies. Exports `parseMatchText(text: string): ParseResult`.
  - `components/MatchTextInput.tsx` — React client component. Props: `value`, `onChange`. Renders the ghost-hint overlay.
- **Modified files:**
  - `app/(tabs)/enter/page.tsx` — adds `entryMode` state, mode toggle, "Type match" panel, and populate-on-OK logic.
- **No changes to:** `app/api/matches/route.ts`, `lib/services/players.ts`, `prisma/schema.prisma`.
- **No new npm dependencies.**
- The parser must be covered by unit tests in `lib/import/parse-match.test.ts` for the happy path and key error cases.

---

## 8. Success Metrics

- A user can enter a complete match (4 players, 1 score, optional tag) with a single typed sentence and zero field-by-field interactions.
- The ghost hint correctly advances on every hard separator — verified manually and via component tests.
- Zero regressions in the existing manual entry flow (disambiguation, duplicate detection, submission).
- Parse errors return a message specific enough that the user knows exactly what is missing (e.g. "Couldn't find a score — expected a format like 11-7").

---

## 9. Open Questions

- Should the mode toggle remember the user's last choice across sessions (localStorage), or always default to `Enter manually`? Current plan: always default to `Enter manually`.
- Should the textarea auto-submit on Enter key (if parse succeeds), or require an explicit OK button tap? Current plan: explicit OK button only.
