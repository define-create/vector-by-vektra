import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendFeedbackEmail } from "@/lib/email";
import { feedbackLimiter } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by userId
  try {
    const { success, reset } = await feedbackLimiter.limit(session.user.id);
    if (!success) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)) },
      });
    }
  } catch { /* Upstash unavailable — fail open */ }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { subject, message } = body as { subject?: string; message?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.trim().length > 2000) {
    return NextResponse.json(
      { error: "Message is too long (max 2000 characters)" },
      { status: 400 },
    );
  }
  if (subject && subject.length > 200) {
    return NextResponse.json(
      { error: "Subject is too long (max 200 characters)" },
      { status: 400 },
    );
  }

  try {
    await sendFeedbackEmail({
      fromEmail: session.user.email,
      subject: subject?.trim() ?? "",
      message: message.trim(),
    });
  } catch (err) {
    console.error("[POST /api/feedback] Failed to send email:", err);
    return NextResponse.json({ error: "Failed to send feedback" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
