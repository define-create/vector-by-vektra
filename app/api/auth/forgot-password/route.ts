import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email } = body as Record<string, string>;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Generic success message — always returned to prevent user enumeration
  const ok = NextResponse.json(
    { message: "If that address is registered, a reset link is on its way." },
    { status: 200 },
  );

  const user = await prisma.user.findUnique({ where: { email } });

  // No user found or not yet verified — return generic success, don't leak status
  if (!user || !user.emailVerifiedAt) {
    return ok;
  }

  // Generate raw token (sent in email) and hash (stored in DB)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: tokenHash,
      passwordResetTokenExpiresAt: tokenExpiry,
    },
  });

  try {
    await sendPasswordResetEmail(email, rawToken);
  } catch (err) {
    console.error("[forgot-password] Failed to send reset email:", err);
  }

  return ok;
}
