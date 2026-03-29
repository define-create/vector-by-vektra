import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/players/me/preferences
// Body: { optOutPredictions: boolean }
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { optOutPredictions?: unknown };
  if (typeof body.optOutPredictions !== "boolean") {
    return NextResponse.json({ error: "optOutPredictions must be a boolean" }, { status: 400 });
  }

  const updated = await prisma.player.updateMany({
    where: { userId: session.user.id, deletedAt: null },
    data: { optOutPredictions: body.optOutPredictions },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "No player profile found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
