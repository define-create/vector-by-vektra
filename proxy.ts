import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";
import {
  authMutationLimiter,
  signInLimiter,
  matchEntryLimiter,
} from "@/lib/rate-limit";

// Paths that don't require authentication
const PUBLIC_PREFIXES = ["/sign-in", "/register", "/api/auth", "/s", "/api/share", "/invite", "/api/invite"];

const AUTH_MUTATION_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-verification",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function rateLimitedResponse(reset: number) {
  return new NextResponse("Too many requests", {
    status: 429,
    headers: { "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)) },
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // --- Rate limiting ---

  // Auth mutations: register, forgot-password, reset-password, resend-verification
  if (AUTH_MUTATION_PATHS.has(pathname)) {
    try {
      const { success, reset } = await authMutationLimiter.limit(ip);
      if (!success) return rateLimitedResponse(reset);
    } catch { /* Upstash unavailable — fail open */ }
  }

  // NextAuth sign-in handler (POST to any /api/auth/* route)
  if (pathname.startsWith("/api/auth") && method === "POST") {
    try {
      const { success, reset } = await signInLimiter.limit(ip);
      if (!success) return rateLimitedResponse(reset);
    } catch { /* Upstash unavailable — fail open */ }
  }

  // Match entry — keyed by userId; fall back to IP for unauthenticated attempts
  if (pathname === "/api/matches" && method === "POST") {
    const key = (token?.sub as string | undefined) ?? ip;
    try {
      const { success, reset } = await matchEntryLimiter.limit(key);
      if (!success) return rateLimitedResponse(reset);
    } catch { /* Upstash unavailable — fail open */ }
  }

  // --- Auth / role checks ---

  // Admin UI routes — require admin role, redirect to sign-in otherwise
  if (pathname.startsWith("/admin")) {
    if (!token || token.role !== "admin") {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    return NextResponse.next();
  }

  // Admin API routes — require admin role, return 403 otherwise.
  // Exception: also accept requests authenticated via CRON_SECRET so the
  // Vercel cron job (which has no user session) can reach /api/admin/recompute.
  if (pathname.startsWith("/api/admin")) {
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      return NextResponse.next();
    }
    if (!token || token.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Allow public paths through without a session
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // All other routes require authentication
  if (!token) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
