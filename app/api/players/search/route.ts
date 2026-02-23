import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/players/search?q=<query>
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ players: [] });
  }

  const players = await prisma.player.findMany({
    where: {
      displayName: { contains: q, mode: "insensitive" },
      deletedAt: null,
    },
    select: {
      id: true,
      displayName: true,
      rating: true,
      claimed: true,
    },
    orderBy: { displayName: "asc" },
    take: 10,
  });

  return NextResponse.json({ players });
}
