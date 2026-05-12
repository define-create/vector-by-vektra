## Relevant Files

- `app/(tabs)/enter/page.tsx` - Main enter match page; contains `assignChip`, `focusedSlot` state, and the tag panel render logic. All changes are in this file.

### Notes

- No new files need to be created.
- No API routes are affected.
- Manual browser testing is the verification method (no automated tests exist for this screen).

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Create and checkout a new branch: `git checkout -b fix/enter-chip-order-tag-panel`

- [x] 1.0 Fix chip assignment — replace split sequential fallback with linear loop
  - [x] 1.1 Read `app/(tabs)/enter/page.tsx` lines 283–326 (`assignChip` function) to confirm current structure before editing
  - [x] 1.2 Delete the existing sequential fallback block (lines ~307–326): the two separate if/else branches for admin/non-admin team-1 slots and the shared opponent checks below them
  - [x] 1.3 Replace with a single `order` array + `for` loop that walks all slots in sequence:
        - Non-admin order: `partner → opponent1 → opponent2`
        - Admin order: `team1Player1 → partner → opponent1 → opponent2`
        - For each slot: if empty (`!val?.id && !val?.name`), call its setter, call `setOk(true)`, call `setFlashSlot(key)`, and return
  - [x] 1.4 Leave the focused-field block at the top of `assignChip` (lines ~287–305) completely unchanged — it already correctly fills the focused slot when empty and falls through when the slot is filled

- [x] 2.0 Fix tag panel — prevent collapse when clearing tag text
  - [x] 2.1 Read the tag section render in `app/(tabs)/enter/page.tsx` (lines ~700–765) to locate the inner ✕ clear button's `onClick`
  - [x] 2.2 Update the clear button `onClick` from:
        `() => { setTag(""); setTagTouched(true); }`
        to:
        `() => { setTag(""); setTagExpanded(true); setTagTouched(true); }`
  - [x] 2.3 Confirm the "- close" button `onClick` still calls `setTagExpanded(false)` — no change needed there

- [ ] 3.0 Verify fixes in browser
  - [ ] 3.1 **Chip — no field focused:** open /enter, tap chips without focusing any input → confirms partner fills first, then opponent1, then opponent2
  - [ ] 3.2 **Chip — user focuses a field:** tap into opponent1 input, then tap a chip → confirms opponent1 is populated; tap next chip without focusing → confirms partner fills next (not opponent2)
  - [ ] 3.3 **Chip — focused field already filled:** fill opponent1, re-focus it, tap chip → confirms partner (next empty in order) is filled, not opponent1 again
  - [ ] 3.4 **Chip — admin mode:** toggle admin mode, tap into opponent2, tap chip → fills opponent2; subsequent chips with no focus fill team1Player1 → partner → opponent1 in order
  - [ ] 3.5 **Tag — clear after default:** load /enter (tag auto-filled with default), click ✕ → panel stays open with empty input
  - [ ] 3.6 **Tag — clear after submit reset:** submit a match, click "Enter another match" (default tag re-appears), click ✕ → panel stays open
  - [ ] 3.7 **Tag — close button still works:** click "- close" → panel collapses correctly
