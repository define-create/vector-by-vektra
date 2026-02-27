"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
}

interface PlayerValue {
  id?: string;
  name?: string;
}

type Step = "partner" | "opponents" | "outcome" | "scores" | "review";

// ---------------------------------------------------------------------------
// Step labels (for progress indicator)
// ---------------------------------------------------------------------------

const STEPS: Step[] = ["partner", "opponents", "outcome", "scores", "review"];
const STEP_LABELS: Record<Step, string> = {
  partner: "Partner",
  opponents: "Opponents",
  outcome: "Outcome",
  scores: "Scores",
  review: "Review",
};

// ---------------------------------------------------------------------------
// EnterPage
// ---------------------------------------------------------------------------

export default function EnterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("partner");

  // Form state
  const [matchDate] = useState(() => new Date().toISOString());
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

  // Tag state (optional event label)
  const [tag, setTag] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submittedMatchId, setSubmittedMatchId] = useState<string | null>(null);

  // Load tag suggestions when reaching review step
  useEffect(() => {
    if (step === "review" && tagSuggestions.length === 0) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data: { tags: string[] }) => setTagSuggestions(data.tags ?? []))
        .catch(() => {});
    }
  }, [step, tagSuggestions.length]);

  // Load recent players on mount
  useEffect(() => {
    fetch("/api/players/recent")
      .then((r) => r.json())
      .then((data: { partners: Player[]; opponents: Player[] }) => {
        setRecentPartners(data.partners ?? []);
        setRecentOpponents(data.opponents ?? []);
      })
      .catch(() => {});
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const selectedIds = [partner?.id, opponent1?.id, opponent2?.id].filter(
    Boolean,
  ) as string[];

  function canProceed(): boolean {
    switch (step) {
      case "partner":
        return !!(partner?.id || partner?.name);
      case "opponents":
        return !!(opponent1?.id || opponent1?.name) && !!(opponent2?.id || opponent2?.name);
      case "outcome":
        return outcome !== null;
      case "scores":
        return games.every(
          (g) => g.team1Score !== "" && g.team2Score !== "",
        );
      case "review":
        return true;
      default:
        return false;
    }
  }

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]!);
    }
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]!);
    }
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const body = {
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
        router.refresh(); // clear Router Cache so /command re-fetches on next visit
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
        <p className="text-zinc-400">
          Match saved. Your rating has been updated.
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccess(false);
            setSubmittedMatchId(null);
            setPartner(null);
            setOpponent1(null);
            setOpponent2(null);
            setOutcome(null);
            setGames([{ gameOrder: 1, team1Score: "", team2Score: "" }]);
            setTag("");
            setStep("partner");
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
  // Progress bar + step renders
  // ---------------------------------------------------------------------------

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="flex h-full flex-col">
      {/* Progress indicator */}
      <div className="flex gap-1 px-4 pt-4">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={[
              "h-1 flex-1 rounded-full transition-colors",
              i <= stepIndex ? "bg-zinc-300" : "bg-zinc-700",
            ].join(" ")}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h2 className="mb-6 text-xl font-semibold text-zinc-50">
          {STEP_LABELS[step]}
        </h2>

        {/* Step: Partner */}
        {step === "partner" && (
          <PlayerSelector
            label="Your partner"
            value={partner}
            onChange={setPartner}
            recentPlayers={recentPartners}
            excludeIds={selectedIds}
          />
        )}

        {/* Step: Opponents */}
        {step === "opponents" && (
          <div className="flex flex-col gap-6">
            <PlayerSelector
              label="Opponent 1"
              value={opponent1}
              onChange={setOpponent1}
              recentPlayers={recentOpponents}
              excludeIds={selectedIds}
            />
            <PlayerSelector
              label="Opponent 2"
              value={opponent2}
              onChange={setOpponent2}
              recentPlayers={recentOpponents}
              excludeIds={selectedIds}
            />
          </div>
        )}

        {/* Step: Outcome */}
        {step === "outcome" && (
          <OutcomeToggle value={outcome} onChange={setOutcome} />
        )}

        {/* Step: Game Scores */}
        {step === "scores" && (
          <GameScoreInput games={games} onChange={setGames} />
        )}

        {/* Step: Review */}
        {step === "review" && (
          <div className="flex flex-col gap-5 text-sm">
            <div className="rounded-xl bg-zinc-800 p-4 space-y-3">
              <ReviewRow
                label="Date"
                value={new Date(matchDate).toLocaleString("en-US", {
                  month: "short", day: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}
              />
              <ReviewRow
                label="Partner"
                value={partner?.name ?? "—"}
                subtext={partner?.id ? undefined : "Shadow profile"}
              />
              <ReviewRow
                label="Opponent 1"
                value={opponent1?.name ?? "—"}
                subtext={opponent1?.id ? undefined : "Shadow profile"}
              />
              <ReviewRow
                label="Opponent 2"
                value={opponent2?.name ?? "—"}
                subtext={opponent2?.id ? undefined : "Shadow profile"}
              />
              <ReviewRow
                label="Outcome"
                value={outcome === "win" ? "WIN" : "LOSS"}
                highlight={outcome === "win" ? "emerald" : "rose"}
              />
            </div>

            <div className="rounded-xl bg-zinc-800 p-4 space-y-2">
              <p className="text-sm font-medium text-zinc-500 mb-3">Games</p>
              {games.map((g, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-zinc-400">Game {i + 1}</span>
                  <span className="font-semibold text-zinc-200">
                    {g.team1Score} – {g.team2Score}
                  </span>
                </div>
              ))}
            </div>

            {/* Optional event tag */}
            <div className="rounded-xl bg-zinc-800 p-4 flex flex-col gap-3">
              <p className="text-sm font-medium text-zinc-500">Add to Event (optional)</p>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. Winter League, Club Night…"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none text-sm"
              />
              {tagSuggestions.length > 0 && !tag && (
                <div className="flex flex-wrap gap-2">
                  {tagSuggestions.slice(0, 5).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTag(t)}
                      className="rounded-full border border-zinc-600 px-3 py-1 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition-colors"
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
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 border-t border-zinc-800 px-4 py-4">
        {step !== "partner" && (
          <button
            type="button"
            onClick={back}
            className="flex-1 rounded-xl border border-zinc-600 py-3 text-zinc-300 hover:bg-zinc-800"
          >
            Back
          </button>
        )}

        {step !== "review" ? (
          <button
            type="button"
            onClick={next}
            disabled={!canProceed()}
            className={[
              "flex-1 rounded-xl py-3 font-semibold transition-colors",
              canProceed()
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
            disabled={submitting}
            className={[
              "flex-1 rounded-xl py-3 font-semibold transition-colors",
              submitting
                ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                : "bg-emerald-500 text-white hover:bg-emerald-400",
            ].join(" ")}
          >
            {submitting ? "Saving…" : "Submit Match"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review row sub-component
// ---------------------------------------------------------------------------

function ReviewRow({
  label,
  value,
  subtext,
  highlight,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: "emerald" | "rose";
}) {
  const valueColor =
    highlight === "emerald"
      ? "text-emerald-400 font-semibold"
      : highlight === "rose"
        ? "text-rose-400 font-semibold"
        : "text-zinc-200";

  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <div className="text-right">
        <span className={valueColor}>{value}</span>
        {subtext && <p className="text-sm text-amber-400">{subtext}</p>}
      </div>
    </div>
  );
}
