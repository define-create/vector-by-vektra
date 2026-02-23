import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCommandData } from "@/lib/services/command";

// ---------------------------------------------------------------------------
// GET /api/command
// Returns all data needed for the Command (dashboard) screen.
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getCommandData(session.user.id);
  return NextResponse.json(data);
}
