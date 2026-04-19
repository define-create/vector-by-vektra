"use client";

// Shared CSS classes for pixel-accurate alignment between textarea and ghost div
const SHARED_STYLE =
  "w-full text-sm leading-6 tracking-normal p-3 font-sans";

// Hint stages for regular user (team1[0] = "me" is implicit, only partner matters)
const HINT_STAGES_USER = [
  "me & Partner defeated Player3 & Player4 11-7 #tag",
  "Partner defeated Player3 & Player4 11-7 #tag",
  "Player3 & Player4 11-7 #tag",
  "Player4 11-7 #tag",
  "#tag",
  "tag",
] as const;

// Hint stages for admin (all 4 players are explicit)
const HINT_STAGES_ADMIN = [
  "Player1 & Player2 defeated Player3 & Player4 11-7 #tag",
  "Player2 defeated Player3 & Player4 11-7 #tag",
  "Player3 & Player4 11-7 #tag",
  "Player4 11-7 #tag",
  "#tag",
  "tag",
] as const;

const VERB_RE = /\b(lost\s+against|lost\s+to|fell\s+against|fell\s+to|dropped\s+to|won\s+against|defeated|beat|won|over|topped|edged|def|d\.)(?=\s)/i;
const SCORE_RE = /\d+-\d+/;

function getHintStage(text: string): number {
  if (!text) return 0;

  // Stage 5: typed past #
  if (/#/.test(text)) return 5;

  // Stage 4: typed a score pattern
  if (SCORE_RE.test(text)) return 4;

  // Stage 3: typed past a second &/and (after the verb)
  const verbMatch = VERB_RE.exec(text);
  if (verbMatch) {
    const afterVerb = text.slice(verbMatch.index + verbMatch[0].length);
    if (/(?:&|\band\b)/i.test(afterVerb)) return 3;
    // Stage 2: past the verb only
    return 2;
  }

  // Stage 1: typed past the first & or and
  if (/(?:&|\band\b)/i.test(text)) return 1;

  return 0;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  adminMode?: boolean;
}

export default function MatchTextInput({ value, onChange, adminMode = false }: Props) {
  const stage = getHintStage(value);
  const HINT_STAGES = adminMode ? HINT_STAGES_ADMIN : HINT_STAGES_USER;
  const hint = HINT_STAGES[stage];

  // The ghost layer mirrors the typed text (transparent) then shows the hint remainder.
  const visibleHint = value.length > 0 ? " " + hint : hint;

  return (
    <div className="relative w-full">
      {/* Ghost layer — sits behind the textarea, non-interactive */}
      <div
        aria-hidden="true"
        className={[
          SHARED_STYLE,
          "absolute inset-0 pointer-events-none rounded-lg whitespace-pre-wrap break-words overflow-hidden",
        ].join(" ")}
      >
        {/* User's typed text rendered transparent to keep alignment */}
        <span style={{ color: "transparent" }}>{value}</span>
        {/* Remaining hint in muted zinc-600 */}
        <span className="text-zinc-600">{visibleHint}</span>
      </div>

      {/* Actual textarea — transparent background so ghost shows through */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className={[
          SHARED_STYLE,
          "relative z-10 rounded-lg border border-zinc-600 bg-transparent text-zinc-50",
          "placeholder-transparent resize-none focus:border-zinc-400 focus:outline-none",
        ].join(" ")}
      />
    </div>
  );
}
