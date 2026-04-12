"use client";

import { useState, useEffect, useRef } from "react";
import PlayerSelector from "@/components/enter/PlayerSelector";
import GameScoreInput, { type GameScore } from "@/components/enter/GameScoreInput";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchPlayer {
  id: string;
  displayName: string;
}

interface AdminMatch {
  id: string;
  matchDate: string;
  tag: string | null;
  team1: MatchPlayer[];
  team2: MatchPlayer[];
  games: { id: string; gameOrder: number; team1Score: number; team2Score: number }[];
}

interface PlayerValue {
  id?: string;
  name?: string;
  rating?: number;
  matchCount?: number;
}

interface EditMatchModalProps {
  match: AdminMatch;
  onClose: () => void;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateInputValue(iso: string): string {
  // AdminMatch.matchDate comes as ISO string from API; take the date portion
  return iso.slice(0, 10);
}

function playerToValue(p: MatchPlayer): PlayerValue {
  return { id: p.id, name: p.displayName };
}

// ---------------------------------------------------------------------------
// EditMatchModal
// ---------------------------------------------------------------------------

export default function EditMatchModal({ match, onClose, onSaved }: EditMatchModalProps) {
  // Player slots
  const [t1p1, setT1p1] = useState<PlayerValue | null>(playerToValue(match.team1[0]));
  const [t1p2, setT1p2] = useState<PlayerValue | null>(playerToValue(match.team1[1]));
  const [t2p1, setT2p1] = useState<PlayerValue | null>(playerToValue(match.team2[0]));
  const [t2p2, setT2p2] = useState<PlayerValue | null>(playerToValue(match.team2[1]));

  // Disambiguation ok flags
  const [t1p1Ok, setT1p1Ok] = useState(true);
  const [t1p2Ok, setT1p2Ok] = useState(true);
  const [t2p1Ok, setT2p1Ok] = useState(true);
  const [t2p2Ok, setT2p2Ok] = useState(true);

  // Scores, tag, date
  const [games, setGames] = useState<GameScore[]>(
    match.games
      .sort((a, b) => a.gameOrder - b.gameOrder)
      .map((g) => ({
        gameOrder: g.gameOrder,
        team1Score: g.team1Score,
        team2Score: g.team2Score,
      })),
  );
  const [tag, setTag] = useState(match.tag ?? "");
  const [matchDate, setMatchDate] = useState(toDateInputValue(match.matchDate));
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tag suggestions — /api/admin/tags returns { tags: { tag: string, count: number }[] }
  useEffect(() => {
    fetch("/api/admin/tags")
      .then((r) => r.json())
      .then((d: { tags?: { tag: string; count: number }[] }) =>
        setTagSuggestions((d.tags ?? []).map((t) => t.tag))
      )
      .catch(() => {});
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saving, onClose]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const selectedIds = [t1p1?.id, t1p2?.id, t2p1?.id, t2p2?.id].filter(Boolean) as string[];

  function canSave(): boolean {
    if (saving) return false;
    const allFilled = !!(t1p1?.id) && t1p1Ok
      && !!(t1p2?.id) && t1p2Ok
      && !!(t2p1?.id) && t2p1Ok
      && !!(t2p2?.id) && t2p2Ok;
    if (!allFilled) return false;
    if (games.length === 0) return false;
    if (games.some((g) => g.team1Score === "" || g.team2Score === "")) return false;
    if (!matchDate) return false;
    return true;
  }

  // Derive outcome from scores for WIN badge display
  function deriveOutcome(): "win" | "loss" | null {
    const completed = games.filter((g) => g.team1Score !== "" && g.team2Score !== "");
    if (completed.length === 0) return null;
    const t1Wins = completed.filter((g) => (g.team1Score as number) > (g.team2Score as number)).length;
    const t2Wins = completed.filter((g) => (g.team2Score as number) > (g.team1Score as number)).length;
    if (t1Wins > t2Wins) return "win";
    if (t2Wins > t1Wins) return "loss";
    return null;
  }
  const outcome = deriveOutcome();

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/admin/matches/${match.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1: [t1p1!.id, t1p2!.id],
          team2: [t2p1!.id, t2p2!.id],
          games: games.map((g) => ({
            gameOrder: g.gameOrder,
            team1Score: Number(g.team1Score),
            team2Score: Number(g.team2Score),
          })),
          tag: tag.trim() || null,
          matchDate,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save. Please try again.");
        return;
      }

      onSaved();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const teamBorderClass = (side: "win" | "loss") =>
    outcome === side
      ? "border-emerald-500/70"
      : outcome !== null
      ? "border-zinc-700/30"
      : "border-zinc-700/60";

  const badgeClass = (side: "win" | "loss") => {
    if (outcome === side) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (outcome !== null) return "bg-rose-500/20 text-rose-400 border-rose-500/30";
    return "bg-zinc-700/50 text-zinc-500 border-zinc-600/50";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-6"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-zinc-50">Edit Match</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Original match will be voided and replaced</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5" style={{ maxHeight: "70vh" }}>

          {/* Match Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Match Date
            </label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-50 focus:border-zinc-400 focus:outline-none text-sm"
            />
          </div>

          {/* Team 1 card */}
          <div className={`rounded-2xl border bg-zinc-800/40 px-4 py-3 flex flex-col gap-2 transition-colors ${teamBorderClass("win")}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Team 1</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold border ${badgeClass("win")}`}>
                {outcome === "win" ? "WIN" : outcome === "loss" ? "LOSS" : "WIN?"}
              </span>
            </div>
            <PlayerSelector
              value={t1p1}
              onChange={(v) => { setT1p1(v); if (!v) setT1p1Ok(true); }}
              onDisambiguated={setT1p1Ok}
              excludeIds={selectedIds.filter((id) => id !== t1p1?.id)}
            />
            <PlayerSelector
              value={t1p2}
              onChange={(v) => { setT1p2(v); if (!v) setT1p2Ok(true); }}
              onDisambiguated={setT1p2Ok}
              excludeIds={selectedIds.filter((id) => id !== t1p2?.id)}
            />
          </div>

          {/* VS divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-zinc-700/60" />
            <span className="text-xs font-bold tracking-widest text-zinc-600">VS</span>
            <div className="flex-1 border-t border-zinc-700/60" />
          </div>

          {/* Team 2 card */}
          <div className={`rounded-2xl border bg-zinc-800/40 px-4 py-3 flex flex-col gap-2 transition-colors ${teamBorderClass("loss")}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Team 2</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold border ${badgeClass("loss")}`}>
                {outcome === "loss" ? "WIN" : outcome === "win" ? "LOSS" : "WIN?"}
              </span>
            </div>
            <PlayerSelector
              value={t2p1}
              onChange={(v) => { setT2p1(v); if (!v) setT2p1Ok(true); }}
              onDisambiguated={setT2p1Ok}
              excludeIds={selectedIds.filter((id) => id !== t2p1?.id)}
            />
            <PlayerSelector
              value={t2p2}
              onChange={(v) => { setT2p2(v); if (!v) setT2p2Ok(true); }}
              onDisambiguated={setT2p2Ok}
              excludeIds={selectedIds.filter((id) => id !== t2p2?.id)}
            />
          </div>

          {/* Scores */}
          <GameScoreInput games={games} onChange={setGames} />

          {/* Event tag */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Event</p>
            <div className="relative">
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. Winter League, Club Night…"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm pr-8"
              />
              {tag && (
                <button
                  type="button"
                  onClick={() => setTag("")}
                  aria-label="Clear event tag"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            {tagSuggestions.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tagSuggestions.slice(0, 5).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className="flex-shrink-0 rounded-full border border-zinc-600 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audit note */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-xs text-zinc-500 space-y-0.5">
            <p className="font-medium text-zinc-400">What happens on Save:</p>
            <p>· Original match is voided (history preserved)</p>
            <p>· A new match record is created with your changes</p>
            <p>· All player ratings are recomputed forward from this date</p>
          </div>

          {/* Error banner */}
          {saveError && (
            <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-rose-400 text-sm">
              {saveError}
            </p>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-zinc-600 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave()}
            className={[
              "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2",
              canSave()
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-zinc-700 text-zinc-500 cursor-not-allowed",
            ].join(" ")}
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
