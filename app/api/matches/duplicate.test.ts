/**
 * Tests for the duplicate-match 409 path in POST /api/matches.
 *
 * Covers PRD §4.3 requirement: the API must return 409 with existingMatchId
 * when a different user submits a match with the same fingerprint.
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks — must appear before imports of the mocked modules
// ---------------------------------------------------------------------------

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/services/players", () => ({ findOrCreateShadowPlayer: jest.fn() }));
jest.mock("@/lib/services/recompute", () => ({
  runRecompute: jest.fn().mockResolvedValue({ ratingsDeferred: false }),
}));
jest.mock("@/lib/rate-limit", () => ({
  redis: {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
    set: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock("@/lib/email", () => ({ sendFlagNotification: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    player: { findUnique: jest.fn() },
    match: { findFirst: jest.fn(), update: jest.fn() },
    matchParticipant: { createMany: jest.fn() },
    game: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_A = "user-a";
const USER_B = "user-b";

const PLAYER_P1 = { id: "p1", displayName: "Alice", userId: USER_B, claimed: true };
const PLAYER_P2 = { id: "p2", displayName: "Bob", userId: null, claimed: false };
const PLAYER_P3 = { id: "p3", displayName: "Charlie", userId: null, claimed: false };
const PLAYER_P4 = { id: "p4", displayName: "Dana", userId: null, claimed: false };

const MATCH_BODY = {
  matchDate: "2026-03-31T12:00:00.000Z",
  partnerId: PLAYER_P2.id,
  opponent1Id: PLAYER_P3.id,
  opponent2Id: PLAYER_P4.id,
  outcome: "win" as const,
  games: [{ gameOrder: 1, team1Score: 11, team2Score: 9 }],
};

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupPlayerMocks() {
  // user.findUnique: returns user-b's record with their player
  jest.mocked(prisma.user.findUnique).mockResolvedValue({
    id: USER_B,
    player: PLAYER_P1,
  } as never);

  // player.findUnique: sequential calls for partner, opp1, opp2
  jest.mocked(prisma.player.findUnique)
    .mockResolvedValueOnce(PLAYER_P2 as never)
    .mockResolvedValueOnce(PLAYER_P3 as never)
    .mockResolvedValueOnce(PLAYER_P4 as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/matches — duplicate fingerprint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: USER_B, role: "user" } } as never);
  });

  describe("409 when duplicate found by a different user", () => {
    it("returns 409 with existingMatchId", async () => {
      setupPlayerMocks();

      // Duplicate match entered by user-a (different user)
      jest.mocked(prisma.match.findFirst).mockResolvedValue({
        id: "existing-match-123",
        enteredByUserId: USER_A,
        voidedAt: null,
      } as never);

      const res = await POST(makeRequest(MATCH_BODY));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body).toEqual({
        error: "duplicate_match",
        existingMatchId: "existing-match-123",
      });
    });

    it("does not call prisma.$transaction when 409 is returned", async () => {
      setupPlayerMocks();

      jest.mocked(prisma.match.findFirst).mockResolvedValue({
        id: "existing-match-123",
        enteredByUserId: USER_A,
        voidedAt: null,
      } as never);

      await POST(makeRequest(MATCH_BODY));

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("no 409 when same user re-enters their own match", () => {
    it("proceeds past the fingerprint check (no 409)", async () => {
      setupPlayerMocks();

      // Match entered by same user (USER_B)
      jest.mocked(prisma.match.findFirst).mockResolvedValue({
        id: "own-match-99",
        enteredByUserId: USER_B,
        voidedAt: null,
      } as never);

      // Mock transaction to succeed
      jest.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
        const mockTx = {
          match: {
            create: jest.fn().mockResolvedValue({
              id: "new-match-id",
              matchDate: new Date("2026-03-31"),
              createdAt: new Date(),
              fingerprint: null,
              flaggedAt: null,
            }),
          },
          matchParticipant: { createMany: jest.fn() },
          game: { createMany: jest.fn() },
        };
        return (fn as (tx: unknown) => unknown)(mockTx);
      });

      const res = await POST(makeRequest(MATCH_BODY));

      expect(res.status).not.toBe(409);
    });
  });

  describe("no 409 when force: true is set", () => {
    it("skips the fingerprint check entirely", async () => {
      setupPlayerMocks();

      jest.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
        const mockTx = {
          match: {
            create: jest.fn().mockResolvedValue({
              id: "forced-match-id",
              matchDate: new Date("2026-03-31"),
              createdAt: new Date(),
              fingerprint: null,
              flaggedAt: null,
            }),
          },
          matchParticipant: { createMany: jest.fn() },
          game: { createMany: jest.fn() },
        };
        return (fn as (tx: unknown) => unknown)(mockTx);
      });

      const res = await POST(makeRequest({ ...MATCH_BODY, force: true }));

      // No duplicate lookup should happen
      expect(prisma.match.findFirst).not.toHaveBeenCalled();
      expect(res.status).not.toBe(409);
    });
  });
});
