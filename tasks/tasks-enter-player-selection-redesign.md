## Relevant Files

- `app/(tabs)/enter/page.tsx` - Main Enter page; add shared chip strip, team card layout, flash slot state, chip-tap assignment logic.
- `components/enter/PlayerSelector.tsx` - Remove `recentPlayers` prop and chip row; add `flashConfirm` boolean prop with emerald border flash animation.

### Notes

- No new dependencies required — animation uses Tailwind transitions only.
- No server-side changes; `/api/players/recent` response shape is unchanged.
- No unit tests exist for these UI components; manual browser testing is the verification method.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [x]` to `- [x]`.

---

## Tasks

- [x] 1.0 Update `PlayerSelector` component
  - [x] 1.1 Remove the `recentPlayers` prop from `PlayerSelectorProps` interface and the default value `recentPlayers = []` from the function signature.
  - [x] 1.2 Delete the `visibleRecent` derived variable and the entire "Recent player chips" JSX block (the `{visibleRecent.length > 0 && !value && ...}` section).
  - [x] 1.3 Add an optional `flashConfirm?: boolean` prop to `PlayerSelectorProps`.
  - [x] 1.4 Add a `flashing` boolean state variable (default `false`) inside the component.
  - [x] 1.5 Add a `useEffect` that watches `flashConfirm`: when it becomes `true`, set `flashing = true`, then after 600 ms set `flashing = false`.
  - [x] 1.6 Apply the flash ring to the `<input>` element: when `flashing` is true, add `ring-2 ring-emerald-400` classes; use a `transition-shadow duration-300` base class so the ring fades out smoothly.
  - [x] 1.7 Remove the `excludeIds` prop call-sites in `page.tsx` that pass `recentPlayers` (will be done in task 2, but note the prop removal here means the TypeScript type no longer requires it).

- [x] 2.0 Add team card layout to `page.tsx`
  - [x] 2.1 Replace the flat `<div className="flex flex-col gap-8">` player selector block with two team card `<div>` elements, each using `rounded-2xl border px-4 py-4 flex flex-col gap-5`.
  - [x] 2.2 **Team 1 card** (YOUR TEAM): add header `<p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Your Team</p>`. In quick mode, show only the `partner` `PlayerSelector`. In admin mode, show `team1Player1` then `partner` selectors.
  - [x] 2.3 **Team 2 card** (OPPONENTS): add header `<p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Opponents</p>`. Show `opponent1` and `opponent2` `PlayerSelector` components.
  - [x] 2.4 Apply Team 1 accent border: `border-emerald-800/40` on the Team 1 card; `border-zinc-700/60` on the Team 2 card. Both cards use `bg-zinc-800/40` background.
  - [x] 2.5 Add a VS divider between the two cards:
    ```tsx
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t border-zinc-700/60" />
      <span className="text-xs font-bold tracking-widest text-zinc-600">VS</span>
      <div className="flex-1 border-t border-zinc-700/60" />
    </div>
    ```
  - [x] 2.6 Remove the `recentPlayers` prop from all four `PlayerSelector` usages (prop no longer exists after task 1).

- [x] 3.0 Add shared recent-player chip strip to `page.tsx`
  - [x] 3.1 Add a `recentAll` derived value (computed inline in JSX or as a `useMemo`) that merges `recentPartners` and `recentOpponents`, deduplicates by `id`, and takes the first 10.
  - [x] 3.2 Compute `assignedIds`: the set of `id` values from `team1Player1`, `partner`, `opponent1`, `opponent2` that are non-null.
  - [x] 3.3 Compute `availableChips`: `recentAll` filtered to exclude `assignedIds`.
  - [x] 3.4 Render the chip strip **above** the Team 1 card, inside the existing scroll container. Show it only when `availableChips.length > 0`:
    ```tsx
    {availableChips.length > 0 && (
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {availableChips.map((p) => (
          <button key={p.id} type="button" onClick={() => assignChip(p)}
            className="flex-shrink-0 rounded-full bg-zinc-700 px-3 py-1 text-base text-zinc-200 hover:bg-zinc-600 active:bg-zinc-500">
            {p.displayName}
          </button>
        ))}
      </div>
    )}
    ```

- [x] 4.0 Implement chip-tap assignment logic and flash feedback
  - [x] 4.1 Add `flashSlot` state: `const [flashSlot, setFlashSlot] = useState<"team1Player1" | "partner" | "opponent1" | "opponent2" | null>(null)`.
  - [x] 4.2 Add `useEffect` that clears `flashSlot` after 650 ms whenever it becomes non-null (slightly longer than the CSS transition so the state reset doesn't cut off the animation):
    ```ts
    useEffect(() => {
      if (!flashSlot) return;
      const t = setTimeout(() => setFlashSlot(null), 650);
      return () => clearTimeout(t);
    }, [flashSlot]);
    ```
  - [x] 4.3 Implement `assignChip(player: Player)` function that determines the next empty slot in order and assigns the player to it, then sets `flashSlot` to that slot's key:
    - In admin mode: check `team1Player1` → `partner` → `opponent1` → `opponent2`
    - In quick mode: check `partner` → `opponent1` → `opponent2`
    - Use the same `{ id, name }` shape as `selectPlayer` in `PlayerSelector` (i.e. `{ id: player.id, name: player.displayName }`).
    - Also call the corresponding `setXxxOk(true)` for the slot that was filled.
  - [x] 4.4 Pass `flashConfirm={flashSlot === "partner"}` (and equivalent for each slot) to each `PlayerSelector` component.

- [x] 5.0 Clean up and verify
  - [x] 5.1 Confirm `recentPlayers` prop is fully removed from `PlayerSelector` — no TypeScript errors.
  - [x] 5.2 Confirm the chip strip does not appear when all slots are filled (verify `availableChips` logic).
  - [x] 5.3 Confirm the chip strip reappears after clearing a slot (trigger `clearSelection` in a selector and check strip re-renders).
  - [x] 5.4 Visually verify the emerald border flash fires on the correct input when a chip is tapped.
  - [x] 5.5 Verify admin mode (4 slots): chip fill order is Team 1 P1 → Team 1 P2 → Team 2 P1 → Team 2 P2.
  - [x] 5.6 Verify quick mode (3 slots): chip fill order is Partner → Opponent 1 → Opponent 2.
  - [x] 5.7 Run `npm run build` (or `npx tsc --noEmit`) and confirm no TypeScript errors.
