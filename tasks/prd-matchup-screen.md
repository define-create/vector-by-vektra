# PRD: Matchup Projection Screen

## 1. Introduction / Overview

The Matchup Projection screen gives a player a model-based forecast for an upcoming match against a specific opponent pair. It surfaces win probability, fair moneyline, and five structural signals that explain the projection, plus a head-to-head history between the two pairs.

The screen is clinically quantitative — no motivational language, no gamification, no color-coded win/loss indicators. It should feel like a Bloomberg terminal readout: institutional, precise, quiet.

---

## 2. Goals

1. Allow a player to navigate to a matchup projection from the bottom nav by selecting their partner and two opponents.
2. Allow a player to long-press a match in Recent Matches and jump directly to the projection with players pre-populated.
3. Display model-based win probability and fair moneyline derived from ELO ratings.
4. Display 5 structural metrics that explain the forecast: Δ Rating, Confidence, Volatility, Momentum, Expectation Gap.
5. Display a head-to-head history table (H2H matches between the two pairs only).
6. Compute all projection data on-the-fly via an API route (no pre-computation required).

---

## 3. User Stories

- As a player, I want to navigate to a Matchups screen from the bottom nav, select my partner and two opponents, and see the model-based win probability for that matchup.
- As a player, I want to understand the structural factors behind the probability (Momentum, Volatility, etc.) so I can contextualize the forecast.
- As a player, I want to see our head-to-head history so I have empirical grounding beyond the model.
- As a player browsing my Recent Matches list, I want to long-press a match row to instantly view the matchup projection for those four players.

---

## 4. Functional Requirements

### 4.1 Navigation & Entry Points

1. The bottom navigation must include a "Matchups" entry that navigates to `/matchups`.
2. The `/matchups` page must display a player selector where the user chooses:
   - Their partner (1 player)
   - Two opponents (2 players)
3. Once all three players are selected (partner + 2 opponents), the projection renders on the same page below the selector.
4. On the Recent Matches list (Command screen), a long-press gesture on a match row must navigate to `/matchups` with the partner and two opponents pre-populated from that match's data.

### 4.2 API Route

5. A new API route `GET /api/matchup` must accept four player IDs as query parameters: `player1`, `player2`, `player3`, `player4` (where player1+player2 are the primary pair).
6. The route must compute and return all projection data on-the-fly from the database. No pre-computed snapshots are used.
7. The route must return the following fields:
   ```
   probability        number          (0–1, e.g. 0.63)
   moneyline          number | "Even"
   ratingDiff         number          (aggregate rating of pair A minus pair B)
   confidence         number          (CI metric for primary player)
   volatility         string          (VolBand metric for primary player, e.g. "±7%")
   momentum           number          (computed per formula, typical range −30 to +30)
   expectationGap     number          (see definition in §4.4)
   history            Array<{
                        date: string,
                        result: "W" | "L",
                        score: string,
                        delta: number
                      }>
   record             string          (e.g. "3–2")
   avgMargin          number          (average rating delta across H2H matches)
   ```

### 4.3 Win Probability & Moneyline

8. **Win probability** must be computed using the ELO expected score formula:
   ```
   E = 1 / (1 + 10^((Rb - Ra) / 400))
   ```
   where `Ra` is the sum of ratings for the primary pair, and `Rb` is the sum of ratings for the opponent pair.

9. **Moneyline** must be derived from probability using the zero-vig formula:
   - If `p >= 0.5`: `moneyline = -100 * p / (1 - p)`
   - If `p < 0.5`: `moneyline = 100 * (1 - p) / p`
   - Round the result to the nearest 5.
   - If `p` is between 0.47 and 0.53 (inclusive), return the string `"Even"` instead of a number.

10. **Probability display** must be `Math.round(probability * 100)` — a whole-number percentage, no decimals (e.g., `63`).

### 4.4 Structural Metrics Definitions

11. **Δ Rating** — The aggregate rating of the primary pair minus the aggregate rating of the opponent pair.
    - Display example: `+36`

12. **Confidence** — Reuse the existing CI (Confidence Interval) metric already computed and stored for the primary player in the snapshot system (see Task 5.0).
    - Display example: `0.68`

13. **Volatility** — Reuse the existing VolBand metric already computed and stored for the primary player.
    - Display example: `±7%`

14. **Momentum** — A structural derivative of rating movement: the recent, normalized acceleration of rating change relative to expectation. Computed as follows over the primary player's last 10 matches:

    **Step 1 — Normalize rating deltas:**
    ```
    Ni = Δi / Ki
    ```
    where `Δi` is the rating change from match `i`, and `Ki` is the K-factor applied in that match. This removes distortion from variable K-factor sensitivity.

    **Step 2 — Expectation adjustment:**
    ```
    Si = Ai - Ei
    ```
    where `Ai` is the actual result (1 = win, 0 = loss) and `Ei` is the ELO expected score for that match. This measures surplus performance.

    **Step 3 — Weighted reinforcement:**
    ```
    M = (1/n) * Σ(Ni * Si)
    ```
    This captures whether rating gains are structurally reinforcing model surplus.

    **Step 4 — Acceleration component:**
    ```
    A = slope(Ni)
    ```
    Compute the linear regression slope of the normalized deltas `N1…Nn`. This measures whether rating changes are increasing in magnitude over the window.

    **Final Momentum score:**
    ```
    Momentum = 100 * (0.7 * M + 0.3 * A)
    ```
    Typical range: −30 to +30. Positive = structurally rising, Near zero = stable, Negative = structurally declining.

15. **Expectation Gap** — Measures actual performance vs. model expectation in the specific matchup context. The unit of analysis matches the matchup card: pair vs. pair when both partners are specified.

    **Formula:**
    For each match `i` in the relevant match set `M`:
    - `Ai ∈ {0, 1}` — actual result (win = 1)
    - `Ei ∈ [0, 1]` — expected win probability at match time (from the rating model)

    ```
    ExpectationGapRaw = (1/n) * Σ(Ai − Ei)
    ExpectationGap    = 100 × ExpectationGapRaw
    ```

    **Sample size shrinkage** (required — prevents small-sample instability):
    ```
    w = n / (n + 5)
    ExpectationGapFinal = w × ExpectationGap
    ```
    Examples: n=1 → w=0.17, n=5 → w=0.50, n=10 → w=0.67, n=20 → w=0.80

    **Scope ladder** — `M` is determined by the most specific scope with available data, falling back in order:
    1. Pair vs. Pair — `(you + partner)` vs. `(opponent1 + opponent2)` *(preferred)*
    2. Pair vs. Opponent individuals — your pair vs. either opponent regardless of opponent's partner
    3. Player vs. Opponent pair — you (with any partner) vs. the opponent pair
    4. Player vs. Opponent individuals — you vs. either opponent regardless of partners
    5. Global — your overall `Ai − Ei` across all matches in the window

    **Display rules:**
    - If `n < 3` at the resolved scope, still show the value but apply a subtle "low sample" indicator (dimmed value or small icon). Do not hide the metric.
    - Display example: `−8` (underperforming model expectation vs. this pair by 8 points)
    - Positive = outperforming model expectation; Negative = underperforming

### 4.5 Head-to-Head History

16. Pairs are formed ad-hoc per match — there is no stored "pair" entity in the database. All pair-based queries must be resolved at query time by matching player IDs within match team assignments.
17. The History section must show only matches where `(player1 + player2)` appeared on one team AND `(player3 + player4)` appeared on the other team, in any team-slot order (i.e., the query is order-invariant within each team). It is not a general recent-matches list.
18. Matches must be ordered by date descending (most recent first).
19. Each history row must display: date, result (W or L), score string, and rating delta (Δ) for the primary player.
20. The meta line above the history table must display the win–loss record (e.g., `3–2`) and average rating margin (e.g., `Avg Margin: +2.6`).
21. If there are no H2H matches, display an empty state message such as "No head-to-head history found."

### 4.6 UI Layout & Components

21. The page header must display:
    - Title: `"Matchup Projection"`
    - Subtitle: `"Model Output · Fair Line"`

22. The **Primary Projection Card** must contain three sections:
    - **Teams Block** (top-left of card): Primary pair names on one line, opponent pair names below (slightly dimmed).
    - **Forecast Block** (left-dominant): Probability in large type, moneyline below it, `"Model Line"` label below that.
    - **Structural Metrics Grid** (right column): 2-column grid displaying all 5 metrics (Δ Rating, Confidence, Volatility, Momentum, Expectation Gap). Each metric: label above, value below.

23. The **Head-to-Head History Card** must contain:
    - Title: `"Head-to-Head History"`
    - Meta line: record and average margin
    - Column headers: `DATE`, `R`, `SCORE`, `Δ`
    - Rows matching the column template

24. No green or red coloring anywhere on the screen for win/loss or favored/underdog status.

25. All numeric values must use tabular numerals (`className="tabular-nums"` or `style={{ fontFeatureSettings: '"tnum"' }}`).

---

## 5. Non-Goals (Out of Scope)

- No tap-to-expand on history rows (future interaction)
- No tooltip explanations on metric labels (future)
- No long-press moneyline formula explanation (future)
- No sensitivity analysis panel
- No color coding for wins/losses or favorites
- No animations or transitions
- No sharing or exporting matchup data
- No pre-computation or caching of matchup data at recompute time

---

## 6. Design Considerations

### Visual Tone
The screen must feel like a Bloomberg terminal: institutional, analytical, quiet authority. No emotional reinforcement, no hype.

### Eye Flow (enforced by typography hierarchy)
Top-left → Probability → Moneyline → Structural Metrics Grid → History

### Typography

| Element | Class |
|---|---|
| Probability | `text-[170px] font-bold tracking-tight leading-none tabular-nums` |
| Moneyline | `text-[66px] font-bold leading-none tabular-nums` |
| "Model Line" label | `text-sm` (dimmed) |
| Metrics labels | `text-sm` (dimmed) |
| Metrics values | `text-2xl font-medium tabular-nums` |
| History title | `text-4xl font-bold` |
| History meta | `text-sm` (dimmed) |
| History column headers | `text-xs uppercase tracking-wide` (dimmed) |
| History rows | `grid grid-cols-[200px_60px_1fr_80px] py-5 border-b border` |
| Δ column | `text-right tabular-nums` |

### Card Styling
- `rounded-xl` (20px equivalent)
- `border border-[#374155]`
- Dark background, consistent with the rest of the app
- No gradients, no glass effects, no blur, no decorative elements

### Metrics Grid Spacing
- 2-column grid, `gap-x-16 gap-y-10`
- Consistent `label mb-2 value` baseline spacing within each cell

### Accessibility
- Minimum contrast ratio: 4.5:1 for labels, 7:1 for numeric values
- Tap targets minimum 44px height
- Dark theme, OLED-optimized

---

## 7. Technical Considerations

- **ELO formula**: Reuse `lib/elo.ts` for win probability calculation.
- **CI and VolBand**: Reuse existing metrics from the player snapshot system introduced in Task 5.0.
- **K-factor for Momentum**: `Ki` must not be stored as editable state on the matches table. Instead:
  - **Source of truth**: recompute `Ki` deterministically in the rating engine during replay (same logic as `lib/elo.ts`). Since the rating engine is deterministic, replaying the last 10 matches will always yield the same `Ki` values.
  - **Best practice**: persist `k_used` in a derived "rating facts" table keyed by `run_id` for audit trails and performance (avoids replaying matches on every Momentum request).
  - The Momentum API implementation must obtain `Ki` via one of these two approaches — never from a mutable column on the match record.
- **Long-press handler**: The existing Recent Matches list component (Command screen) needs an `onLongPress` handler added to each row that navigates to `/matchups` with the four player IDs as query params.
- **Player selector**: The selector must default to showing only players the current user has previously played against (derived from match history). A search input must allow the user to find and select any player in the system. Reuse or extend existing player search/picker components if available.
- **H2H query**: Pairs are ad-hoc — no stored pair entity exists. The query must find matches by player ID membership within team assignments: match where team A contains `{player1, player2}` AND team B contains `{player3, player4}`, order-invariant within each team. The Expectation Gap scope ladder applies the same ad-hoc matching logic at each scope level.
- **Route**: `GET /api/matchup?player1=&player2=&player3=&player4=`

---

## 8. Success Metrics

- The Matchups screen is reachable from both the bottom nav and via long-press on Recent Matches.
- Win probability, moneyline, and all 5 structural metrics render correctly for any valid player combination.
- H2H History renders correctly, or shows an empty state when no history exists.
- Momentum is computed using the canonical formula defined in §4.4.
- All numeric values are tabular-aligned.
- No green or red coloring appears anywhere on the screen.
- TypeScript compiles with zero errors.
- The screen matches the Bloomberg terminal aesthetic: no gradients, no glass, no gamification.

---

## 9. Open Questions

1. ~~**K-factor storage**~~ — **Resolved**: Recompute `Ki` deterministically in the rating engine during replay. Persist `k_used` in a derived "rating facts" table keyed by `run_id` for audit/performance. Do not store on the matches table. (See §7.)
2. ~~**Expectation Gap — pair vs. individual**~~ — **Resolved**: Use pair H2H when both partners are specified. Fall back through a 5-level confidence-weighted scope ladder when pair H2H is sparse. Apply shrinkage factor `w = n/(n+5)`. Show a low-sample indicator when `n < 3`. (See §4.4 item 15.)
3. ~~**Player selector scope**~~ — **Resolved**: Default list shows only players the current user has previously played against. A search input allows finding any player in the system. (See §7.)
4. ~~**Long-press scope**~~ — **Resolved**: The long-press gesture applies to the Command screen's Recent Matches list only. No other match lists in the app require this behavior.
5. ~~**Doubles pair definition**~~ — **Resolved**: Pairs are formed ad-hoc per match. No stored pair entity exists. All pair-scoped queries match by player ID membership within team slots at query time. (See §4.5 items 16–17 and §7.)
