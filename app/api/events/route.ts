import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEventData } from "@/lib/services/events";

// Public (auth-required) event data endpoint — no admin role check.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tag = req.nextUrl.searchParams.get("tag");

  if (!tag || tag.trim() === "") {
    return NextResponse.json({ error: "tag is required" }, { status: 400 });
  }

  const data = await getEventData(tag.trim());
  return NextResponse.json(data);
}
