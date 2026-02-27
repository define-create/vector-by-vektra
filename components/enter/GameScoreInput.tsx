"use client";

import { useRef } from "react";

export interface GameScore {
  gameOrder: number;
  team1Score: number | "";
  team2Score: number | "";
}

interface GameScoreInputProps {
  games: GameScore[];
  onChange: (games: GameScore[]) => void;
}

export default function GameScoreInput({ games, onChange }: GameScoreInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateScore = (
    gameIndex: number,
    field: "team1Score" | "team2Score",
    raw: string,
  ) => {
    const parsed = raw === "" ? "" : parseInt(raw, 10);
    const updated = games.map((g, i) =>
      i === gameIndex ? { ...g, [field]: isNaN(parsed as number) ? "" : parsed } : g,
    );
    onChange(updated);

    // Auto-advance focus: after entering team1Score advance to team2Score of same game;
    // after team2Score advance to team1Score of next game (if exists).
    if (raw.length >= 2 && !isNaN(Number(raw))) {
      const currentInputIndex = gameIndex * 2 + (field === "team1Score" ? 0 : 1);
      const nextRef = inputRefs.current[currentInputIndex + 1];
      if (nextRef) {
        nextRef.focus();
        nextRef.select();
      }
    }
  };

  const addGame = () => {
    onChange([
      ...games,
      { gameOrder: games.length + 1, team1Score: "", team2Score: "" },
    ]);
  };

  const removeGame = (index: number) => {
    const updated = games
      .filter((_, i) => i !== index)
      .map((g, i) => ({ ...g, gameOrder: i + 1 }));
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="text-sm font-medium text-zinc-400">Game Scores</label>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 text-sm font-medium text-zinc-500">
        <span className="w-8" />
        <span className="text-center">Your team</span>
        <span className="text-center">Opponents</span>
        <span className="w-6" />
      </div>

      {games.map((game, gi) => (
        <div
          key={game.gameOrder}
          className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3"
        >
          <span className="w-8 text-center text-sm text-zinc-500">G{gi + 1}</span>

          <input
            ref={(el) => { inputRefs.current[gi * 2] = el; }}
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            value={game.team1Score}
            onChange={(e) => updateScore(gi, "team1Score", e.target.value)}
            placeholder="0"
            className="rounded-lg border border-zinc-600 bg-zinc-800 py-3 text-center text-xl font-semibold text-zinc-50 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none"
          />

          <input
            ref={(el) => { inputRefs.current[gi * 2 + 1] = el; }}
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            value={game.team2Score}
            onChange={(e) => updateScore(gi, "team2Score", e.target.value)}
            placeholder="0"
            className="rounded-lg border border-zinc-600 bg-zinc-800 py-3 text-center text-xl font-semibold text-zinc-50 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none"
          />

          {games.length > 1 ? (
            <button
              type="button"
              onClick={() => removeGame(gi)}
              aria-label={`Remove game ${gi + 1}`}
              className="w-6 text-zinc-600 hover:text-rose-400"
            >
              ✕
            </button>
          ) : (
            <span className="w-6" />
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addGame}
        className="mt-1 rounded-lg border border-dashed border-zinc-600 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"
      >
        + Add game
      </button>
    </div>
  );
}
