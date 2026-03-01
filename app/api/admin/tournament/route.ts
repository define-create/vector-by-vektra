import { type NextRequest, NextResponse } from "next/server";
import { getTournamentData } from "@/lib/services/tournament";

// Middleware at middleware.ts already guards all /api/admin/* routes.

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");

  if (!tag || tag.trim() === "") {
    return NextResponse.json({ error: "tag is required" }, { status: 400 });
  }

  const data = await getTournamentData(tag.trim());
  return NextResponse.json(data);
}
