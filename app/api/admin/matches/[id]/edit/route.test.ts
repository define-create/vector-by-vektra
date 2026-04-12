/**
 * Tests for POST /api/admin/matches/[id]/edit
 *
 * Covers:
 *  1. Returns 200 with newMatchId on successful edit
 *  2. Returns 404 when match not found
 *  3. Returns 409 when match is already voided
 *  4. Returns 403 when caller is not admin
 *  5. Transaction is NOT called when 404/409 returned
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks — must appear before imports of the mocked modules
// ---------------------------------------------------------------------------

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/services/audit", () => ({ writeAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/services/recompute", () => ({
  runRecompute: jest.fn().mockResolvedValue({ ratingsDeferred: false }),
}));
jest.mock("@/lib/db", () => ({
  prisma: {
    match: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { runRecompute } from "@/lib/services/recompute";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_SESSION = {
  user: { id: "admin-user-id", role: "admin" },
};

const ORIGINAL_MATCH = {
  id: "match-original-id",
  voidedAt: null,
  matchDate: new Date("2026-04-11T12:00:00.000Z"),
  tag: "April 11 new",
};

const VALID_BODY = {
  team1: ["player-1", "player-2"],
  team2: ["player-3", "player-4"],
  games: [
    { gameOrder: 1, team1Score: 11, team2Score: 7 },
    { gameOrder: 2, team1Score: 11, team2Score: 9 },
  ],
  tag: "April 11 new",
  matchDate: "2026-04-11",
};

function makeRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/matches/${id}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/matches/[id]/edit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when caller is not admin", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "regular-user", role: "user" },
    });

    const res = await POST(makeRequest("match-original-id", VALID_BODY), {
      params: Promise.resolve({ id: "match-original-id" }),
    });

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when match is not found", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION);
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await POST(makeRequest("nonexistent-id", VALID_BODY), {
      params: Promise.resolve({ id: "nonexistent-id" }),
    });

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when match is already voided", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION);
    (prisma.match.findUnique as jest.Mock).mockResolvedValue({
      ...ORIGINAL_MATCH,
      voidedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    const res = await POST(makeRequest("match-original-id", VALID_BODY), {
      params: Promise.resolve({ id: "match-original-id" }),
    });

    expect(res.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 200 with newMatchId and triggers recompute on success", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION);
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(ORIGINAL_MATCH);
    (prisma.$transaction as jest.Mock).mockResolvedValue({ id: "new-match-id" });

    const res = await POST(makeRequest("match-original-id", VALID_BODY), {
      params: Promise.resolve({ id: "match-original-id" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; newMatchId: string };
    expect(data.ok).toBe(true);
    expect(data.newMatchId).toBe("new-match-id");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(runRecompute).toHaveBeenCalledTimes(1);
    // Recompute called with "admin" runType and a fromDate
    expect((runRecompute as jest.Mock).mock.calls[0][0]).toBe("admin");
    expect((runRecompute as jest.Mock).mock.calls[0][2]).toBeInstanceOf(Date);
  });

  it("returns 400 when player IDs are not unique", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN_SESSION);
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(ORIGINAL_MATCH);

    const dupBody = {
      ...VALID_BODY,
      team1: ["player-1", "player-1"], // duplicate
    };

    const res = await POST(makeRequest("match-original-id", dupBody), {
      params: Promise.resolve({ id: "match-original-id" }),
    });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
