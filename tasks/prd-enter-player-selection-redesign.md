# PRD: Enter Screen — Player Selection Redesign

## 1. Introduction / Overview

The current Enter screen shows a horizontal strip of recent-player chips **above every individual player input field**, causing the same names to repeat 3–4 times and consuming significant vertical space. This PRD describes a redesign that consolidates those chips into a **single shared strip** at the top of the player section, groups player slots visually into two teams, and provides clear feedback when a chip fills a slot.

**Goal:** Reduce visual clutter, make the form feel like a natural doubles-match setup, and keep the one-tap convenience of recent-player chips.

---

## 2. Goals

1. Show recent-player chips **once** instead of once per player slot.
2. Group player input slots into **Team 1** and **Team 2** with clear visual separation matching a doubles-match layout.
3. Give unambiguous feedback showing **which slot was just filled** when a chip is tapped.
4. Hide the chip strip automatically when all slots are filled; restore it if a player is removed.

---

## 3. User Stories

- **As a player entering a match**, I want to tap a recent player's chip once to quickly fill a slot, so I don't have to type names I use regularly.
- **As a player**, I want to see who is on each team clearly before submitting, so I can confirm the match details at a glance.
- **As a player**, when I tap a chip, I want an immediate visual signal telling me which slot was filled, so I know I didn't make a mistake.
- **As an admin** entering a match on behalf of others, I want the same chip strip behaviour, so the form stays efficient with four player slots.

---

## 4. Functional Requirements

### 4.1 Shared Recent-Player Chip Strip

1. The chip strip **must** appear as a single horizontal scrollable row above the team groupings (not inside individual player selectors).
2. The strip **must** show up to 10 recent players, deduplicated and sorted by most-recent interaction.
3. Players already assigned to any slot **must** be filtered out of the strip in real time.
4. When all player slots are filled the strip **must** disappear entirely.
5. When a filled slot is cleared (player deleted), the strip **must** reappear, showing available recent players again.
6. The strip **must** have a hidden scrollbar (`[scrollbar-width:none]`) and support horizontal touch/mouse scrolling.

### 4.2 Chip-Tap Assignment Logic

7. Tapping a chip **must** fill the **next empty slot** in top-to-bottom order:
   - Quick mode: Partner → Opponent 1 → Opponent 2
   - Admin mode: Team 1 Player 1 → Team 1 Player 2 → Team 2 Player 1 → Team 2 Player 2
8. If no empty slot exists when a chip is tapped, the tap **must** be ignored (this case should not occur because the strip disappears when full, per requirement 4).

### 4.3 Visual Feedback on Chip Tap

9. When a chip fills a slot, the border of that player input **must** briefly flash emerald (`ring-2 ring-emerald-400`) for approximately 600 ms, then return to its normal style.
10. The existing confirmation indicator below the input (`✓ Name · Rating · N matches`) **must** appear immediately and remain visible as the persistent confirmation.
11. No toast/overlay notification is required — the flash + indicator is sufficient.

### 4.4 Team Grouping Layout

12. Player slots **must** be visually grouped into two team cards:
    - **Team 1** card: contains "Your partner" slot (and "Team 1 Player 1" in admin mode).
    - **Team 2** card: contains "Opponent 1" and "Opponent 2" slots.
13. The two team cards **must** be visually separated — a clear divider (e.g. `VS` label, horizontal rule, or spacing/border) between them to reflect a doubles-match layout.
14. Each card **must** have a header label ("YOUR TEAM" / "OPPONENTS" in quick mode; "TEAM 1" / "TEAM 2" in admin mode).
15. The card backgrounds **must** visually distinguish Team 1 from Team 2 (e.g. subtle tint or border colour difference).

### 4.5 PlayerSelector Component Changes

16. The `recentPlayers` prop and the chip row rendered inside `PlayerSelector` **must** be removed.
17. `PlayerSelector` **must** accept an optional `flashConfirm` boolean prop. When `true`, the component plays the emerald border flash animation (requirement 9), then resets it.
18. All other `PlayerSelector` behaviour (search, disambiguation warning, new-player indicator, clear button) **must** remain unchanged.

### 4.6 Admin Mode

19. In admin mode the chip strip behaviour **must** be identical to quick mode (single strip, next-empty-slot order per requirement 8, same disappear/reappear rules).
20. The team cards in admin mode **must** each show two player slots.

---

## 5. Non-Goals (Out of Scope)

- No change to the search dropdown, disambiguation warning, or new-player-shadow-profile flow inside `PlayerSelector`.
- No drag-and-drop or manual slot targeting when tapping a chip.
- No change to `OutcomeToggle`, `GameScoreInput`, the tag input, or the submit button.
- No change to the Steps mode (already removed) or admin-mode toggle.
- No server-side changes; the `/api/players/recent` endpoint is used as-is.
- No separate chip strips per team (one global strip only).

---

## 6. Design Considerations

- **Chip style** (unchanged): `rounded-full bg-zinc-700 px-3 py-1 text-base text-zinc-200 hover:bg-zinc-600 active:bg-zinc-500`
- **Flash animation**: CSS transition on `box-shadow` / `ring`; duration ~600 ms; implemented via a short-lived state boolean in `PlayerSelector`.
- **Team card**: `rounded-2xl border border-zinc-700/60 bg-zinc-800/40 px-4 py-4 flex flex-col gap-4`
- **VS divider**: centred `VS` label in `text-xs font-bold tracking-widest text-zinc-600`, with horizontal lines either side.
- **Team 1 accent** (YOUR TEAM): subtle `border-emerald-800/30` tint to hint at "your side".
- **Team 2 accent** (OPPONENTS): default zinc border — no colour accent.
- Existing `gap-8` spacing between major form sections is retained.

---

## 7. Technical Considerations

- **`app/(tabs)/enter/page.tsx`**: Add shared chip strip above team cards. Track `recentAll` (merged, deduplicated, filtered) derived from existing `recentPartners` + `recentOpponents` state. Add `flashSlot` state (`"partner" | "opponent1" | "opponent2" | "team1Player1" | null`) to know which `PlayerSelector` should flash.
- **`components/enter/PlayerSelector.tsx`**: Remove `recentPlayers` prop and chip row JSX. Add `flashConfirm?: boolean` prop; use `useEffect` watching `flashConfirm` to apply and clear the flash class after 600 ms.
- No new dependencies required. Animation uses Tailwind transitions only.
- The `/api/players/recent` response shape (`{ partners: Player[], opponents: Player[] }`) is unchanged; merging/deduplication happens in the page component.

---

## 8. Success Metrics

- Recent-player chips appear **exactly once** on the Enter screen (not once per slot).
- No increase in taps required to fill all four player slots compared to the current design.
- After tapping a chip, a user can immediately identify which slot was filled without reading any label (verified by the emerald flash drawing the eye to the correct field).
- The two-team layout makes it visually unambiguous which players are on which team before submission.

---

## 9. Open Questions

*All questions resolved — no open items.*

**Resolved:**
- **Strip label**: No label. Chips are self-explanatory; a heading would add noise without benefit.
- **Few/no recents**: Show the strip with however many chips are available (even 1–2). Only hide the strip when there are zero available chips (all filled or none in history).
