/**
 * Unit tests for findOrCreateShadowPlayer.
 *
 * The function accepts a PrismaClient as a parameter, so we can pass a mock
 * object directly — no jest.mock() or module patching required.
 */

import { findOrCreateShadowPlayer } from "./players";

// ---------------------------------------------------------------------------
// Minimal mock Prisma shape
// ---------------------------------------------------------------------------

function makePrisma(overrides: {
  findFirst?: jest.Mock;
  create?: jest.Mock;
}) {
  return {
    player: {
      findFirst: overrides.findFirst ?? jest.fn(),
      create: overrides.create ?? jest.fn(),
    },
  };
}

const SHADOW = {
  id: "player-1",
  displayName: "Almir",
  userId: null,
  claimed: false,
  trustTier: "unverified" as const,
  rating: 1000,
  ratingConfidence: 0,
  ratingVolatility: 0,
  createdAt: new Date("2025-01-01"),
  deletedAt: null,
  claimedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findOrCreateShadowPlayer", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns existing shadow when one is found by displayName", async () => {
    const findFirst = jest.fn().mockResolvedValue(SHADOW);
    const create = jest.fn();
    const prisma = makePrisma({ findFirst, create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findOrCreateShadowPlayer("Almir", prisma as any);

    expect(result).toBe(SHADOW);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a new shadow when none exists", async () => {
    const newPlayer = { ...SHADOW, id: "player-new" };
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue(newPlayer);
    const prisma = makePrisma({ findFirst, create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findOrCreateShadowPlayer("Almir", prisma as any);

    expect(result).toBe(newPlayer);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        displayName: "Almir",
        userId: null,
        claimed: false,
        trustTier: "unverified",
        rating: 1000,
      }),
    });
  });

  it("trims whitespace from displayName before lookup and create", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue(SHADOW);
    const prisma = makePrisma({ findFirst, create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await findOrCreateShadowPlayer("  Almir  ", prisma as any);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          displayName: expect.objectContaining({ equals: "Almir" }),
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ displayName: "Almir" }),
    });
  });

  it("on P2002 conflict, re-fetches and returns the existing shadow", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const winner = { ...SHADOW, id: "player-winner" };

    // First findFirst returns null (no shadow yet), create throws P2002,
    // second findFirst (in catch) returns the winner created by the other request.
    const findFirst = jest.fn()
      .mockResolvedValueOnce(null)    // initial lookup → not found
      .mockResolvedValueOnce(winner); // re-fetch after conflict → found
    const create = jest.fn().mockRejectedValue(p2002);
    const prisma = makePrisma({ findFirst, create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findOrCreateShadowPlayer("Almir", prisma as any);

    expect(result).toBe(winner);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("re-throws non-P2002 errors without retrying", async () => {
    const dbError = Object.assign(new Error("Connection lost"), { code: "P1001" });
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue(dbError);
    const prisma = makePrisma({ findFirst, create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(findOrCreateShadowPlayer("Almir", prisma as any)).rejects.toThrow("Connection lost");
    expect(findFirst).toHaveBeenCalledTimes(1); // no retry
  });

  it("re-throws P2002 if the re-fetch also finds nothing (unexpected state)", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const findFirst = jest.fn().mockResolvedValue(null); // both calls return null
    const create = jest.fn().mockRejectedValue(p2002);
    const prisma = makePrisma({ findFirst, create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(findOrCreateShadowPlayer("Almir", prisma as any)).rejects.toThrow("Unique constraint failed");
  });
});
