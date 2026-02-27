"use client";

import { useState } from "react";
import PlayerSelector from "@/components/enter/PlayerSelector";

interface RecentPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
}

export interface SlotPlayer {
  id: string;
  name: string;
}

interface PlayerPairSelectorProps {
  recentPlayers?: RecentPlayer[];
  initialPartner?: SlotPlayer | null;
  initialOpp1?: SlotPlayer | null;
  initialOpp2?: SlotPlayer | null;
  onChange: (values: {
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
  initialPartner = null,
  initialOpp1 = null,
  initialOpp2 = null,
  onChange,
}: PlayerPairSelectorProps) {
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
    p: typeof partner,
    o1: typeof opp1,
    o2: typeof opp2,
  ) {
    onChange({
      partner: toSlot(p),
      opp1: toSlot(o1),
      opp2: toSlot(o2),
    });
  }

  function handlePartner(v: { id?: string; name?: string } | null) {
    setPartner(v);
    notify(v, opp1, opp2);
  }
  function handleOpp1(v: { id?: string; name?: string } | null) {
    setOpp1(v);
    notify(partner, v, opp2);
  }
  function handleOpp2(v: { id?: string; name?: string } | null) {
    setOpp2(v);
    notify(partner, opp1, v);
  }

  const excludePartner = [opp1?.id, opp2?.id].filter(Boolean) as string[];
  const excludeOpp1 = [partner?.id, opp2?.id].filter(Boolean) as string[];
  const excludeOpp2 = [partner?.id, opp1?.id].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-xs">
        <PlayerSelector
          label="Your Partner"
          value={partner}
          onChange={handlePartner}
          recentPlayers={recentPlayers}
          excludeIds={excludePartner}
        />
      </div>

      <div className="h-px bg-zinc-700" />

      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        Opponents
      </p>

      <div className="max-w-xs">
        <PlayerSelector
          label="Opponent 1"
          value={opp1}
          onChange={handleOpp1}
          recentPlayers={recentPlayers}
          excludeIds={excludeOpp1}
        />
      </div>
      <div className="max-w-xs">
        <PlayerSelector
          label="Opponent 2"
          value={opp2}
          onChange={handleOpp2}
          recentPlayers={recentPlayers}
          excludeIds={excludeOpp2}
        />
      </div>
    </div>
  );
}
