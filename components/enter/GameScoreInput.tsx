"use client";

import { useRef, useImperativeHandle, forwardRef, useState } from "react";

export interface GameScore {
  gameOrder: number;
  team1Score: number | "";
  team2Score: number | "";
}

export interface GameScoreHandle {
  focusScore: (gameIndex: number, field: "team1Score" | "team2Score") => void;
}

interface GameScoreInputProps {
  games: GameScore[];
  onChange: (games: GameScore[]) => void;
  outcome?: "win" | "loss" | null;
}

const GameScoreInput = forwardRef<GameScoreHandle, GameScoreInputProps>(
function GameScoreInput({ games, onChange, outcome }, ref) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [activeField, setActiveField] = useState<{ gi: number; field: "team1Score" | "team2Score" }>({ gi: 0, field: "team1Score" });

  useImperativeHandle(ref, () => ({
    focusScore(gameIndex: number, field: "team1Score" | "team2Score") {
      const idx = gameIndex * 2 + (field === "team1Score" ? 0 : 1);
      const el = inputRefs.current[idx];
      if (el) { el.focus(); el.select(); }
    },
  }));

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

  const stepActive = (delta: 1 | -1) => {
    const { gi, field } = activeField;
    const current = games[gi]?.[field];
    const val = current === "" ? 0 : current;
    const next = Math.max(0, Math.min(99, val + delta));
    onChange(games.map((g, i) => i === gi ? { ...g, [field]: next } : g));
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

  const isActive = (gi: number, field: "team1Score" | "team2Score") =>
    activeField.gi === gi && activeField.field === field;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">Game Scores</label>
        <button
          type="button"
          onClick={addGame}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          + add game
        </button>
      </div>

      {games.map((game, gi) => (
        <div key={game.gameOrder} className="flex items-stretch justify-center gap-1">
          {/* Minus bookend */}
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); stepActive(-1); }}
            aria-label="Decrease score"
            className="w-12 flex items-center justify-center text-3xl font-bold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700 active:text-zinc-50 rounded-lg transition-colors select-none"
          >
            −
          </button>

          {/* Scores */}
          <div className="flex items-center justify-center gap-2">
            <input
              ref={(el) => { inputRefs.current[gi * 2] = el; }}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={game.team1Score}
              onFocus={() => setActiveField({ gi, field: "team1Score" })}
              onChange={(e) => updateScore(gi, "team1Score", e.target.value)}
              placeholder="0"
              className={[
                "w-16 rounded-lg border bg-zinc-800 py-2 text-center text-lg font-semibold text-zinc-50 placeholder-zinc-600 focus:outline-none transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                game.team1Score !== "" && outcome === "win"
                  ? "border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                  : game.team1Score !== "" && outcome === "loss"
                  ? "border-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]"
                  : isActive(gi, "team1Score")
                  ? "border-zinc-400"
                  : "border-zinc-600",
              ].join(" ")}
            />

            <span className="text-zinc-600 text-sm select-none">—</span>

            <input
              ref={(el) => { inputRefs.current[gi * 2 + 1] = el; }}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={game.team2Score}
              onFocus={() => setActiveField({ gi, field: "team2Score" })}
              onChange={(e) => updateScore(gi, "team2Score", e.target.value)}
              placeholder="0"
              className={[
                "w-16 rounded-lg border bg-zinc-800 py-2 text-center text-lg font-semibold text-zinc-50 placeholder-zinc-600 focus:outline-none transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                game.team2Score !== "" && outcome === "loss"
                  ? "border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                  : game.team2Score !== "" && outcome === "win"
                  ? "border-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]"
                  : isActive(gi, "team2Score")
                  ? "border-zinc-400"
                  : "border-zinc-600",
              ].join(" ")}
            />
          </div>

          {/* Plus bookend */}
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); stepActive(1); }}
            aria-label="Increase score"
            className="w-12 flex items-center justify-center text-3xl font-bold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700 active:text-zinc-50 rounded-lg transition-colors select-none"
          >
            +
          </button>

          {/* Remove game */}
          {games.length > 1 ? (
            <button
              type="button"
              onClick={() => removeGame(gi)}
              aria-label={`Remove game ${gi + 1}`}
              className="w-6 text-xs text-zinc-600 hover:text-rose-400 transition-colors"
            >
              ✕
            </button>
          ) : <div className="w-6" />}
        </div>
      ))}
    </div>
  );
});

export default GameScoreInput;
