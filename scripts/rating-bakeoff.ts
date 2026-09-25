/**
 * Engine bake-off: current hand-rolled ELO v2 vs OpenSkill (read-only, no DB writes).
 *
 * Plan v6 mandates OpenSkill over a hand-rolled engine, citing prediction
 * quality. This script tests that claim empirically: replay the full match
 * history through both engines and compare how well each predicted the
 * winner of every match, using log-loss and Brier score (lower = better).
 *
 * Both engines see matches in the same chronological order and predict
 * BEFORE updating ratings — mirroring real usage.
 *
 * Results from the 2026-06-11 run (526 matches) and the resulting decision to
 * keep ELO v2 are documented in docs/rating-engine-bakeoff.md.
 *
 * openskill is NOT kept installed (154 transitive packages). To re-run:
 *   npm i -D openskill && npx tsx scripts/rating-bakeoff.ts && npm un openskill
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
// @ts-ignore — openskill is installed on demand only (see header); tsc must
// pass with it absent, and the identifiers degrade to `any` when it is.
import { rating, rate, predictWin } from "openskill";

/** Local mirror of openskill's Rating shape (module not always installed). */
interface Rating {
  mu: number;
  sigma: number;
}
import {
  expectedScore,
  kFactor,
  computeRatingDelta,
  teamBaseK,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
} from "../lib/rating-engine/elo";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter } as any);

const INITIAL_RATING = 1000;

interface ReplayMatch {
  team1: [string, string];
  team2: [string, string];
  team1Won: boolean;
  games: { team1Score: number; team2Score: number }[];
}

/** Per-match prediction from one engine: e1 = predicted P(team 1 wins). */
interface Prediction {
  e1: number;
  team1Won: boolean;
  minPriorMatches: number; // fewest prior matches among the 4 players
}

// ---------------------------------------------------------------------------
// Engine 1 — current ELO v2 (mirrors lib/rating-engine/replay.ts)
// ---------------------------------------------------------------------------

/**
 * The plain average the engine used in June 2026. Deliberately local: elo.ts's
 * teamRating now weights the stronger partner at TEAM_ALPHA, and using it here
 * would silently change the historical baseline this bake-off documents.
 */
function plainTeamAverage(r1: number, r2: number): number {
  return (r1 + r2) / 2;
}

function replayCurrentEngine(matches: ReplayMatch[]): Prediction[] {
  const ratings = new Map<string, number>();
  const counts = new Map<string, number>();
  const r = (id: string) => ratings.get(id) ?? INITIAL_RATING;
  const n = (id: string) => counts.get(id) ?? 0;

  const predictions: Prediction[] = [];

  for (const m of matches) {
    const [p1a, p1b] = m.team1;
    const [p2a, p2b] = m.team2;

    const t1Avg = plainTeamAverage(r(p1a), r(p1b));
    const t2Avg = plainTeamAverage(r(p2a), r(p2b));
    const e1 = expectedScore(t1Avg, t2Avg);

    predictions.push({
      e1,
      team1Won: m.team1Won,
      minPriorMatches: Math.min(n(p1a), n(p1b), n(p2a), n(p2b)),
    });

    const k1Base = teamBaseK(n(p1a), n(p1b));
    const k2Base = teamBaseK(n(p2a), n(p2b));
    const gapFactor = lopsidedGapFactor(t1Avg - t2Avg);
    const adjK1 = t1Avg >= t2Avg ? k1Base * gapFactor : k1Base * (2 - gapFactor);
    const adjK2 = t2Avg >= t1Avg ? k2Base * gapFactor : k2Base * (2 - gapFactor);
    const t1Scores = m.games.map((g) => g.team1Score);
    const t2Scores = m.games.map((g) => g.team2Score);
    const [w, l] = m.team1Won ? [t1Scores, t2Scores] : [t2Scores, t1Scores];
    const mov = marginOfVictoryMultiplier(w, l);
    const delta1 = computeRatingDelta(kFactor(adjK1, 1.0, mov), m.team1Won ? 1 : 0, e1);
    const delta2 = computeRatingDelta(kFactor(adjK2, 1.0, mov), m.team1Won ? 0 : 1, 1 - e1);

    for (const id of m.team1) {
      ratings.set(id, r(id) + delta1);
      counts.set(id, n(id) + 1);
    }
    for (const id of m.team2) {
      ratings.set(id, r(id) + delta2);
      counts.set(id, n(id) + 1);
    }
  }

  return predictions;
}

// ---------------------------------------------------------------------------
// Engine 2 — OpenSkill (default Plackett-Luce model, default parameters)
// ---------------------------------------------------------------------------

function replayOpenSkill(matches: ReplayMatch[]): Prediction[] {
  const ratings = new Map<string, Rating>();
  const counts = new Map<string, number>();
  const r = (id: string) => ratings.get(id) ?? rating();
  const n = (id: string) => counts.get(id) ?? 0;

  const predictions: Prediction[] = [];

  for (const m of matches) {
    const team1 = [r(m.team1[0]), r(m.team1[1])];
    const team2 = [r(m.team2[0]), r(m.team2[1])];

    const [p1] = predictWin([team1, team2]);

    predictions.push({
      e1: p1!,
      team1Won: m.team1Won,
      minPriorMatches: Math.min(n(m.team1[0]), n(m.team1[1]), n(m.team2[0]), n(m.team2[1])),
    });

    // rate() expects teams ordered by finish: winner first
    const [winners, losers, winIds, loseIds] = m.team1Won
      ? [team1, team2, m.team1, m.team2]
      : [team2, team1, m.team2, m.team1];
    const [newWinners, newLosers] = rate([winners, losers]);

    winIds.forEach((id, i) => ratings.set(id, newWinners![i]!));
    loseIds.forEach((id, i) => ratings.set(id, newLosers![i]!));
    for (const id of [...m.team1, ...m.team2]) counts.set(id, n(id) + 1);
  }

  return predictions;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function logLoss(preds: Prediction[]): number {
  const EPS = 1e-12;
  let sum = 0;
  for (const p of preds) {
    const e = Math.min(1 - EPS, Math.max(EPS, p.e1));
    sum += p.team1Won ? -Math.log(e) : -Math.log(1 - e);
  }
  return sum / preds.length;
}

function brier(preds: Prediction[]): number {
  let sum = 0;
  for (const p of preds) sum += ((p.team1Won ? 1 : 0) - p.e1) ** 2;
  return sum / preds.length;
}

/** Fraction of matches where the favoured team (e1 >= 0.5 => team1) won. */
function accuracy(preds: Prediction[]): number {
  let hit = 0;
  for (const p of preds) if (p.e1 >= 0.5 === p.team1Won) hit++;
  return hit / preds.length;
}

function pct(x: number): string {
  return (100 * x).toFixed(1) + "%";
}

/** Calibration table: bucket by predicted P(team1 wins), compare to actual. */
function calibrationTable(label: string, preds: Prediction[]): void {
  console.log(`\nCalibration — ${label} (bucketed by predicted win probability):`);
  console.log("predicted        n     mean pred   actual    diff");
  const edges = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0001];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const sel = preds.filter((p) => p.e1 >= lo && p.e1 < hi);
    const rangeLabel = `${(lo * 100).toFixed(0)}–${(Math.min(hi, 1) * 100).toFixed(0)}%`.padEnd(9);
    if (sel.length === 0) {
      console.log(`${rangeLabel}   ${String(0).padStart(5)}   (no matches)`);
      continue;
    }
    const meanPred = sel.reduce((s, p) => s + p.e1, 0) / sel.length;
    const actual = sel.filter((p) => p.team1Won).length / sel.length;
    console.log(
      `${rangeLabel}   ${String(sel.length).padStart(5)}   ${pct(meanPred).padStart(7)}   ${pct(actual).padStart(7)}   ${pct(actual - meanPred).padStart(7)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rows = await prisma.match.findMany({
    where: { voidedAt: null },
    include: {
      participants: { select: { playerId: true, team: true } },
      games: { select: { team1Score: true, team2Score: true, gameOrder: true } },
    },
    orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }],
  });

  const matches: ReplayMatch[] = [];
  for (const m of rows) {
    const t1 = m.participants.filter((p) => p.team === 1).map((p) => p.playerId);
    const t2 = m.participants.filter((p) => p.team === 2).map((p) => p.playerId);
    if (t1.length !== 2 || t2.length !== 2) continue; // doubles only
    let w1 = 0;
    let w2 = 0;
    for (const g of m.games) {
      if (g.team1Score > g.team2Score) w1++;
      else if (g.team2Score > g.team1Score) w2++;
    }
    matches.push({
      team1: [t1[0]!, t1[1]!],
      team2: [t2[0]!, t2[1]!],
      team1Won: w1 > w2,
      games: m.games
        .sort((a, b) => a.gameOrder - b.gameOrder)
        .map((g) => ({ team1Score: g.team1Score, team2Score: g.team2Score })),
    });
  }

  console.log(`Replaying ${matches.length} non-voided doubles matches (${rows.length} fetched)\n`);

  const elo = replayCurrentEngine(matches);
  const osk = replayOpenSkill(matches);

  const seasonedElo = elo.filter((p) => p.minPriorMatches >= 5);
  const seasonedOsk = osk.filter((p) => p.minPriorMatches >= 5);

  console.log("=== Head-to-head: lower log-loss / Brier = better predictions ===\n");
  console.log("segment                          engine      log-loss   Brier    favourite-wins");
  const rowsOut: [string, Prediction[], Prediction[]][] = [
    ["all matches", elo, osk],
    ["seasoned (all 4 players ≥5 prior)", seasonedElo, seasonedOsk],
  ];
  for (const [label, e, o] of rowsOut) {
    console.log(
      `${label.padEnd(33)}ELO v2      ${logLoss(e).toFixed(4)}     ${brier(e).toFixed(4)}   ${pct(accuracy(e))}  (n=${e.length})`,
    );
    console.log(
      `${"".padEnd(33)}OpenSkill   ${logLoss(o).toFixed(4)}     ${brier(o).toFixed(4)}   ${pct(accuracy(o))}  (n=${o.length})`,
    );
  }

  calibrationTable("ELO v2", elo);
  calibrationTable("OpenSkill", osk);

  const llE = logLoss(elo);
  const llO = logLoss(osk);
  console.log(
    `\nVerdict: ${llO < llE ? "OpenSkill" : "Current ELO v2"} predicts better overall ` +
      `(log-loss ${Math.min(llE, llO).toFixed(4)} vs ${Math.max(llE, llO).toFixed(4)}, ` +
      `Δ=${Math.abs(llE - llO).toFixed(4)}).`,
  );
  console.log(
    "Note: OpenSkill runs on default parameters (no tuning); the plan's own advice is to tune sigma/beta before launch.",
  );
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
