import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

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

  // Generic success message used in all non-error cases to prevent email enumeration
  const ok = NextResponse.json(
    { message: "If that address is registered and unverified, a new link is on its way." },
    { status: 200 },
  );

  const user = await prisma.user.findUnique({ where: { email } });

  // No user found or already verified — return generic success, don't leak status
  if (!user || user.emailVerifiedAt) {
    return ok;
  }

  // Generate a fresh token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: tokenHash,
      emailVerificationTokenExpiry: tokenExpiry,
    },
  });

  try {
    await sendVerificationEmail(email, rawToken);
  } catch (err) {
    console.error("[resend-verification] Failed to send email:", err);
  }

  return ok;
}
