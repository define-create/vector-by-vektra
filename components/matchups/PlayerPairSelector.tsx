"use client";

import { useState } from "react";
import PlayerSelector from "@/components/enter/PlayerSelector";

interface RecentPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  matchCount: number;
}

export interface SlotPlayer {
  id: string;
  name: string;
  claimed?: boolean;
}

interface PlayerPairSelectorProps {
  recentPlayers?: RecentPlayer[];
  adminMode?: boolean;
  initialPlayer1?: SlotPlayer | null;
  initialPartner?: SlotPlayer | null;
  initialOpp1?: SlotPlayer | null;
  initialOpp2?: SlotPlayer | null;
  onChange: (values: {
    player1: SlotPlayer | null;
    partner: SlotPlayer | null;
    opp1: SlotPlayer | null;
    opp2: SlotPlayer | null;
  }) => void;
}

type SlotValue = { id?: string; name?: string; claimed?: boolean } | null;

function toSlot(v: SlotValue): SlotPlayer | null {
  if (v?.id && v.name) return { id: v.id, name: v.name, claimed: v.claimed };
  return null;
}

export default function PlayerPairSelector({
  recentPlayers = [],
  adminMode = false,
  initialPlayer1 = null,
  initialPartner = null,
  initialOpp1 = null,
  initialOpp2 = null,
  onChange,
}: PlayerPairSelectorProps) {
  const [player1, setPlayer1] = useState<SlotValue>(initialPlayer1);
  const [partner, setPartner] = useState<SlotValue>(initialPartner);
  const [opp1, setOpp1] = useState<SlotValue>(initialOpp1);
  const [opp2, setOpp2] = useState<SlotValue>(initialOpp2);

  function notify(p1: SlotValue, p: SlotValue, o1: SlotValue, o2: SlotValue) {
    onChange({
      player1: toSlot(p1),
      partner: toSlot(p),
      opp1: toSlot(o1),
      opp2: toSlot(o2),
    });
  }

  function handlePlayer1(v: SlotValue) { setPlayer1(v); notify(v, partner, opp1, opp2); }
  function handlePartner(v: SlotValue) { setPartner(v); notify(player1, v, opp1, opp2); }
  function handleOpp1(v: SlotValue) { setOpp1(v); notify(player1, partner, v, opp2); }
  function handleOpp2(v: SlotValue) { setOpp2(v); notify(player1, partner, opp1, v); }

  function assignChip(p: RecentPlayer) {
    const val = { id: p.id, name: p.displayName, claimed: p.claimed };
    if (adminMode) {
      if (!player1?.id && !player1?.name) { setPlayer1(val); notify(val, partner, opp1, opp2); return; }
      if (!partner?.id && !partner?.name) { setPartner(val); notify(player1, val, opp1, opp2); return; }
    } else {
      if (!partner?.id && !partner?.name) { setPartner(val); notify(player1, val, opp1, opp2); return; }
    }
    if (!opp1?.id && !opp1?.name) { setOpp1(val); notify(player1, partner, val, opp2); return; }
    if (!opp2?.id && !opp2?.name) { setOpp2(val); notify(player1, partner, opp1, val); return; }
  }

  const adminIds = adminMode ? [player1?.id] : [];
  const excludePlayer1 = [partner?.id, opp1?.id, opp2?.id].filter(Boolean) as string[];
  const excludePartner = [...adminIds, opp1?.id, opp2?.id].filter(Boolean) as string[];
  const excludeOpp1 = [...adminIds, partner?.id, opp2?.id].filter(Boolean) as string[];
  const excludeOpp2 = [...adminIds, partner?.id, opp1?.id].filter(Boolean) as string[];

  const selectedIds = new Set([player1?.id, partner?.id, opp1?.id, opp2?.id].filter(Boolean) as string[]);
  const availableChips = recentPlayers.filter((p) => !selectedIds.has(p.id));

  return (
    <div className="flex flex-col gap-5">
      {/* Recent players chip strip */}
      {availableChips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {availableChips.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => assignChip(p)}
              className="flex-shrink-0 rounded-full bg-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-600 active:bg-zinc-500 transition-colors"
            >
              {p.displayName}
            </button>
          ))}
        </div>
      )}

      {adminMode && (
        <div className="max-w-xs">
          <PlayerSelector
            key={`player1-${adminMode}`}
            label="Player 1"
            value={player1}
            onChange={handlePlayer1}
            excludeIds={excludePlayer1}
          />
        </div>
      )}

      <div className="max-w-xs">
        <PlayerSelector
          key={`partner-${adminMode}`}
          label={adminMode ? "Player 2" : "Your Partner"}
          value={partner}
          onChange={handlePartner}
          excludeIds={excludePartner}
        />
      </div>

      <div className="h-px bg-zinc-700" />

      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        Opponents
      </p>

      <div className="max-w-xs">
        <PlayerSelector
          key={`opp1-${adminMode}`}
          label="Opponent 1"
          value={opp1}
          onChange={handleOpp1}
          excludeIds={excludeOpp1}
        />
      </div>
      <div className="max-w-xs">
        <PlayerSelector
          key={`opp2-${adminMode}`}
          label="Opponent 2"
          value={opp2}
          onChange={handleOpp2}
          excludeIds={excludeOpp2}
        />
      </div>
    </div>
  );
}
