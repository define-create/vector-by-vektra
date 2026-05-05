import {
  RatingCardSkeleton,
  DriversGridSkeleton,
  MatchHistorySectionSkeleton,
} from "./skeletons";

export default function CommandLoading() {
  return (
    <div className="flex flex-col">
      <RatingCardSkeleton />
      <DriversGridSkeleton />
      <div className="border-t border-zinc-800/40" />
      <MatchHistorySectionSkeleton />
    </div>
  );
}
