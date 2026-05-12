import type { CommandData } from "./command";

/**
 * Builds the demo `CommandData` shown to new users during the preview window.
 *
 * Values are locked in PRD §10. `displayName` is the only runtime input — every
 * other value is hardcoded and identical for all users. Dates are computed as
 * relative offsets from the moment the function is called, so the dataset
 * always looks fresh.
 */
export function buildDemoCommandData(displayName: string): CommandData {
  const now = new Date();
  const daysAgo = (n: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  return {
    hasPlayer: true,
    emailVerified: true,
    userDisplayName: displayName,
    myPlayerId: "demo-player-id",
    myPlayerDisplayName: displayName,
    rating: 1083,
    winPct: 0.6,
    compoundingIndex: 12,
    driftScore: -8,
    upcomingProbability: 0.58,
    dominantDriver: "winRate",

    communityStats: { avg: 1000, min: 880, max: 1240 },

    ratingHistory: [
      { date: daysAgo(28), rating: 1010, outcome: "loss" },
      { date: daysAgo(25), rating: 1024, outcome: "win" },
      { date: daysAgo(22), rating: 1018, outcome: "loss" },
      { date: daysAgo(18), rating: 1035, outcome: "win" },
      { date: daysAgo(15), rating: 1052, outcome: "win" },
      { date: daysAgo(12), rating: 1044, outcome: "loss" },
      { date: daysAgo(9), rating: 1058, outcome: "win" },
      { date: daysAgo(6), rating: 1072, outcome: "win" },
      { date: daysAgo(3), rating: 1066, outcome: "loss" },
      { date: daysAgo(1), rating: 1083, outcome: "win" },
    ],

    recentMatchHistory: [
      {
        matchDate: daysAgo(1),
        outcome: "win",
        partnerName: "Player A",
        partnerId: "demo-partner-a",
        opponentNames: ["Player B", "Player C"],
        opponentIds: ["demo-opponent-b", "demo-opponent-c"],
        score: "11–7",
        tag: "Demo League",
        ratingDelta: 15,
      },
      {
        matchDate: daysAgo(3),
        outcome: "loss",
        partnerName: "Player A",
        partnerId: "demo-partner-a",
        opponentNames: ["Player D", "Player E"],
        opponentIds: ["demo-opponent-d", "demo-opponent-e"],
        score: "8–11",
        tag: "Demo League",
        ratingDelta: -9,
      },
      {
        matchDate: daysAgo(6),
        outcome: "win",
        partnerName: "Player F",
        partnerId: "demo-partner-f",
        opponentNames: ["Player B", "Player C"],
        opponentIds: ["demo-opponent-b", "demo-opponent-c"],
        score: "11–9",
        tag: "Demo League",
        ratingDelta: 14,
      },
      {
        matchDate: daysAgo(9),
        outcome: "win",
        partnerName: "Player A",
        partnerId: "demo-partner-a",
        opponentNames: ["Player D", "Player E"],
        opponentIds: ["demo-opponent-d", "demo-opponent-e"],
        score: "11–8",
        tag: "Demo League",
        ratingDelta: 12,
      },
      {
        matchDate: daysAgo(12),
        outcome: "loss",
        partnerName: "Player F",
        partnerId: "demo-partner-f",
        opponentNames: ["Player B", "Player C"],
        opponentIds: ["demo-opponent-b", "demo-opponent-c"],
        score: "7–11",
        tag: "Demo League",
        ratingDelta: -8,
      },
      {
        matchDate: daysAgo(15),
        outcome: "win",
        partnerName: "Player A",
        partnerId: "demo-partner-a",
        opponentNames: ["Player D", "Player C"],
        opponentIds: ["demo-opponent-d", "demo-opponent-c"],
        score: "11–6",
        tag: "Demo League",
        ratingDelta: 13,
      },
    ],

    driverHistory: {
      winRateHistory: [0.45, 0.48, 0.5, 0.52, 0.55, 0.55, 0.57, 0.58, 0.59, 0.6],
      ciHistory: [-4, -1, 2, 5, 7, 6, 9, 11, 10, 12],
      driftHistory: [-14, -13, -12, -11, -10, -10, -9, -9, -8, -8],
    },

    driverDeltas: {
      winRateDelta: 0.05,
      ciDelta: 0.4,
      driftDelta: 2,
    },

    // EditTimerLink is hidden during preview per PRD requirement 14;
    // these fields are unused but required by the CommandData type.
    editTimer: { expiresAt: null, matchId: null },
  };
}
