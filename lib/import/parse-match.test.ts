import { parseMatchText } from "./parse-match";

describe("parseMatchText", () => {
  // ---------------------------------------------------------------------------
  // Happy paths
  // ---------------------------------------------------------------------------

  test("win verb: defeated, with tag", () => {
    const result = parseMatchText("Jordan & Mike defeated Sam & Taylor 11-7 #League");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.team1).toEqual(["Jordan", "Mike"]);
    expect(result.match.team2).toEqual(["Sam", "Taylor"]);
    expect(result.match.outcome).toBe("win");
    expect(result.match.game).toEqual({ team1Score: 11, team2Score: 7 });
    expect(result.match.tag).toBe("League");
  });

  test("loss verb: lost to, no tag", () => {
    const result = parseMatchText("Sam & Taylor lost to Jordan & Mike 11-7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.outcome).toBe("loss");
    expect(result.match.team1).toEqual(["Sam", "Taylor"]);
    expect(result.match.team2).toEqual(["Jordan", "Mike"]);
    expect(result.match.tag).toBeUndefined();
  });

  test("and separator + def verb", () => {
    const result = parseMatchText("Jordan and Mike def Sam and Taylor 11-7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.team1).toEqual(["Jordan", "Mike"]);
    expect(result.match.team2).toEqual(["Sam", "Taylor"]);
    expect(result.match.outcome).toBe("win");
  });

  test("abbreviated verb d.", () => {
    const result = parseMatchText("Jordan & Mike d. Sam & Taylor 11-7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.outcome).toBe("win");
  });

  test("loss verb: fell to, with tag", () => {
    const result = parseMatchText("Sam & Taylor fell to Jordan & Mike 11-7 #Sunday");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.outcome).toBe("loss");
    expect(result.match.tag).toBe("Sunday");
  });

  test("win verb: beat", () => {
    const result = parseMatchText("Alex & Chris beat Morgan & Dana 15-13");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.outcome).toBe("win");
    expect(result.match.game).toEqual({ team1Score: 15, team2Score: 13 });
  });

  test("case insensitive verb", () => {
    const result = parseMatchText("Jordan & Mike DEFEATED Sam & Taylor 11-7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.outcome).toBe("win");
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  test("error: missing score", () => {
    const result = parseMatchText("Jordan & Mike defeated Sam & Taylor");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("score");
  });

  test("error: missing verb", () => {
    const result = parseMatchText("Jordan & Mike Sam & Taylor 11-7");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/verb|couldn't find/);
  });

  test("error: only one player on team 1", () => {
    const result = parseMatchText("Jordan defeated Sam & Taylor 11-7");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("team 1");
  });
});
