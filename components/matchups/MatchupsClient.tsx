"use client";

import { useState, useEffect } from "react";
import PlayerPairSelector, { type SlotPlayer } from "@/components/matchups/PlayerPairSelector";
import ProjectionCard from "@/components/matchups/ProjectionCard";
import HistoryCard from "@/components/matchups/HistoryCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
}

interface MatchupResponse {
  probability: number;
  moneyline: number | "Even";
  ratingDiff: number;
  confidence: number;
  volatility: string;
  momentum: number;
  expectationGap: number;
  expectationGapLowSample: boolean;
  history: Array<{
    date: string;
    result: "W" | "L";
    score: string;
    delta: number;
  }>;
  record: string;
  avgMargin: number;
  players: {
    player1: { id: string; displayName: string };
    player2: { id: string; displayName: string };
    player3: { id: string; displayName: string };
    player4: { id: string; displayName: string };
  };
}

interface MatchupsClientProps {
  myPlayerId: string;
  recentOpponents: RecentPlayer[];
  initialPartner: SlotPlayer | null;
  initialOpp1: SlotPlayer | null;
  initialOpp2: SlotPlayer | null;
}

// ---------------------------------------------------------------------------
// Chevron icon
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MatchupsClient({
  myPlayerId,
  recentOpponents,
  initialPartner,
  initialOpp1,
  initialOpp2,
}: MatchupsClientProps) {
  const [partner, setPartner] = useState<SlotPlayer | null>(initialPartner);
  const [opp1, setOpp1] = useState<SlotPlayer | null>(initialOpp1);
  const [opp2, setOpp2] = useState<SlotPlayer | null>(initialOpp2);
  const [data, setData] = useState<MatchupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collapse by default when all players are pre-populated (long-press from Command screen).
  // Expand by default when the user navigates from the bottom nav with no pre-selection.
  const [isCollapsed, setIsCollapsed] = useState(
    initialPartner !== null && initialOpp1 !== null && initialOpp2 !== null,
  );

  const allSelected = partner !== null && opp1 !== null && opp2 !== null;

  // Auto-collapse once all 4 players are selected
  useEffect(() => {
    if (allSelected) setIsCollapsed(true);
  }, [allSelected]);

  // Summary line shown in the collapsed header
  const selectionSummary = allSelected
    ? `You / ${partner.name}  vs  ${opp1.name} / ${opp2.name}`
    : "Tap to select players";

  useEffect(() => {
    if (!allSelected) {
      setData(null);
      setError(null);
      return;
    }

    const url = `/api/matchup?player1=${myPlayerId}&player2=${partner.id}&player3=${opp1.id}&player4=${opp2.id}`;
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json() as Promise<MatchupResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [myPlayerId, partner?.id, opp1?.id, opp2?.id, allSelected]);

  return (
    <div className="flex flex-col p-5 gap-6 pb-24">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">Matchup Projection</h1>
        <p className="text-sm text-zinc-500">Model Output · Fair Line</p>
      </div>

      {/* Collapsible player selector */}
      <div className="rounded-xl border border-[#374155]">
        {/* Toggle header — always visible */}
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Select Players
            </span>
            {isCollapsed && (
              <span className="text-sm text-zinc-300">{selectionSummary}</span>
            )}
          </div>
          <Chevron open={!isCollapsed} />
        </button>

        {/* Expandable body */}
        {!isCollapsed && (
          <div className="px-5 pb-5">
            <PlayerPairSelector
              recentPlayers={recentOpponents}
              initialPartner={partner}
              initialOpp1={opp1}
              initialOpp2={opp2}
              onChange={({ partner: p, opp1: o1, opp2: o2 }) => {
                setPartner(p);
                setOpp1(o1);
                setOpp2(o2);
              }}
            />
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <p className="text-sm text-zinc-500">Computing projection…</p>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-xl border border-zinc-700 p-4">
          <p className="text-sm text-zinc-400">Failed to load projection: {error}</p>
        </div>
      )}

      {/* Projection results */}
      {data && !loading && (
        <>
          <ProjectionCard
            probability={data.probability}
            moneyline={data.moneyline}
            ratingDiff={data.ratingDiff}
            confidence={data.confidence}
            volatility={data.volatility}
            momentum={data.momentum}
            expectationGap={data.expectationGap}
            expectationGapLowSample={data.expectationGapLowSample}
            players={data.players}
            myPlayerId={myPlayerId}
          />
          <HistoryCard
            history={data.history}
            record={data.record}
            avgMargin={data.avgMargin}
          />
        </>
      )}
    </div>
  );
}
