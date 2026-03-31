import { computeMatchFingerprint } from "./matchFingerprint";

const DATE = new Date("2026-03-31T00:00:00.000Z");
const GAMES = [{ team1Score: 11, team2Score: 9 }];

// Canonical fingerprint for reference
const CANONICAL = computeMatchFingerprint(
  ["aaa", "bbb"],
  ["ccc", "ddd"],
  DATE,
  GAMES
);

describe("computeMatchFingerprint", () => {
  describe("symmetry — team order", () => {
    it("produces the same fingerprint when teams are swapped and scores flipped", () => {
      const flipped = computeMatchFingerprint(
        ["ccc", "ddd"],
        ["aaa", "bbb"],
        DATE,
        [{ team1Score: 9, team2Score: 11 }]
      );
      expect(flipped).toBe(CANONICAL);
    });

    it("is unaffected by player order within a team", () => {
      const reordered = computeMatchFingerprint(
        ["bbb", "aaa"],
        ["ddd", "ccc"],
        DATE,
        GAMES
      );
      expect(reordered).toBe(CANONICAL);
    });
  });

  describe("symmetry — game score order", () => {
    it("produces the same fingerprint regardless of game entry order", () => {
      const multiGame = computeMatchFingerprint(
        ["aaa", "bbb"],
        ["ccc", "ddd"],
        DATE,
        [
          { team1Score: 11, team2Score: 7 },
          { team1Score: 11, team2Score: 9 },
        ]
      );
      const reversed = computeMatchFingerprint(
        ["aaa", "bbb"],
        ["ccc", "ddd"],
        DATE,
        [
          { team1Score: 11, team2Score: 9 },
          { team1Score: 11, team2Score: 7 },
        ]
      );
      expect(reversed).toBe(multiGame);
    });
  });

  describe("sensitivity — different inputs produce different fingerprints", () => {
    it("differs when scores are different", () => {
      const other = computeMatchFingerprint(
        ["aaa", "bbb"],
        ["ccc", "ddd"],
        DATE,
        [{ team1Score: 11, team2Score: 8 }]
      );
      expect(other).not.toBe(CANONICAL);
    });

    it("differs when a player is different", () => {
      const other = computeMatchFingerprint(
        ["aaa", "zzz"],
        ["ccc", "ddd"],
        DATE,
        GAMES
      );
      expect(other).not.toBe(CANONICAL);
    });

    it("differs when the date is different", () => {
      const other = computeMatchFingerprint(
        ["aaa", "bbb"],
        ["ccc", "ddd"],
        new Date("2026-04-01T00:00:00.000Z"),
        GAMES
      );
      expect(other).not.toBe(CANONICAL);
    });
  });

  describe("format", () => {
    it("produces the expected canonical string", () => {
      // aaa < bbb, ccc < ddd → aaa,bbb;ccc,ddd;2026-03-31;11-9
      // aaa < ccc so team order stays
      expect(CANONICAL).toBe("aaa,bbb;ccc,ddd;2026-03-31;11-9");
    });

    it("uses date from matchDate, ignoring time component", () => {
      const withTime = computeMatchFingerprint(
        ["aaa", "bbb"],
        ["ccc", "ddd"],
        new Date("2026-03-31T22:59:00.000Z"),
        GAMES
      );
      expect(withTime).toBe(CANONICAL);
    });
  });
});
