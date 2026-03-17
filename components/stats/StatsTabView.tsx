"use client";

import { useState } from "react";
import { TrajectorySection } from "@/components/trajectory/TrajectorySection";
import MatchupsClient from "@/components/matchups/MatchupsClient";
import { type SlotPlayer } from "@/components/matchups/PlayerPairSelector";

interface RecentPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  matchCount: number;
}

interface StatsTabViewProps {
  myPlayerId: string | null;
  recentOpponents: RecentPlayer[];
  initialPartner: SlotPlayer | null;
  initialOpp1: SlotPlayer | null;
  initialOpp2: SlotPlayer | null;
  initialTab?: "stats" | "matchup";
  isAdmin: boolean;
}

export default function StatsTabView({
  myPlayerId,
  recentOpponents,
  initialPartner,
  initialOpp1,
  initialOpp2,
  initialTab = "stats",
  isAdmin,
}: StatsTabViewProps) {
  const [tab, setTab] = useState<"stats" | "matchup">(initialTab);

  return (
    <div className="flex h-full flex-col">
      {/* Underline tab bar */}
      <div className="flex border-b border-zinc-800 px-5 flex-shrink-0">
        <button
          type="button"
          onClick={() => setTab("stats")}
          className={[
            "flex-1 py-3 text-sm font-semibold transition-colors relative",
            tab === "stats" ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
          ].join(" ")}
        >
          Match Stats
          {tab === "stats" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-emerald-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("matchup")}
          className={[
            "flex-1 py-3 text-sm font-semibold transition-colors relative",
            tab === "matchup" ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
          ].join(" ")}
        >
          Matchup
          {tab === "matchup" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-emerald-500" />
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "stats" && <TrajectorySection />}
        {tab === "matchup" && (
          myPlayerId ? (
            <MatchupsClient
              myPlayerId={myPlayerId}
              recentOpponents={recentOpponents}
              initialPartner={initialPartner}
              initialOpp1={initialOpp1}
              initialOpp2={initialOpp2}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="flex flex-col p-5">
              <h2 className="text-base font-semibold text-zinc-50 mb-2">Matchup Projection</h2>
              <p className="text-sm text-zinc-500">No matches yet. Enter a match first.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
