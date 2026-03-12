/**
 * Unit tests for POST /api/auth/resend-verification
 */

import { NextRequest } from "next/server";
import { POST } from "./route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn(),
}));

import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockSendEmail = sendVerificationEmail as jest.Mock;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockSendEmail.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("POST /api/auth/resend-verification — validation", () => {
  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/email/i);
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// No-op cases (200 with generic message — no email enumeration)
// ---------------------------------------------------------------------------

describe("POST /api/auth/resend-verification — no-op cases", () => {
  it("returns 200 when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 when user is already verified", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "verified@example.com",
      emailVerifiedAt: new Date(),
    });
    const res = await POST(makeRequest({ email: "verified@example.com" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Success — unverified user gets a new token
// ---------------------------------------------------------------------------

describe("POST /api/auth/resend-verification — unverified user", () => {
  const unverifiedUser = {
    id: "user-2",
    email: "unverified@example.com",
    emailVerifiedAt: null,
  };

  beforeEach(() => {
    mockFindUnique.mockResolvedValue(unverifiedUser);
  });

  it("returns 200 with generic success message", async () => {
    const res = await POST(makeRequest({ email: "unverified@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toBeTruthy();
  });

  it("updates the user with a new hashed token and 24-hour expiry", async () => {
    const before = Date.now();
    await POST(makeRequest({ email: "unverified@example.com" }));
    const after = Date.now();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-2" },
        data: expect.objectContaining({
          emailVerificationToken: expect.any(String),
          emailVerificationTokenExpiry: expect.any(Date),
        }),
      }),
    );

    const expiry: Date = mockUpdate.mock.calls[0][0].data.emailVerificationTokenExpiry;
    const expiryMs = expiry.getTime();
    expect(expiryMs).toBeGreaterThanOrEqual(before + 23 * 60 * 60 * 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + 25 * 60 * 60 * 1000);
  });

  it("stores a SHA-256 hash (not the raw token) in the DB", async () => {
    await POST(makeRequest({ email: "unverified@example.com" }));
    const storedToken: string = mockUpdate.mock.calls[0][0].data.emailVerificationToken;
    // SHA-256 hex is 64 chars
    expect(storedToken).toHaveLength(64);
    expect(storedToken).toMatch(/^[0-9a-f]+$/);
  });

  it("calls sendVerificationEmail with the raw (unhashed) token", async () => {
    await POST(makeRequest({ email: "unverified@example.com" }));
    expect(mockSendEmail).toHaveBeenCalledWith(
      "unverified@example.com",
      expect.any(String),
    );
    // The raw token passed to email must NOT equal the stored hash
    const rawToken: string = mockSendEmail.mock.calls[0][1];
    const storedHash: string = mockUpdate.mock.calls[0][0].data.emailVerificationToken;
    expect(rawToken).not.toBe(storedHash);
    // Raw token is 64 hex chars (32 bytes * 2)
    expect(rawToken).toHaveLength(64);
  });

  it("still returns 200 when sendVerificationEmail throws", async () => {
    mockSendEmail.mockRejectedValue(new Error("SMTP failure"));
    const res = await POST(makeRequest({ email: "unverified@example.com" }));
    expect(res.status).toBe(200);
  });
});
