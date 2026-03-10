/**
 * Unit tests for POST /api/players/[id]/claim
 */

import { NextRequest } from "next/server";
import { POST } from "./route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/services/audit", () => ({ writeAuditEvent: jest.fn() }));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    player: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

const mockGetServerSession = getServerSession as jest.Mock;
const mockFindUser = prisma.user.findUnique as jest.Mock;
const mockFindPlayer = prisma.player.findUnique as jest.Mock;
const mockUpdatePlayer = prisma.player.update as jest.Mock;

function makeRequest(playerId = "player-1") {
  return new NextRequest(`http://localhost/api/players/${playerId}/claim`, { method: "POST" });
}

function makeParams(id = "player-1") {
  return { params: Promise.resolve({ id }) };
}

const session = { user: { id: "user-1" } };

const verifiedUser = {
  id: "user-1",
  emailVerifiedAt: new Date(),
  player: null,
};

const targetPlayer = {
  id: "player-1",
  displayName: "Alice",
  userId: null,
  deletedAt: null,
  claimed: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue(session);
  mockFindUser.mockResolvedValue(verifiedUser);
  mockFindPlayer.mockResolvedValue(targetPlayer);
  mockUpdatePlayer.mockResolvedValue({ ...targetPlayer, userId: "user-1", claimed: true });
});

// ---------------------------------------------------------------------------
// Auth / precondition tests
// ---------------------------------------------------------------------------

it("returns 401 when unauthenticated", async () => {
  mockGetServerSession.mockResolvedValue(null);
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(401);
});

it("returns 403 when email is not verified", async () => {
  mockFindUser.mockResolvedValue({ ...verifiedUser, emailVerifiedAt: null });
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(403);
});

it("returns 409 when user already has an active player", async () => {
  mockFindUser.mockResolvedValue({
    ...verifiedUser,
    player: { id: "existing", deletedAt: null },
  });
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(409);
  const body = await res.json() as { error: string };
  expect(body.error).toMatch(/already have a player/i);
});

it("allows claim when user's existing player is soft-deleted", async () => {
  mockFindUser.mockResolvedValue({
    ...verifiedUser,
    player: { id: "old-player", deletedAt: new Date() }, // soft-deleted
  });
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(200);
  const body = await res.json() as { ok: boolean };
  expect(body.ok).toBe(true);
});

it("returns 404 when target player does not exist", async () => {
  mockFindPlayer.mockResolvedValue(null);
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(404);
});

it("returns 409 when target player is already claimed", async () => {
  mockFindPlayer.mockResolvedValue({ ...targetPlayer, userId: "other-user" });
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(409);
  const body = await res.json() as { error: string };
  expect(body.error).toMatch(/already been claimed/i);
});

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

it("returns { ok: true } and updates the player on success", async () => {
  const res = await POST(makeRequest(), makeParams());
  expect(res.status).toBe(200);
  const body = await res.json() as { ok: boolean };
  expect(body.ok).toBe(true);
  expect(mockUpdatePlayer).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "player-1" },
      data: expect.objectContaining({ userId: "user-1", claimed: true, trustTier: "verified_email" }),
    }),
  );
});
