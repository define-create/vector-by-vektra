/**
 * Unit tests for PATCH /api/players/me/display-name
 */

import { NextRequest } from "next/server";
import { PATCH } from "./route";

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
      findFirst: jest.fn(),
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
const mockFindFirst = prisma.player.findFirst as jest.Mock;
const mockUpdate = prisma.player.update as jest.Mock;
const mockWriteAuditEvent = writeAuditEvent as jest.Mock;

const existingPlayer = {
  id: "player-1",
  displayName: "Alice",
  userId: "user-1",
  deletedAt: null,
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/players/me/display-name", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const authSession = { user: { id: "user-1", role: "user" } };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue(authSession);
  mockFindFirst.mockResolvedValue(existingPlayer);
  mockUpdate.mockResolvedValue({});
  mockWriteAuditEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Auth tests
// ---------------------------------------------------------------------------

describe("PATCH /api/players/me/display-name — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ displayName: "Bob" }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("PATCH /api/players/me/display-name — validation", () => {
  it("returns 404 when user has no linked player", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ displayName: "Bob" }));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/no linked player/i);
  });

  it("returns 400 when displayName is empty string", async () => {
    const res = await PATCH(makeRequest({ displayName: "" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/non-empty/i);
  });

  it("returns 400 when displayName is whitespace-only", async () => {
    const res = await PATCH(makeRequest({ displayName: "   " }));
    expect(res.status).toBe(400);
    expect(res.status).toBe(400);
  });

  it("returns 400 when displayName exceeds 50 characters", async () => {
    const res = await PATCH(makeRequest({ displayName: "A".repeat(51) }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/50 characters/i);
  });

  it("accepts displayName of exactly 50 characters", async () => {
    const res = await PATCH(makeRequest({ displayName: "A".repeat(50) }));
    expect(res.status).toBe(200);
  });

  it("returns 400 when displayName is unchanged", async () => {
    const res = await PATCH(makeRequest({ displayName: "Alice" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unchanged/i);
  });

  it("returns 400 when displayName is missing from body", async () => {
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/players/me/display-name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Success tests
// ---------------------------------------------------------------------------

describe("PATCH /api/players/me/display-name — success", () => {
  it("returns { ok: true, displayName } on success", async () => {
    const res = await PATCH(makeRequest({ displayName: "  Bob  " }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; displayName: string };
    expect(body.ok).toBe(true);
    expect(body.displayName).toBe("Bob"); // trimmed
  });

  it("calls prisma.player.update with trimmed display name", async () => {
    await PATCH(makeRequest({ displayName: "  Bob  " }));
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "player-1" },
      data: { displayName: "Bob" },
    });
  });

  it("writes an edit_player_identity audit event", async () => {
    await PATCH(makeRequest({ displayName: "Bob" }));
    expect(mockWriteAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "edit_player_identity",
        entityType: "Player",
        entityId: "player-1",
        metadata: {
          before: { displayName: "Alice" },
          after: { displayName: "Bob" },
          source: "self_service",
        },
      }),
      prisma,
    );
  });

  it("does not include adminUserId in audit event (self-service)", async () => {
    await PATCH(makeRequest({ displayName: "Bob" }));
    const call = mockWriteAuditEvent.mock.calls[0][0] as { adminUserId?: string };
    expect(call.adminUserId).toBeUndefined();
  });
});
