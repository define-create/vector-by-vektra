"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GameScoreInput, { type GameScore } from "@/components/enter/GameScoreInput";
import EditTimer from "@/components/command/EditTimer";

interface Props {
  matchId: string;
  expiresAt: string;
  team1: string[];
  team2: string[];
  initialGames: { gameOrder: number; team1Score: number; team2Score: number }[];
  initialTag: string;
}

export default function EditMatchClient({
  matchId,
  expiresAt,
  team1,
  team2,
  initialGames,
  initialTag,
}: Props) {
  const router = useRouter();

  const [games, setGames] = useState<GameScore[]>(
    initialGames.map((g) => ({
      gameOrder: g.gameOrder,
      team1Score: g.team1Score,
      team2Score: g.team2Score,
    })),
  );
  const [tag, setTag] = useState(initialTag);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deferredNotice, setDeferredNotice] = useState(false);

  // After showing the deferred notice for 2 seconds, navigate to /command
  useEffect(() => {
    if (!deferredNotice) return;
    const t = setTimeout(() => router.push("/command"), 2000);
    return () => clearTimeout(t);
  }, [deferredNotice, router]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          games: games.map((g) => ({
            gameOrder: g.gameOrder,
            team1Score: Number(g.team1Score) || 0,
            team2Score: Number(g.team2Score) || 0,
          })),
          tag,
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { ratingsDeferred?: boolean };
        if (data.ratingsDeferred) {
          setDeferredNotice(true); // navigate after 2s via useEffect
        } else {
          router.push("/command");
        }
        return;
      }
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Failed to update match.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const label = "text-xs font-medium uppercase tracking-widest text-zinc-500";

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Edit Match</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Scores and event tag can be corrected.</p>
      </div>

      {/* Players — read-only */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-5 py-4 flex flex-col gap-3">
        <p className={label}>Players</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-zinc-500 mb-1">Your team</p>
            <div className="flex flex-col gap-1">
              {team1.map((name) => (
                <span key={name} className="text-sm font-medium text-zinc-200">{name}</span>
              ))}
            </div>
          </div>
          <span className="text-zinc-600 text-sm select-none">vs</span>
          <div className="flex-1 text-right">
            <p className="text-xs text-zinc-500 mb-1">Opponents</p>
            <div className="flex flex-col gap-1">
              {team2.map((name) => (
                <span key={name} className="text-sm font-medium text-zinc-200">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Game Scores — editable */}
      <div className="flex flex-col gap-2">
        <p className={label}>Game Scores</p>
        <GameScoreInput games={games} onChange={setGames} />
      </div>

      {/* Tag — editable */}
      <div className="flex flex-col gap-2">
        <p className={label}>Event (optional)</p>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="e.g. Winter League"
          className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
        />
      </div>

      {/* Edit window countdown */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-800/60 px-4 py-3">
        <span className="text-sm text-zinc-400">Edit window</span>
        <EditTimer expiresAt={expiresAt} />
      </div>

      {deferredNotice && (
        <p className="text-sm text-amber-400">
          Scores updated. Ratings are updating in the background.
        </p>
      )}
      {error && <p className="text-sm text-amber-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || games.length === 0 || deferredNotice}
        className="w-full rounded-xl bg-zinc-100 px-4 py-3.5 text-sm font-semibold text-zinc-900 hover:bg-white active:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
