import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/share/[token]
//
// Public — no authentication required. Hashes the incoming token, looks up
// the MatchupShare record, increments viewCount, and returns the snapshot JSON.
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const share = await prisma.matchupShare.findUnique({
    where: { tokenHash },
  });

  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  // Increment viewCount asynchronously (fire-and-forget)
  prisma.matchupShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => { /* non-critical */ });

  // Return snapshot JSON only — no internal IDs
  return NextResponse.json(share.snapshotJson);
}
