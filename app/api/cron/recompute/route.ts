import { NextResponse } from "next/server";
import { runRecompute } from "@/lib/services/recompute";
import { revalidatePath, revalidateTag } from "next/cache";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await runRecompute("nightly");
  revalidateTag("command", "default");
  revalidatePath("/command");

  return NextResponse.json({ ok: true, completedAt: new Date().toISOString() });
}
