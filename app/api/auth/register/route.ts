import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) || "user";
}

async function generateUniqueHandle(displayName: string): Promise<string> {
  const base = slugify(displayName);
  if (!(await prisma.user.findUnique({ where: { handle: base } }))) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}${n}`;
    if (!(await prisma.user.findUnique({ where: { handle: candidate } }))) return candidate;
    n++;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, displayName, password } = body as Record<string, string>;

  if (!email || !displayName || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const handle = await generateUniqueHandle(displayName);
  const passwordHash = await bcrypt.hash(password, 12);

  // Generate verification token (raw = sent in email, hashed = stored in DB)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.user.create({
    data: {
      email,
      handle,
      displayName,
      passwordHash,
      emailVerificationToken: tokenHash,
      emailVerificationTokenExpiry: tokenExpiry,
    },
  });

  let emailSent = true;
  try {
    await sendVerificationEmail(email, rawToken);
  } catch (err) {
    emailSent = false;
    console.error("[register] Failed to send verification email:", err);
  }

  return NextResponse.json(
    {
      message: emailSent
        ? "Account created. Check your email to verify your address."
        : "Account created, but we couldn't send the verification email. Visit /resend-verification to request a new link.",
    },
    { status: 201 },
  );
}
