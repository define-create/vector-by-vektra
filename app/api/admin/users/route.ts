import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/admin/users?q=<email search>
// Admin: search users by email (case-insensitive, partial match).
// Returns up to 10 results with basic profile info.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q");
  if (!q || !q.trim()) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: {
      email: { contains: q.trim(), mode: "insensitive" },
    },
    select: {
      id: true,
      email: true,
      handle: true,
      displayName: true,
      emailVerifiedAt: true,
      player: { select: { id: true, deletedAt: true } },
    },
    take: 10,
  });

  const results = users.map((u) => ({
    id: u.id,
    email: u.email,
    handle: u.handle,
    displayName: u.displayName,
    emailVerified: u.emailVerifiedAt !== null,
    hasActivePlayer: u.player !== null && u.player.deletedAt === null,
  }));

  return NextResponse.json({ users: results });
}
