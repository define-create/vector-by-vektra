import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

  const { email, handle, displayName, password } = body as Record<string, string>;

  if (!email || !handle || !displayName || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Normalise handle — strip leading @ if present
  const normalisedHandle = handle.startsWith("@") ? handle.slice(1) : handle;

  // Check uniqueness
  const [existingEmail, existingHandle] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { handle: normalisedHandle } }),
  ]);

  if (existingEmail) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  if (existingHandle) {
    return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Generate verification token (raw = sent in email, hashed = stored in DB)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.user.create({
    data: {
      email,
      handle: normalisedHandle,
      displayName,
      passwordHash,
      emailVerificationToken: tokenHash,
      emailVerificationTokenExpiry: tokenExpiry,
    },
  });

  await sendVerificationEmail(email, rawToken);

  return NextResponse.json(
    { message: "Account created. Check your email to verify your address." },
    { status: 201 },
  );
}
