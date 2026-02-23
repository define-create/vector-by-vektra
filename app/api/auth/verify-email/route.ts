import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/sign-in?error=InvalidToken", req.url));
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: tokenHash,
      emailVerificationTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in?error=InvalidOrExpiredToken", req.url));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
    },
  });

  return NextResponse.redirect(new URL("/sign-in?verified=true", req.url));
}
