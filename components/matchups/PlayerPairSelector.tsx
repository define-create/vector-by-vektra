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

function toSlot(v: { id?: string; name?: string } | null): SlotPlayer | null {
  if (v?.id && v.name) return { id: v.id, name: v.name };
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
  const [player1, setPlayer1] = useState<{ id?: string; name?: string } | null>(
    initialPlayer1,
  );
  const [partner, setPartner] = useState<{ id?: string; name?: string } | null>(
    initialPartner,
  );
  const [opp1, setOpp1] = useState<{ id?: string; name?: string } | null>(
    initialOpp1,
  );
  const [opp2, setOpp2] = useState<{ id?: string; name?: string } | null>(
    initialOpp2,
  );

  function notify(
    p1: typeof player1,
    p: typeof partner,
    o1: typeof opp1,
    o2: typeof opp2,
  ) {
    onChange({
      player1: toSlot(p1),
      partner: toSlot(p),
      opp1: toSlot(o1),
      opp2: toSlot(o2),
    });
  }

  function handlePlayer1(v: { id?: string; name?: string } | null) {
    setPlayer1(v);
    notify(v, partner, opp1, opp2);
  }
  function handlePartner(v: { id?: string; name?: string } | null) {
    setPartner(v);
    notify(player1, v, opp1, opp2);
  }
  function handleOpp1(v: { id?: string; name?: string } | null) {
    setOpp1(v);
    notify(player1, partner, v, opp2);
  }
  function handleOpp2(v: { id?: string; name?: string } | null) {
    setOpp2(v);
    notify(player1, partner, opp1, v);
  }

  const adminIds = adminMode ? [player1?.id] : [];
  const excludePlayer1 = [partner?.id, opp1?.id, opp2?.id].filter(Boolean) as string[];
  const excludePartner = [...adminIds, opp1?.id, opp2?.id].filter(Boolean) as string[];
  const excludeOpp1 = [...adminIds, partner?.id, opp2?.id].filter(Boolean) as string[];
  const excludeOpp2 = [...adminIds, partner?.id, opp1?.id].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
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
