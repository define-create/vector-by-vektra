export function computeMatchFingerprint(
  team1: [string, string],
  team2: [string, string],
  matchDate: Date,
  games: { team1Score: number; team2Score: number }[]
): string {
  const t1 = [...team1].sort();
  const t2 = [...team2].sort();

  let normalT1: string[], normalT2: string[];
  let normalGames: { t1: number; t2: number }[];

  if (t1[0] <= t2[0]) {
    normalT1 = t1;
    normalT2 = t2;
    normalGames = games.map((g) => ({ t1: g.team1Score, t2: g.team2Score }));
  } else {
    normalT1 = t2;
    normalT2 = t1;
    normalGames = games.map((g) => ({ t1: g.team2Score, t2: g.team1Score }));
  }

  const dateStr = matchDate.toISOString().slice(0, 10);
  const scoresStr = normalGames
    .sort((a, b) => a.t1 - b.t1 || a.t2 - b.t2)
    .map((g) => `${g.t1}-${g.t2}`)
    .join(",");

  return `${normalT1.join(",")};${normalT2.join(",")};${dateStr};${scoresStr}`;
}
