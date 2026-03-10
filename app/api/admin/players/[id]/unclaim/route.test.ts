/**
 * Unit tests for POST /api/admin/players/[id]/unclaim
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
  },
}));

jest.mock("@/lib/services/audit", () => ({
  writeAuditEvent: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

const mockGetServerSession = getServerSession as jest.Mock;
const mockFindUnique = prisma.player.findUnique as jest.Mock;
const mockUpdate = prisma.player.update as jest.Mock;
const mockWriteAuditEvent = writeAuditEvent as jest.Mock;

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/players/player-1/unclaim", {
    method: "POST",
  });
}

function makeParams(id = "player-1") {
  return { params: Promise.resolve({ id }) };
}

const adminSession = { user: { id: "admin-1", role: "admin" } };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockWriteAuditEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Auth tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/players/[id]/unclaim — auth", () => {
  it("returns 403 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/players/[id]/unclaim — validation", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(adminSession);
  });

  it("returns 404 when player does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 409 when player is already deleted", async () => {
    mockFindUnique.mockResolvedValue({
      id: "player-1",
      displayName: "Alice",
      claimed: true,
      userId: "user-1",
      deletedAt: new Date(),
    });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/deleted/i);
  });

  it("returns 409 when player is not claimed (claimed=false)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "player-1",
      displayName: "Alice",
      claimed: false,
      userId: null,
      deletedAt: null,
    });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not claimed/i);
  });

  it("returns 409 when userId is null even if claimed=true", async () => {
    mockFindUnique.mockResolvedValue({
      id: "player-1",
      displayName: "Alice",
      claimed: true,
      userId: null,
      deletedAt: null,
    });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Success tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/players/[id]/unclaim — success", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockFindUnique.mockResolvedValue({
      id: "player-1",
      displayName: "Alice",
      claimed: true,
      userId: "user-42",
      deletedAt: null,
    });
  });

  it("returns { ok: true } on success", async () => {
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("calls prisma.player.update with correct unclaim data", async () => {
    await POST(makeRequest(), makeParams());
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "player-1" },
      data: {
        userId: null,
        claimed: false,
        claimedAt: null,
        trustTier: "unverified",
      },
    });
  });

  it("writes an unclaim_profile audit event with unclaimedUserId", async () => {
    await POST(makeRequest(), makeParams());
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "unclaim_profile",
        entityType: "Player",
        entityId: "player-1",
        adminUserId: "admin-1",
        metadata: { unclaimedUserId: "user-42" },
      }),
      prisma,
    );
  });
});
