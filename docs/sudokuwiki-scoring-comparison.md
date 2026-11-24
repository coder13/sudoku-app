# SudokuWiki technique scores vs. our scorer

This compares SudokuWiki's current **Grading Puzzles** score table, adopted October 1, 2025, with the engine's classic reference costs and evidence adjustments in scoring version 15. SudokuWiki values below are the table's base weights, before its board-candidate factor. Our values are reference costs in raw points. Scoring version 15 includes an exploratory UR1-specific reference-cost adjustment inspired by SudokuWiki; see the candidate-density experiment for its rationale and limits.

## Why the numbers are not on the same scale

SudokuWiki multiplies each strategy's listed points by a factor based on the number of remaining candidates on the board at that point in the solve. It sums the weighted steps, then applies a logarithmic conversion to a grade. Its page says this newer scheme no longer awards extra points based on how many candidates a step removes.

Our engine charges once per deduction, independent of the number of candidates removed. Some costs scale with proof evidence: chain links, Medusa network nodes, candidates in a Unique Rectangle, forcing-branch proof size, fish structure, and loop size. We do not apply a whole-board candidate-density multiplier or convert total points to a 1–10 grade. Our point total is diagnostic; the puzzle's level is the hardest technique tier in its solver trace.

Therefore, a SudokuWiki base weight of 80 and our reference cost of 240 do not mean ours is three times harder. They are inputs to different grading systems.

## Sudoku techniques in SudokuWiki's score table

`F` means SudokuWiki's candidate-density factor. “Our cost” is the engine reference cost; the note describes evidence adjustments when present. A “closest match” is not necessarily the same detection rule.

| SudokuWiki technique | Their base weight | Closest engine technique | Our reference cost | Comparison |
| --- | ---: | --- | ---: | --- |
| Naked Singles | `F` | Naked Single | 4 | Same broad move; our Full House is also 4. |
| Hidden Singles | `2 × F` | Hidden Single / Hidden Single Box | 14 | Same broad move; our box-only detector shares the 14 reference cost. |
| Naked Pair | `5 × F` | Naked Pair | 60 | Direct match. |
| Naked Triple | `10 × F` | Naked Triple | 80 | Direct match. |
| Hidden Pair | `10 × F` (“10 etc” on the page) | Hidden Pair | 70 | Similar family; SudokuWiki's table does not specify the later subset weights precisely. |
| Hidden Triple | `25 × F` | Hidden Triple | 100 | Direct match. |
| Naked Quad | `40 × F` | Naked Quadruple | 120 | Direct match. |
| Hidden Quad | `60 × F` | Hidden Quadruple | 150 | Direct match. |
| Pointing Pairs | `20 × F` | Pointing | 50 | Direct match to locked candidates pointing. |
| Line/Box Reduction | `20 × F` | Claiming | 50 | Direct match to locked candidates claiming. |
| Gurth's Theorem | `80 × F` | None | — | We do not have the symmetry-preservation deduction. |
| Bi-value Universal Grave | `30 × F` | BUG+1 | 100 | Closest match; our detector is specifically BUG+1. |
| X-Wing | `30 × F` | X-Wing | 140 | Direct match; our base is much higher before SudokuWiki's factor. |
| Unique Rectangle Type 1 | `20 × F` | Unique Rectangle 1 | 40 | Same family. Our cost also scales with total candidates in the four corners; 9 candidates is the reference. The 40-point base preserves SudokuWiki's 20:50 ratio against our UR2–5 reference cost of 100. |
| Chute Remote Pair | `25 × F` | None | — | No separate remote-pair detector in our catalog. |
| Simple Colouring | `50 × F` | Simple Coloring | 150 | Direct match. |
| Y-Wing | `50 × F` | XY-Wing | 160 | Same technique under a common alternate name. |
| Rectangle Elimination | `25 × F` | Empty Rectangle | 120 | SudokuWiki says Rectangle Elimination replaces Empty Rectangle as an equivalent pattern. |
| Sword-Fish | `50 × F` | Swordfish | 150 | Direct match. |
| XYZ Wing | `60 × F` | XYZ-Wing | 180 | Direct match. |
| Tridagon | `60 × F` | Tridagon | 410 | Direct match; our direct pattern reference is substantially higher. |
| X-Cycle | `(60 + chain length) × F` | X-Chain; AIC/Nice Loop | 260; 280 | No one-to-one mapping: our X-Chain is linear; AIC and Nice Loop cover loop-style inference. Evidence scales by links. |
| XY-Chain | `(50 + chain length) × F` | XY-Chain | 260 | Direct match; our cost scales by link count, with a 4-link reference and half-cost floor. |
| 3D Medusa | `80 × F` | 3D Medusa | 240 | Same family; our cost scales with colored candidate-network nodes, using 10 nodes as the reference. |
| Jelly-Fish | `80 × F` | Jellyfish | 160 | Direct match. |
| Unique Rectangle Types 2–5 | `50 × F` | Unique Rectangle 2–5 | 100 each | Same family; our cost varies with the four corner candidate counts, not with the type number. |
| Avoidable Rectangle | `60 × F` | None | — | Our direct UR methods require uniqueness; we do not have this separate avoidable-rectangle detector. |
| Twinned XY-Chains | `100 × F` | None | — | No exact technique in our catalog. Multi-Coloring is related in spirit but is not the same detector. |
| Fireworks | `100 × F` | Fireworks | 240 | Direct family match; our catalog also has separate Firework W-, L-, ALS-, and AIC variants. |
| SK Loops | `100 × F` | SK Loop | 400 | Direct match. |
| Extended Unique Rectangle | `90 × F` | Unique Loop; UR AIC/loops | 140; 360 | Related uniqueness extensions, but not a one-to-one mapping. |
| Hidden Unique Rectangle | `100 × F` | Hidden Rectangle | 100 | Closest direct match; our cost also scales with corner candidate total. |
| WXYZ Wing | `100 × F` | WXYZ-Wing | 220 | Direct match. |
| Aligned Pair Exclusion | `140 × F` | Aligned Pair Exclusion | 310 | Direct match. |
| Exocet | `300 × F` | Exocet | 450 | Direct match to the junior Exocet family; our Senior and Double Exocets have separate costs of 550 and 600. |
| Grouped X-Cycle | `(100 + chain length) × F` | Grouped AIC / grouped Nice Loops | 300 | Related grouped inference, but no separate Grouped X-Cycle ID. Our grouped proof cost scales with link and group evidence. |
| Finned X-Wing | `160 × F` | Finned X-Wing | 130 | Direct match; our reference cost is lower than plain X-Wing's 140. |
| Finned Sword-Fish | `190 × F` | Finned Swordfish | 200 | Direct match; close base weights before either system's contextual factors. |
| Franken Sword-Fish | `150 × F` | Franken Fish | 420 | Closest match; our catalog groups Franken fish and scales complex-fish evidence. |
| Alternating Inference Chains | `(100 + chain length) × F` | AIC | 280 | Direct family match; our cost scales with inference links and grouped candidates. |
| AIC with Groups | No separate score listed | Grouped AIC | 300 | The page lists the strategy in Extreme but gives no dedicated weight; grouped link evidence scales our cost. |
| AIC with ALSs | No separate score listed | ALS AIC | 360 | The page lists the strategy in Extreme but gives no dedicated weight. |
| AIC with URs | No separate score listed | Unique Rectangle AIC | 360 | The page lists the strategy in Extreme but gives no dedicated weight. |
| Sue-de-Coq | `180 × F` | Sue de Coq | 250 | Direct match. |
| Digit Forcing Chain | `(120 + chain length) × F` | Forcing Chain | 500 | Closest match; ours scales by branch proof size, longest path, and alternatives, not just one chain length. |
| Nishio Forcing Chain | `(120 + chain length) × F` | Forcing Chain | 500 | No separate Nishio cost in our catalog. |
| Cell Forcing Chain | `(180 + chain length) × F` | Forcing Chain / Forcing Net | 500 / 700 | No separate cell-forcing technique; proof structure determines the closest engine method. |
| Unit Forcing Chain | `(180 + chain length) × F` | Forcing Chain / Forcing Net | 500 / 700 | No separate unit-forcing technique in our catalog. |
| Almost Locked Sets | `140 × F` | ALS-XZ, ALS-XY-Wing, ALS-Chain | 300 / 320 / 340 | Our catalog separates ALS forms and assigns each its own reference cost. |
| Death Blossom | `200 × F` | Death Blossom | 360 | Direct match. |
| Pattern Overlay | `100 × F` | Pattern Overlay | 500 | Direct match to one-digit overlay; our pairwise through quintuple variants have separate costs from 650 to 1,100. |
| Quad Forcing Chain | `(200 + chain length) × F` | Forcing Chain / Nested Forcing Net | 500 / 950 | No separate quad-forcing technique; nested proof size affects our net cost. |
| Bowman Bingo | `100 × F` | None | — | No guessing/search deduction is included as a logical technique in our catalog. |

## SudokuWiki variant-only weights

These rows are on the same SudokuWiki page but are not classic Sudoku techniques. The engine has some related variant deductions, but the rules and proof definitions do not align one-to-one.

| SudokuWiki variant technique | Their base weight | Closest engine support | Our reference cost |
| --- | ---: | --- | ---: |
| Double Pointing Pairs (Jigsaw) | `30 × F` | Locked Candidates | 50 |
| Double Line/Box Reduction (Jigsaw) | `30 × F` | Locked Candidates | 50 |
| Triple Line/Box Reduction (Jigsaw) | `50 × F` | Locked Candidates | 50 |
| Law of Leftovers (Jigsaw) | `30 × F` | No direct named technique | — |
| Trivial KenKen Dogleg | 10 | No KenKen technique family | — |
| Killer Innies/Outies | 5 | Cage Combinations / Cage-House Sum | 34 / 67 |
| Easy / Hard Combinations | 5 / 10 | Cage Combinations | 34 |
| Rule of Parity | 50 | Parity | 6 |
| Killer Cage Splitting | 40 | Cage Combinations | 34 |
| Killer Innies (2+ cells) | 30 | Cage-House Sum | 67 |
| Cage/Unit Overlap | 60 | Cage-House Sum | 67 |
| Killer Cage Comparison | 50 | No direct named technique | — |
| KenKen Dogleg | 20 | No KenKen technique family | — |
| Rule of 21 / Rule of 720 | 40 | No KenKen technique family | — |

## Our techniques without a dedicated SudokuWiki weight

The comparison is asymmetric: our catalog has additional named methods or subtypes that SudokuWiki either groups under a broader score or does not list in its score table. Examples include Sashimi and Kraken fish, finned/sashimi Jellyfish, several forcing-net variants, Tridagon AIC/forcing variants, Multi-Coloring, several ALS and Firework subtypes, and the multi-digit Pattern Overlay variants. Their closest SudokuWiki family weight is not an exact score match.

## Main differences

1. SudokuWiki applies one **global candidate-density factor** to every deduction. Our evidence adjustments are **local to the proof**: a long chain, large Medusa network, cluttered UR, larger fish, or deeper forcing proof gets a different cost.
2. SudokuWiki uses **different base weights for named subtypes** such as UR1 versus UR2–5, and its table has separate finned fish and forcing-chain kinds. Our current experiment gives UR1 a lower base than UR2–6 and still varies each rectangle's cost by corner candidate count; several forcing forms share broader engine techniques. UR6 has no directly matched SudokuWiki weight yet.
3. The raw point scales are intentionally unrelated. SudokuWiki log-scales totals to a grade; our total points do not determine the displayed tier.
4. SudokuWiki's table includes techniques absent from our engine, and our catalog includes additional techniques that have no dedicated SudokuWiki weight.

## Sources

- SudokuWiki, [Grading Puzzles](https://www.sudokuwiki.org/Print_Grading_Puzzles) (new scheme dated October 1, 2025; weights and candidate-density/log-grade method).
- SudokuWiki, [Rectangle Elimination](https://www.sudokuwiki.org/Rectangle_Elimination) (says it replaces Empty Rectangles as an equivalent pattern).
- Engine catalog and evidence rules: `crates/engine/src/technique.rs`, `crates/engine/src/hints.rs`, and `crates/engine/src/variant/logical.rs`.
