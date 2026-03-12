/**
 * Unit tests for POST /api/admin/players/[id]/link
 */

import { NextRequest } from "next/server";
import { POST } from "./route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  prisma: {
    player: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/services/audit", () => ({
  writeAuditEvent: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

const mockGetServerSession = getServerSession as jest.Mock;
const mockPlayerFindUnique = prisma.player.findUnique as jest.Mock;
const mockPlayerUpdate = prisma.player.update as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockWriteAuditEvent = writeAuditEvent as jest.Mock;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/players/player-1/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = "player-1") {
  return { params: Promise.resolve({ id }) };
}

const adminSession = { user: { id: "admin-1", role: "admin" } };

const unclaimedPlayer = {
  id: "player-1",
  displayName: "Alice",
  claimed: false,
  userId: null,
  deletedAt: null,
};

const targetUser = {
  id: "user-42",
  email: "alice@example.com",
  player: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayerUpdate.mockResolvedValue({});
  mockWriteAuditEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("POST /api/admin/players/[id]/link — auth", () => {
  it("returns 403 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("POST /api/admin/players/[id]/link — validation", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(adminSession);
  });

  it("returns 400 when userId is missing", async () => {
    mockPlayerFindUnique.mockResolvedValue(unclaimedPlayer);
    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/userId/i);
  });

  it("returns 404 when player does not exist", async () => {
    mockPlayerFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when player is soft-deleted", async () => {
    mockPlayerFindUnique.mockResolvedValue({ ...unclaimedPlayer, deletedAt: new Date() });
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 when player is already claimed", async () => {
    mockPlayerFindUnique.mockResolvedValue({ ...unclaimedPlayer, userId: "existing-user", claimed: true });
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/already claimed/i);
  });

  it("returns 404 when target user does not exist", async () => {
    mockPlayerFindUnique.mockResolvedValue(unclaimedPlayer);
    mockUserFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/user not found/i);
  });

  it("returns 409 when user already has an active player profile", async () => {
    mockPlayerFindUnique.mockResolvedValue(unclaimedPlayer);
    mockUserFindUnique.mockResolvedValue({
      ...targetUser,
      player: { id: "other-player", deletedAt: null },
    });
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/already has an active player/i);
  });
});

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

describe("POST /api/admin/players/[id]/link — success", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockPlayerFindUnique.mockResolvedValue(unclaimedPlayer);
    mockUserFindUnique.mockResolvedValue(targetUser);
  });

  it("returns { ok: true }", async () => {
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("updates the player with correct link data", async () => {
    await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(mockPlayerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "player-1" },
        data: expect.objectContaining({
          userId: "user-42",
          claimed: true,
          trustTier: "verified_email",
        }),
      }),
    );
    const data = mockPlayerUpdate.mock.calls[0][0].data;
    expect(data.claimedAt).toBeInstanceOf(Date);
  });

  it("writes a claim_profile audit event with linkedByAdmin metadata", async () => {
    await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "claim_profile",
        entityType: "Player",
        entityId: "player-1",
        adminUserId: "admin-1",
        metadata: { linkedByAdmin: true, linkedUserId: "user-42" },
      }),
      prisma,
    );
  });

  it("allows linking when user has only a deleted player profile", async () => {
    mockUserFindUnique.mockResolvedValue({
      ...targetUser,
      player: { id: "old-player", deletedAt: new Date() },
    });
    const res = await POST(makeRequest({ userId: "user-42" }), makeParams());
    expect(res.status).toBe(200);
  });
});
