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

type Mode = "steps" | "quick";
type WizardStep = "players" | "result";

// ---------------------------------------------------------------------------
// EnterPage
// ---------------------------------------------------------------------------

export default function EnterPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // Mode and wizard step
  const [mode, setMode] = useState<Mode>("steps");
  const [wizardStep, setWizardStep] = useState<WizardStep>("players");

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
  // Load localStorage preference + recent players + tags on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const saved = localStorage.getItem("enter-mode") as Mode | null;
    if (saved === "quick" || saved === "steps") setMode(saved);
  }, []);

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
  // Mode toggle
  // ---------------------------------------------------------------------------

  function changeMode(next: Mode) {
    localStorage.setItem("enter-mode", next);
    setMode(next);
  }

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
    setWizardStep("players");
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
  // Auto-advance: Steps mode Step 1 → Step 2 when all players confirmed
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode === "steps" && wizardStep === "players") {
      if (playersComplete() && opponentsComplete()) {
        setWizardStep("result");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner, opponent1, opponent2, partnerOk, opponent1Ok, opponent2Ok,
      team1Player1, team1Player1Ok, adminMode, mode]);

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
            setWizardStep("players");
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
  // Shared sub-sections (used in both modes)
  // ---------------------------------------------------------------------------

  const playerSelectors = (
    <div className="flex flex-col gap-6">
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
    </div>
  );

  const tagSection = (
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
  );

  // Shadow profile summary shown above Submit in Steps Result screen
  const shadowWarnings = [
    adminMode ? { label: "Team 1 Player 1", v: team1Player1 } : null,
    { label: adminMode ? "Team 1 Player 2" : "Partner", v: partner },
    { label: adminMode ? "Team 2 Player 1" : "Opponent 1", v: opponent1 },
    { label: adminMode ? "Team 2 Player 2" : "Opponent 2", v: opponent2 },
  ]
    .filter((x): x is { label: string; v: PlayerValue | null } => x !== null)
    .filter(({ v }) => v && !v.id && v.name);

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Progress bar — Steps mode only */}
      {mode === "steps" && (
        <div className="flex gap-1 px-4 pt-4">
          {(["players", "result"] as WizardStep[]).map((s, i) => (
            <div
              key={s}
              className={[
                "h-1 flex-1 rounded-full transition-colors",
                (wizardStep === "players" ? 0 : 1) >= i ? "bg-zinc-300" : "bg-zinc-700",
              ].join(" ")}
            />
          ))}
        </div>
      )}

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

        {/* Mode toggle */}
        <div className="mb-5">
          <ModeToggle mode={mode} onChange={changeMode} />
        </div>

        {/* ── STEPS MODE ── */}
        {mode === "steps" && (
          <>
            <h2 className="mb-6 text-xl font-semibold text-zinc-50">
              {wizardStep === "players"
                ? (adminMode ? "Teams" : "Players")
                : "Result"}
            </h2>

            {wizardStep === "players" && playerSelectors}

            {wizardStep === "result" && (
              <div className="flex flex-col gap-6">
                <OutcomeToggle value={outcome} onChange={setOutcome} />
                <GameScoreInput games={games} onChange={setGames} />
                {tagSection}
                {shadowWarnings.map(({ label, v }) => (
                  <p key={label} className="text-sm text-amber-400">
                    {label} ({v!.name}) — shadow profile will be created
                  </p>
                ))}
                {submitError && (
                  <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-rose-400">
                    {submitError}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── QUICK MODE ── */}
        {mode === "quick" && (
          <div className="flex flex-col gap-8">
            {playerSelectors}
            <OutcomeToggle value={outcome} onChange={setOutcome} />
            <GameScoreInput games={games} onChange={setGames} />
            {tagSection}
            {submitError && (
              <p className="rounded-lg bg-rose-900/30 px-4 py-3 text-rose-400">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── STEPS MODE bottom nav ── */}
      {mode === "steps" && (
        <div className="flex gap-3 border-t border-zinc-800 px-4 py-4">
          {wizardStep === "result" && (
            <button
              type="button"
              onClick={() => setWizardStep("players")}
              className="flex-1 rounded-xl border border-zinc-600 py-3 text-zinc-300 hover:bg-zinc-800"
            >
              Back
            </button>
          )}
          {wizardStep === "players" ? (
            <button
              type="button"
              onClick={() => setWizardStep("result")}
              disabled={!(playersComplete() && opponentsComplete())}
              className={[
                "flex-1 rounded-xl py-3 font-semibold transition-colors",
                playersComplete() && opponentsComplete()
                  ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
              ].join(" ")}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !canSubmit()}
              className={[
                "flex-1 rounded-xl py-3 font-semibold transition-colors",
                submitting || !canSubmit()
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-emerald-500 text-white hover:bg-emerald-400",
              ].join(" ")}
            >
              {submitting ? "Saving…" : "Submit Match"}
            </button>
          )}
        </div>
      )}

      {/* ── QUICK MODE bottom nav ── */}
      {mode === "quick" && (
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModeToggle — file-local component
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-zinc-800 p-1">
      {(["steps", "quick"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={[
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === m
              ? "bg-zinc-600 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300",
          ].join(" ")}
        >
          {m === "steps" ? "Steps" : "Quick"}
        </button>
      ))}
    </div>
  );
}
