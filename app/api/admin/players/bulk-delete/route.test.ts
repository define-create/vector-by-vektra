/**
 * Unit tests for POST /api/admin/players/bulk-delete
 *
 * Mocks:
 *  - next-auth  → getServerSession
 *  - @/lib/db   → prisma
 *  - @/lib/services/audit → writeAuditEvent
 */

import { POST } from "./route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ prisma: { player: { findMany: jest.fn(), updateMany: jest.fn() } } }));
jest.mock("@/lib/services/audit", () => ({ writeAuditEvent: jest.fn() }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { writeAuditEvent } from "@/lib/services/audit";

const mockSession = getServerSession as jest.Mock;
const mockFindMany = prisma.player.findMany as jest.Mock;
const mockUpdateMany = prisma.player.updateMany as jest.Mock;
const mockAudit = writeAuditEvent as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminSession() {
  mockSession.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/players/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeOrphan(id: string, overrides: Partial<{
  claimed: boolean;
  userId: string | null;
  deletedAt: Date | null;
  matchParticipants: number;
}> = {}) {
  return {
    id,
    displayName: `Player ${id}`,
    claimed: overrides.claimed ?? false,
    userId: overrides.userId ?? null,
    deletedAt: overrides.deletedAt ?? null,
    _count: { matchParticipants: overrides.matchParticipants ?? 0 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => jest.clearAllMocks());

describe("POST /api/admin/players/bulk-delete", () => {
  describe("authentication", () => {
    it("returns 403 when not authenticated", async () => {
      mockSession.mockResolvedValue(null);
      const res = await POST(makeRequest({ ids: ["p1"] }));
      expect(res.status).toBe(403);
    });

    it("returns 403 when user is not admin", async () => {
      mockSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
      const res = await POST(makeRequest({ ids: ["p1"] }));
      expect(res.status).toBe(403);
    });
  });

  describe("input validation", () => {
    beforeEach(adminSession);

    it("returns 400 when ids is missing", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });

    it("returns 400 when ids is empty array", async () => {
      const res = await POST(makeRequest({ ids: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when ids contains non-strings", async () => {
      const res = await POST(makeRequest({ ids: [1, 2] }));
      expect(res.status).toBe(400);
    });
  });

  describe("server-side player validation", () => {
    beforeEach(adminSession);

    it("returns 404 when a player ID is not found", async () => {
      mockFindMany.mockResolvedValue([]); // nothing found
      const res = await POST(makeRequest({ ids: ["ghost-id"] }));
      expect(res.status).toBe(404);
    });

    it("returns 409 when a player is already deleted", async () => {
      mockFindMany.mockResolvedValue([
        makeOrphan("p1", { deletedAt: new Date() }),
      ]);
      const res = await POST(makeRequest({ ids: ["p1"] }));
      expect(res.status).toBe(409);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/already deleted/i);
    });

    it("returns 409 when a player is claimed", async () => {
      mockFindMany.mockResolvedValue([
        makeOrphan("p1", { claimed: true, userId: "user-1" }),
      ]);
      const res = await POST(makeRequest({ ids: ["p1"] }));
      expect(res.status).toBe(409);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/claimed/i);
    });

    it("returns 409 when a player has match history", async () => {
      mockFindMany.mockResolvedValue([
        makeOrphan("p1", { matchParticipants: 3 }),
      ]);
      const res = await POST(makeRequest({ ids: ["p1"] }));
      expect(res.status).toBe(409);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/match history/i);
    });
  });

  describe("successful bulk delete", () => {
    beforeEach(() => {
      adminSession();
      mockUpdateMany.mockResolvedValue({ count: 2 });
      mockAudit.mockResolvedValue(undefined);
    });

    it("returns ok:true and deleted count", async () => {
      mockFindMany.mockResolvedValue([
        makeOrphan("p1"),
        makeOrphan("p2"),
      ]);

      const res = await POST(makeRequest({ ids: ["p1", "p2"] }));
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean; deleted: number };
      expect(body.ok).toBe(true);
      expect(body.deleted).toBe(2);
    });

    it("calls updateMany with the correct player IDs", async () => {
      mockFindMany.mockResolvedValue([makeOrphan("p1")]);

      await POST(makeRequest({ ids: ["p1"] }));

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["p1"] } },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it("writes one audit event per deleted player", async () => {
      mockFindMany.mockResolvedValue([
        makeOrphan("p1"),
        makeOrphan("p2"),
      ]);

      await POST(makeRequest({ ids: ["p1", "p2"] }));

      expect(mockAudit).toHaveBeenCalledTimes(2);
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "delete_player",
          entityType: "Player",
          entityId: "p1",
          metadata: expect.objectContaining({ reason: "orphaned_bulk_cleanup" }),
        }),
        expect.anything(),
      );
    });

    it("rejects the entire request if any single player fails validation", async () => {
      mockFindMany.mockResolvedValue([
        makeOrphan("p1"),                              // valid
        makeOrphan("p2", { matchParticipants: 5 }),    // has matches
      ]);

      const res = await POST(makeRequest({ ids: ["p1", "p2"] }));
      expect(res.status).toBe(409);
      expect(mockUpdateMany).not.toHaveBeenCalled();   // no partial deletes
    });
  });
});
