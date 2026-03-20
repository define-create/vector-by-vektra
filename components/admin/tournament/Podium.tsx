import { type TournamentPlayer } from "@/lib/services/tournament";

interface PodiumProps {
  top3: TournamentPlayer[];
}

interface PodiumSlotProps {
  player?: TournamentPlayer;
  position: 1 | 2 | 3;
}

const HEIGHTS: Record<1 | 2 | 3, string> = {
  1: "h-20",
  2: "h-14",
  3: "h-10",
};
const MEDAL_LABEL: Record<number, string> = { 1: "Gold", 2: "Silver", 3: "Bronze" };
const MEDAL_COLOR: Record<number, string> = {
  1: "text-amber-400",
  2: "text-zinc-400",
  3: "text-orange-400",
};

function PodiumSlot({ player, position }: PodiumSlotProps) {
  const height = HEIGHTS[position];
  const label = player ? (MEDAL_LABEL[player.rank] ?? `#${player.rank}`) : "";
  const color = player ? (MEDAL_COLOR[player.rank] ?? "text-zinc-500") : "text-zinc-500";

  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      {/* Name + record — above the block */}
      <div className="text-center min-h-[3rem] flex flex-col items-center justify-end">
        {player ? (
          <>
            <p className="text-sm font-semibold text-zinc-100 leading-tight text-center">
              {player.displayName}
            </p>
            <p className="text-xs text-zinc-400">
              {player.wins}W – {player.losses}L
            </p>
          </>
        ) : null}
      </div>

      {/* Podium block */}
      <div
        className={`${height} w-full rounded-t-lg bg-zinc-800 flex items-start justify-center pt-2`}
      >
        <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function Podium({ top3 }: PodiumProps) {
  return (
    <div>
      <p className="text-sm uppercase tracking-widest text-zinc-500 mb-3">Podium</p>
      {/* Order: Silver (2nd) · Gold (1st) · Bronze (3rd) */}
      <div className="flex items-end gap-1">
        <PodiumSlot player={top3[1]} position={2} />
        <PodiumSlot player={top3[0]} position={1} />
        <PodiumSlot player={top3[2]} position={3} />
      </div>
    </div>
  );
}
