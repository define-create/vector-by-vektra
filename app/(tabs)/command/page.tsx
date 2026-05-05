import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type CommandFilter } from "@/lib/services/command";
import RatingCard from "./RatingCard";
import DriversGrid from "./DriversGrid";
import MatchHistorySection from "./MatchHistorySection";
import EditTimerLink from "./EditTimerLink";
import {
  RatingCardSkeleton,
  DriversGridSkeleton,
  MatchHistorySectionSkeleton,
  EditTimerLinkSkeleton,
} from "./skeletons";

export default async function CommandPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tag?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const params = await searchParams;

  const filter: CommandFilter | undefined =
    params.from || params.to || params.tag
      ? {
          from: params.from ? new Date(params.from) : undefined,
          to: params.to ? new Date(params.to) : undefined,
          tag: params.tag,
        }
      : undefined;

  // Direct uncached check — cache cannot interfere with this redirect
  const playerExists = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { id: true },
  });
  if (!playerExists) redirect("/setup");

  const userId = session.user.id;

  return (
    <div className="flex flex-col">
      <Suspense fallback={<RatingCardSkeleton />}>
        <RatingCard userId={userId} filter={filter} />
      </Suspense>

      <Suspense fallback={<DriversGridSkeleton />}>
        <DriversGrid userId={userId} filter={filter} />
      </Suspense>

      <div className="border-t border-zinc-800/40" />

      <Suspense fallback={<MatchHistorySectionSkeleton />}>
        <MatchHistorySection userId={userId} filter={filter} />
      </Suspense>

      <Suspense fallback={<EditTimerLinkSkeleton />}>
        <EditTimerLink userId={userId} filter={filter} />
      </Suspense>
    </div>
  );
}
