/**
 * Unit tests for shouldShowPreview.
 */

jest.mock("@/lib/db", () => ({
  prisma: {
    player: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { shouldShowPreview, DEMO_PREVIEW_MATCH_THRESHOLD } from "./preview-mode";

const mockFindFirst = prisma.player.findFirst as jest.Mock;

beforeEach(() => {
  mockFindFirst.mockReset();
});

describe("shouldShowPreview", () => {
  it("returns false when no player exists for the user", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const result = await shouldShowPreview("user-1");
    expect(result).toBe(false);
  });

  it("returns false when match count is at the threshold", async () => {
    mockFindFirst.mockResolvedValueOnce({
      _count: { matchParticipants: DEMO_PREVIEW_MATCH_THRESHOLD },
    });
    const result = await shouldShowPreview("user-1");
    expect(result).toBe(false);
  });

  it("returns false when match count is above the threshold", async () => {
    mockFindFirst.mockResolvedValueOnce({
      _count: { matchParticipants: DEMO_PREVIEW_MATCH_THRESHOLD + 10 },
    });
    const result = await shouldShowPreview("user-1");
    expect(result).toBe(false);
  });

  it("returns true for a brand-new player with zero matches", async () => {
    mockFindFirst.mockResolvedValueOnce({
      _count: { matchParticipants: 0 },
    });
    const result = await shouldShowPreview("user-1");
    expect(result).toBe(true);
  });

  it("returns true for a player below the threshold (e.g. 4 matches)", async () => {
    mockFindFirst.mockResolvedValueOnce({
      _count: { matchParticipants: DEMO_PREVIEW_MATCH_THRESHOLD - 1 },
    });
    const result = await shouldShowPreview("user-1");
    expect(result).toBe(true);
  });

  it("filters to non-soft-deleted players via deletedAt: null", async () => {
    mockFindFirst.mockResolvedValueOnce({
      _count: { matchParticipants: 0 },
    });
    await shouldShowPreview("user-1");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", deletedAt: null },
      }),
    );
  });

  it("only counts non-voided matches", async () => {
    mockFindFirst.mockResolvedValueOnce({
      _count: { matchParticipants: 0 },
    });
    await shouldShowPreview("user-1");
    const call = mockFindFirst.mock.calls[0][0];
    expect(call.select._count.select.matchParticipants.where).toEqual({
      match: { voidedAt: null },
    });
  });
});
