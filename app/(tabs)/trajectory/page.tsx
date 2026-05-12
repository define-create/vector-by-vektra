import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shouldShowPreview } from "@/lib/services/preview-mode";
import { buildDemoCommandData } from "@/lib/services/demo-command-data";
import { PreviewBanner } from "@/components/PreviewBanner";
import { TrajectorySection, type TrajectoryData } from "@/components/trajectory/TrajectorySection";

export default async function TrajectoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const player = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { displayName: true },
  });
  if (!player) redirect("/setup");

  const showPreview = await shouldShowPreview(session.user.id);

  let preview: TrajectoryData | undefined;
  if (showPreview) {
    const demo = buildDemoCommandData(player.displayName);
    const wins = demo.recentMatchHistory.filter((m) => m.outcome === "win").length;
    const losses = demo.recentMatchHistory.length - wins;
    preview = {
      ratingSeries: demo.ratingHistory.map((p) => ({ matchDate: p.date, rating: p.rating })),
      winRate: demo.winPct,
      record: { wins, losses },
      pointDifferential: 18, // plausible positive value matching the demo trajectory's mild upward trend
    };
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {showPreview && <PreviewBanner />}
      <TrajectorySection previewOverride={preview} />
    </div>
  );
}
