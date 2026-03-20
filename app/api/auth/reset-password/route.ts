import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, newPassword } = body as Record<string, string>;

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Hash the incoming raw token to compare against stored hash
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await prisma.user.findFirst({
    where: { passwordResetToken: tokenHash },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }

  if (!user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Reset link has expired." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  return NextResponse.json({ message: "Password updated. You can now sign in." }, { status: 200 });
}
