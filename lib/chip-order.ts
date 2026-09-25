/**
 * Recent-player chip ordering for the Enter Match screen.
 *
 * A chip tap always fills the first empty player slot in reading order —
 * Partner → Opponent 1 → Opponent 2, or in admin mode
 * Team 1 P1 → Team 1 P2 → Team 2 P1 → Team 2 P2.
 *
 * Which field was last focused plays no part. An earlier "chips target the
 * focused slot first" rule was removed because the remembered focus went stale
 * — after leaving a field, or after "Enter another match" — and sent the first
 * chip to Team 2. app/(tabs)/enter/page.test.tsx reproduces that case.
 */

export type SlotKey = "team1Player1" | "partner" | "opponent1" | "opponent2";

interface SlotValueLike {
  id?: string;
  name?: string;
}

/** Slot fill order. Admin mode adds Team 1's first player, who is "me" otherwise. */
export function slotOrder(adminMode: boolean): SlotKey[] {
  return adminMode
    ? ["team1Player1", "partner", "opponent1", "opponent2"]
    : ["partner", "opponent1", "opponent2"];
}

/** A slot is filled by a picked player (id) or a typed name (a new player). */
export function isSlotEmpty(value: SlotValueLike | null | undefined): boolean {
  return !value?.id && !value?.name;
}

/**
 * The slot the next chip tap will fill, or null when every slot in play is
 * filled. Also drives the "next slot" highlight, so the two always agree.
 */
export function nextChipSlot(
  adminMode: boolean,
  values: Record<SlotKey, SlotValueLike | null>,
): SlotKey | null {
  return slotOrder(adminMode).find((key) => isSlotEmpty(values[key])) ?? null;
}
