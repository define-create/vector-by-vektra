# Goal: Optimum UX for the Enter Match screen

**Status:** OPEN — runs until the user declares satisfaction.
**Started:** 2026-06-10
**Latest mockup:** `mockups/enter-match-redesigns-v3.html` (awaiting verdicts)
**Live screen:** `app/(tabs)/enter/page.tsx` (+ `components/enter/PlayerSelector.tsx`, `components/enter/GameScoreInput.tsx`, `components/MatchTextInput.tsx`)
**Mockups:** `mockups/enter-match-redesigns-v1.html` (preserved), `mockups/enter-match-redesigns-v2.html` (current)

## How this goal works

Any session picking up this goal must read this file first. The loop:

1. User reviews the latest mockup in a browser and gives verdicts (rough is fine —
   "layout B but the score block from D" counts).
2. Record verdicts in the **Decision log** below; never re-litigate locked or
   rejected items.
3. Produce the next mockup version `mockups/enter-match-redesigns-vN.html`
   targeting the **Open questions**; preserve previous versions. Put competing
   treatments of an open question side-by-side when possible.
4. Repeat. When the decision log stops growing and the user approves a version,
   flip to implementation: port the winning design into `app/(tabs)/enter/page.tsx`,
   verify against the success criteria, then mark this goal CLOSED with the
   winning version noted.

## Success criteria (draft — confirm/refine with user)

- [ ] Common case (self + 3 known players, single game, default tag) entered in
      minimal taps — measurably fewer than the current screen.
- [ ] Score entry usable one-handed on a phone.
- [ ] Outcome (who won) is always unambiguous at a glance before submitting.
- [ ] Editing any field after filling it never loses other state (existing
      behavior — must not regress; see commit e45047d).
- [ ] Recent-players chip strip remains the fast path for player fill
      (commits 1948b45, 25f4657 — must not regress).
- [ ] Text mode, default tag ("MM/DD · Name"), duplicate-match warning,
      new-player banner, and submit-button reveal all survive the redesign.

## Decision log

### Locked (approved — never regress)
- Recent-players chip strip as the primary fill mechanism; chips target the
  focused slot first (current screen behavior).
- Default tag prefill `MM/DD · <displayName>`, skipped in admin mode.
- Text-entry mode toggle (free-text parse) stays available.
- Duplicate-match warning flow (warn / cancel / proceed).
- Submit button reveals/scrolls into view once the form is complete.
- v2 direction: variant D lost its "Step 1/2/3" labels (v1 → v2 change) —
  step labels rejected.
- v2 direction: "Baseline+patches" variant dropped after v1.

### Direction (current bets, set by v2 verdicts — 2026-06-11)
- **A · Sentence → repositioned as the text mode.** Not the main manual layout;
  it's the candidate replacement for the free-text parse mode. Explore further.
- **B · Scorecard → the leading manual layout**, contingent on adding a
  single-tap winner/loser control (v2-B's passive colored edge wasn't enough).

### Rejected (tried and declined — do not reintroduce)
- Step-numbered wizard labels in the score-first flow (v1 variant D).
- Winner shown *only* by a passive colored edge with no tap control (v2-B) —
  user requires a single-tap outcome affordance.

### Open questions (next version targets these)
1. **Which single-tap winner control for the scorecard?** v3-B1 (trophy button
   on each team row, inside the card) vs v3-B2 ("We won / They won" chips below
   the card, borrowed from v2-D). Both are interactive in v3 — tap to compare.
2. **Sentence-as-text-mode (v3-A): replace the free-text parser entirely, or
   become a third mode alongside it?** Replacement removes parse-error risk but
   drops paste-a-whole-message entry.
3. **D · Score-first:** no verdict given on v2 — treat as dropped, or does any
   part of it (beyond the outcome chips now in B2) survive?
4. Multi-game entry: all variants are single-game. Does the winning layout
   need a multi-game affordance, or is single-game + current screen's game list
   enough?
5. Steppers vs keyboard-only for scores.
6. Where does the Event/tag block sit — always visible (current), collapsed by
   default, or post-submit?

## Iteration history

| Version | What it explored | Verdict |
|---|---|---|
| v1 | 4 variants: Baseline+patches, A · Sentence, B · Scorecard, D · Score-first (with step labels) | Baseline dropped; step labels dropped; A/B/D carried to v2 |
| v2 | A · Sentence, B · Scorecard, D · Score-first — refined, no step labels, neutral team labels in B | A: interesting as a *text mode* — explore further. B: interesting concept but missing a single-tap winner/loser control. D: no verdict. |
| v3 | A · Sentence repositioned as the text-mode replacement; B1 · Scorecard + trophy tap per row; B2 · Scorecard + "We won / They won" chips (interactive winner toggles) | **Awaiting user verdicts** |

## Notes

- The live screen already had a round of incremental UX fixes (commits b58c48d,
  ee05022, e45047d, 4d742e4, 1948b45, 11ce791) — the mockup track is about the
  next structural leap, not those patches.
- Use `/prototype` if an open question needs interactive feel (tap targets,
  stepper ergonomics) that static HTML can't answer.
