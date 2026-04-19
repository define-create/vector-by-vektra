export type ParsedMatch = {
  team1: [string, string];
  team2: [string, string];
  outcome: "win" | "loss";
  game: { team1Score: number; team2Score: number };
  tag?: string;
};

export type ParseResult =
  | { ok: true; match: ParsedMatch }
  | { ok: false; error: string };

// Matches win/loss verbs, capturing outcome. Order matters: multi-word before single-word.
// d. uses a lookahead instead of \b because \b doesn't work before a dot.
const VERB_RE =
  /\b(lost\s+against|lost\s+to|fell\s+against|fell\s+to|dropped\s+to|won\s+against|defeated|beat|won|over|topped|edged|def|d\.)(?=\s)/i;

const TEAM_SEP_RE = /\s+(?:&|and)\s+/i;
const SCORE_RE = /(\d+)-(\d+)/;
const TAG_RE = /#(\S+)/;

export function parseMatchText(text: string): ParseResult {
  const normalized = text.trim().replace(/\s+/g, " ");

  const verbMatch = VERB_RE.exec(normalized);
  if (!verbMatch) {
    return {
      ok: false,
      error:
        "Couldn't find a match verb — expected beat, won, defeated, over, topped, edged, def, d., lost to, lost against, fell to, fell against, or dropped to.",
    };
  }

  const verb = verbMatch[1].toLowerCase().replace(/\s+/g, " ");
  const lossVerbs = ["lost to", "lost against", "fell to", "fell against", "dropped to"];
  const outcome: "win" | "loss" = lossVerbs.includes(verb) ? "loss" : "win";

  const verbIndex = verbMatch.index;
  const verbEnd = verbIndex + verbMatch[0].length;

  const leftSide = normalized.slice(0, verbIndex).trim();
  const rightSide = normalized.slice(verbEnd).trim();

  // Split each side into two player names
  const team1Parts = leftSide.split(TEAM_SEP_RE).map((s) => s.trim());
  if (team1Parts.length !== 2 || !team1Parts[0] || !team1Parts[1]) {
    return {
      ok: false,
      error:
        "Couldn't parse Team 1 — expected two names separated by & or and (e.g. Jordan & Mike).",
    };
  }

  // Score and optional tag are in rightSide; extract them before splitting team2
  const scoreMatch = SCORE_RE.exec(rightSide);
  if (!scoreMatch) {
    return {
      ok: false,
      error:
        "Couldn't find a score — expected a format like 11-7.",
    };
  }

  // Team 2 names appear before the score
  const team2Raw = rightSide.slice(0, scoreMatch.index).trim();
  const team2Parts = team2Raw.split(TEAM_SEP_RE).map((s) => s.trim());
  if (team2Parts.length !== 2 || !team2Parts[0] || !team2Parts[1]) {
    return {
      ok: false,
      error:
        "Couldn't parse Team 2 — expected two names separated by & or and (e.g. Sam & Taylor).",
    };
  }

  const team1Score = parseInt(scoreMatch[1], 10);
  const team2Score = parseInt(scoreMatch[2], 10);

  const afterScore = rightSide.slice(scoreMatch.index + scoreMatch[0].length);
  const tagMatch = TAG_RE.exec(afterScore);
  const tag = tagMatch ? tagMatch[1] : undefined;

  return {
    ok: true,
    match: {
      team1: [team1Parts[0], team1Parts[1]],
      team2: [team2Parts[0], team2Parts[1]],
      outcome,
      game: { team1Score, team2Score },
      ...(tag ? { tag } : {}),
    },
  };
}
