import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/tags
// Returns the distinct tags used in matches entered by the current player.
// Used for autocomplete in the match entry form and the filter sheet.
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await prisma.match.findMany({
    where: {
      enteredByUserId: session.user.id,
      tag: { not: null },
      voidedAt: null,
    },
    select: { tag: true, matchDate: true },
    orderBy: { matchDate: "desc" },
  });

  // Deduplicate, preserving first-seen order (most recent first)
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const m of matches) {
    if (m.tag && !seen.has(m.tag)) {
      seen.add(m.tag);
      tags.push(m.tag);
    }
  }

  return NextResponse.json({ tags });
}
