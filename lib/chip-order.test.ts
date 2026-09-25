import { nextChipSlot, slotOrder, isSlotEmpty, type SlotKey } from "./chip-order";

const picked = (name: string) => ({ id: `id-${name}`, name });
const typed = (name: string) => ({ name });

function slots(partial: Partial<Record<SlotKey, { id?: string; name?: string } | null>> = {}) {
  return { team1Player1: null, partner: null, opponent1: null, opponent2: null, ...partial };
}

describe("slotOrder", () => {
  it("fills partner, then opponents, in normal mode", () => {
    expect(slotOrder(false)).toEqual(["partner", "opponent1", "opponent2"]);
  });

  it("fills Team 1 before Team 2 in admin mode", () => {
    expect(slotOrder(true)).toEqual(["team1Player1", "partner", "opponent1", "opponent2"]);
  });
});

describe("isSlotEmpty", () => {
  it("treats null, undefined and an empty object as empty", () => {
    expect(isSlotEmpty(null)).toBe(true);
    expect(isSlotEmpty(undefined)).toBe(true);
    expect(isSlotEmpty({})).toBe(true);
  });

  it("treats a picked player or a typed name as filled", () => {
    expect(isSlotEmpty(picked("Sam"))).toBe(false);
    expect(isSlotEmpty(typed("Sam"))).toBe(false);
  });
});

describe("nextChipSlot", () => {
  it("targets the partner first on an empty form", () => {
    expect(nextChipSlot(false, slots())).toBe("partner");
  });

  it("walks partner → opponent 1 → opponent 2 as slots fill", () => {
    expect(nextChipSlot(false, slots({ partner: picked("A") }))).toBe("opponent1");
    expect(nextChipSlot(false, slots({ partner: picked("A"), opponent1: picked("B") }))).toBe("opponent2");
  });

  it("returns null once every slot is filled", () => {
    expect(
      nextChipSlot(false, slots({ partner: picked("A"), opponent1: picked("B"), opponent2: picked("C") })),
    ).toBeNull();
  });

  it("skips a slot filled by typing a new player's name", () => {
    expect(nextChipSlot(false, slots({ partner: typed("New Guy") }))).toBe("opponent1");
  });

  it("fills an earlier gap before a later empty slot", () => {
    // Opponent 2 was typed in directly; the partner is still the next chip target.
    expect(nextChipSlot(false, slots({ opponent2: typed("Sam") }))).toBe("partner");
    // Partner and opponent 2 filled; opponent 1 is the gap.
    expect(nextChipSlot(false, slots({ partner: picked("A"), opponent2: picked("C") }))).toBe("opponent1");
  });

  it("ignores Team 1's first player in normal mode — that is the signed-in user", () => {
    expect(nextChipSlot(false, slots())).not.toBe("team1Player1");
    expect(
      nextChipSlot(false, slots({ partner: picked("A"), opponent1: picked("B"), opponent2: picked("C") })),
    ).toBeNull();
  });

  it("walks Team 1 P1 → P2 → Team 2 P1 → P2 in admin mode", () => {
    expect(nextChipSlot(true, slots())).toBe("team1Player1");
    expect(nextChipSlot(true, slots({ team1Player1: picked("A") }))).toBe("partner");
    expect(nextChipSlot(true, slots({ team1Player1: picked("A"), partner: picked("B") }))).toBe("opponent1");
    expect(
      nextChipSlot(true, slots({ team1Player1: picked("A"), partner: picked("B"), opponent1: picked("C") })),
    ).toBe("opponent2");
  });
});
