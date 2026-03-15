"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PlayerSelector from "@/components/enter/PlayerSelector";
import OutcomeToggle from "@/components/enter/OutcomeToggle";
import GameScoreInput, { type GameScore } from "@/components/enter/GameScoreInput";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Player {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  matchCount: number;
}

interface PlayerValue {
  id?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// EnterPage
// ---------------------------------------------------------------------------

export default function EnterPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // Admin mode
  const [adminMode, setAdminMode] = useState(false);

  // Form state
  const [matchDate] = useState(() => new Date().toISOString());
  const [team1Player1, setTeam1Player1] = useState<PlayerValue | null>(null);
  const [partner, setPartner] = useState<PlayerValue | null>(null);
  const [opponent1, setOpponent1] = useState<PlayerValue | null>(null);
  const [opponent2, setOpponent2] = useState<PlayerValue | null>(null);
  const [outcome, setOutcome] = useState<"win" | "loss" | null>(null);
  const [games, setGames] = useState<GameScore[]>([
    { gameOrder: 1, team1Score: "", team2Score: "" },
  ]);

  // Recent players for chips
  const [recentPartners, setRecentPartners] = useState<Player[]>([]);
  const [recentOpponents, setRecentOpponents] = useState<Player[]>([]);

  // Tag state
  const [tag, setTag] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  // Disambiguation ok-flags
  const [partnerOk, setPartnerOk] = useState(true);
  const [team1Player1Ok, setTeam1Player1Ok] = useState(true);
  const [opponent1Ok, setOpponent1Ok] = useState(true);
  const [opponent2Ok, setOpponent2Ok] = useState(true);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submittedMatchId, setSubmittedMatchId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load recent players + tags on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/players/recent")
      .then((r) => r.json())
      .then((data: { partners: Player[]; opponents: Player[] }) => {
        setRecentPartners(data.partners ?? []);
        setRecentOpponents(data.opponents ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tagSuggestions.length === 0) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data: { tags: string[] }) => setTagSuggestions(data.tags ?? []))
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Admin mode toggle — resets all form state
  // ---------------------------------------------------------------------------

  function toggleAdminMode() {
    const next = !adminMode;
    setAdminMode(next);
    setTeam1Player1(null);
    setPartner(null);
    setOpponent1(null);
    setOpponent2(null);
    setOutcome(null);
    setGames([{ gameOrder: 1, team1Score: "", team2Score: "" }]);
    setTeam1Player1Ok(true);
    setPartnerOk(true);
    setOpponent1Ok(true);
    setOpponent2Ok(true);
  }

  // ---------------------------------------------------------------------------
  // Validators
  // ---------------------------------------------------------------------------

  const selectedIds = [
    ...(adminMode && team1Player1?.id ? [team1Player1.id] : []),
    partner?.id,
    opponent1?.id,
    opponent2?.id,
  ].filter(Boolean) as string[];

  function playersComplete(): boolean {
    const partnerReady = !!(partner?.id || partner?.name) && partnerOk;
    if (adminMode) {
      return !!(team1Player1?.id || team1Player1?.name) && team1Player1Ok && partnerReady;
    }
    return partnerReady;
  }

  function opponentsComplete(): boolean {
    return !!(opponent1?.id || opponent1?.name) && opponent1Ok &&
           !!(opponent2?.id || opponent2?.name) && opponent2Ok;
  }

  function resultComplete(): boolean {
    return outcome !== null &&
           games.every((g) => g.team1Score !== "" && g.team2Score !== "");
  }

  function canSubmit(): boolean {
    return playersComplete() && opponentsComplete() && resultComplete();
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const body = adminMode
      ? {
          matchDate,
          adminMode: true,
          ...(team1Player1?.id
            ? { team1Player1Id: team1Player1.id }
            : { team1Player1Name: team1Player1?.name }),
          ...(partner?.id ? { partnerId: partner.id } : { partnerName: partner?.name }),
          ...(opponent1?.id ? { opponent1Id: opponent1.id } : { opponent1Name: opponent1?.name }),
          ...(opponent2?.id ? { opponent2Id: opponent2.id } : { opponent2Name: opponent2?.name }),
          outcome,
          games: games.map((g) => ({
            gameOrder: g.gameOrder,
            team1Score: Number(g.team1Score),
            team2Score: Number(g.team2Score),
          })),
          ...(tag.trim() ? { tag: tag.trim() } : {}),
        }
      : {
          matchDate,
          ...(partner?.id ? { partnerId: partner.id } : { partnerName: partner?.name }),
          ...(opponent1?.id ? { opponent1Id: opponent1.id } : { opponent1Name: opponent1?.name }),
          ...(opponent2?.id ? { opponent2Id: opponent2.id } : { opponent2Name: opponent2?.name }),
          outcome,
          games: games.map((g) => ({
            gameOrder: g.gameOrder,
            team1Score: Number(g.team1Score),
            team2Score: Number(g.team2Score),
          })),
          ...(tag.trim() ? { tag: tag.trim() } : {}),
        };

    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        match?: { id: string };
      };

      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong");
      } else {
        setSubmittedMatchId(data.match?.id ?? null);
        setSuccess(true);
        router.refresh();
      }
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (success) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-5xl">✓</div>
        <h2 className="text-2xl font-bold text-zinc-50">Match Recorded</h2>
        <p className="text-zinc-400">Match saved. Ratings have been updated.</p>
        <button
          type="button"
          onClick={() => {
            setSuccess(false);
            setSubmittedMatchId(null);
            setTeam1Player1(null);
            setPartner(null);
            setOpponent1(null);
            setOpponent2(null);
            setOutcome(null);
            setGames([{ gameOrder: 1, team1Score: "", team2Score: "" }]);
            setTag("");
            setTeam1Player1Ok(true);
            setPartnerOk(true);
            setOpponent1Ok(true);
            setOpponent2Ok(true);
          }}
          className="rounded-xl bg-zinc-700 px-6 py-3 text-zinc-200 hover:bg-zinc-600"
        >
          Enter another match
        </button>
        {submittedMatchId && (
          <p className="text-xs text-zinc-600">Match ID: {submittedMatchId}</p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Admin "on behalf of" toggle */}
        {isAdmin && (
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-zinc-800/60 px-4 py-3">
            <span className="flex-1 text-sm text-zinc-300">Entering on behalf of players</span>
            <button
              type="button"
              onClick={toggleAdminMode}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                adminMode ? "bg-emerald-500" : "bg-zinc-600",
              ].join(" ")}
              role="switch"
              aria-checked={adminMode}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200",
                  adminMode ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-8">
          {adminMode && (
            <PlayerSelector
              label="Team 1 Player 1"
              value={team1Player1}
              onChange={(v) => { setTeam1Player1(v); if (!v) setTeam1Player1Ok(true); }}
              onDisambiguated={setTeam1Player1Ok}
              recentPlayers={recentPartners}
              excludeIds={selectedIds}
            />
          )}
          <PlayerSelector
            label={adminMode ? "Team 1 Player 2" : "Your partner"}
            value={partner}
            onChange={(v) => { setPartner(v); if (!v) setPartnerOk(true); }}
            onDisambiguated={setPartnerOk}
            recentPlayers={recentPartners}
            excludeIds={selectedIds}
          />
          <PlayerSelector
            label={adminMode ? "Team 2 Player 1" : "Opponent 1"}
            value={opponent1}
            onChange={(v) => { setOpponent1(v); if (!v) setOpponent1Ok(true); }}
            onDisambiguated={setOpponent1Ok}
            recentPlayers={recentOpponents}
            excludeIds={selectedIds}
          />
          <PlayerSelector
            label={adminMode ? "Team 2 Player 2" : "Opponent 2"}
            value={opponent2}
            onChange={(v) => { setOpponent2(v); if (!v) setOpponent2Ok(true); }}
            onDisambiguated={setOpponent2Ok}
            recentPlayers={recentOpponents}
            excludeIds={selectedIds}
          />
          <OutcomeToggle value={outcome} onChange={setOutcome} />
          <GameScoreInput games={games} onChange={setGames} />
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-zinc-500">Add to Event (optional)</p>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. Winter League, Club Night…"
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
            />
            {tagSuggestions.length > 0 && !tag && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tagSuggestions.slice(0, 5).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className="flex-shrink-0 rounded-full border border-zinc-600 px-3 py-1 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          {submitError && (
            <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-rose-400">
              {submitError}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800 px-4 py-4">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !canSubmit()}
          className={[
            "w-full rounded-xl py-3 font-semibold transition-colors",
            submitting || !canSubmit()
              ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              : "bg-emerald-500 text-white hover:bg-emerald-400",
          ].join(" ")}
        >
          {submitting ? "Saving…" : "Submit Match"}
        </button>
      </div>
    </div>
  );
}
