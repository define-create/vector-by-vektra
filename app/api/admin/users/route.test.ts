/**
 * Unit tests for GET /api/admin/users
 */

import { NextRequest } from "next/server";
import { GET } from "./route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

const mockGetServerSession = getServerSession as jest.Mock;
const mockFindMany = prisma.user.findMany as jest.Mock;

function makeRequest(q?: string) {
  const url = q
    ? `http://localhost/api/admin/users?q=${encodeURIComponent(q)}`
    : "http://localhost/api/admin/users";
  return new NextRequest(url, { method: "GET" });
}

const adminSession = { user: { id: "admin-1", role: "admin" } };

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("GET /api/admin/users — auth", () => {
  it("returns 403 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest("test"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const res = await GET(makeRequest("test"));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("GET /api/admin/users — validation", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(adminSession);
  });

  it("returns 400 when q param is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 when q param is empty string", async () => {
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

describe("GET /api/admin/users — results", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(adminSession);
  });

  it("returns empty array when no users match", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("nobody@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json() as { users: unknown[] };
    expect(body.users).toEqual([]);
  });

  it("returns users with emailVerified=false when emailVerifiedAt is null", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "u1",
        email: "user@example.com",
        handle: "user1",
        displayName: "User One",
        emailVerifiedAt: null,
        player: null,
      },
    ]);
    const res = await GET(makeRequest("user@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json() as { users: Array<{ emailVerified: boolean; hasActivePlayer: boolean }> };
    expect(body.users[0].emailVerified).toBe(false);
    expect(body.users[0].hasActivePlayer).toBe(false);
  });

  it("returns users with emailVerified=true when emailVerifiedAt is set", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "u2",
        email: "verified@example.com",
        handle: "verified",
        displayName: "Verified User",
        emailVerifiedAt: new Date(),
        player: null,
      },
    ]);
    const res = await GET(makeRequest("verified@example.com"));
    const body = await res.json() as { users: Array<{ emailVerified: boolean }> };
    expect(body.users[0].emailVerified).toBe(true);
  });

  it("returns hasActivePlayer=true when user has a non-deleted player", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "u3",
        email: "player@example.com",
        handle: "player1",
        displayName: "Player One",
        emailVerifiedAt: new Date(),
        player: { id: "p1", deletedAt: null },
      },
    ]);
    const res = await GET(makeRequest("player@example.com"));
    const body = await res.json() as { users: Array<{ hasActivePlayer: boolean }> };
    expect(body.users[0].hasActivePlayer).toBe(true);
  });

  it("returns hasActivePlayer=false when user's player is soft-deleted", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "u4",
        email: "deleted@example.com",
        handle: "deleted1",
        displayName: "Deleted Player",
        emailVerifiedAt: new Date(),
        player: { id: "p2", deletedAt: new Date() },
      },
    ]);
    const res = await GET(makeRequest("deleted@example.com"));
    const body = await res.json() as { users: Array<{ hasActivePlayer: boolean }> };
    expect(body.users[0].hasActivePlayer).toBe(false);
  });
});
