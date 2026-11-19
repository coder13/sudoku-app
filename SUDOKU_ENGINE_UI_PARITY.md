# Engine and app UI parity

The current priority is to expose the rule families already implemented in the engine. Starting main `ff9c9b9` has 27 native rule types and Jigsaw layouts. Its app accepts twenty native rule families, with twenty-one named variants plus Classic. Seven rule families have native candidates, exact solving, logical proofs and teaching fixtures but need app integration. The first integration below adds Between Lines, including New Puzzle generation.

| Rule family | Engine | App integration | Issue |
| --- | --- | --- | --- |
| Between Lines | In main | In progress in `codex/sudoku-ui-parity-between` | [63](https://github.com/coder13/sudoku-app/issues/63) |
| Region Sum Lines | In main | Pending | [67](https://github.com/coder13/sudoku-app/issues/67) |
| Clone | In main | Pending | [42](https://github.com/coder13/sudoku-app/issues/42) |
| Sandwich | In main | Pending | [68](https://github.com/coder13/sudoku-app/issues/68) |
| Little Killer | In main | Pending | [69](https://github.com/coder13/sudoku-app/issues/69) |
| X-Sums | In main | Pending | [70](https://github.com/coder13/sudoku-app/issues/70) |
| Skyscrapers | In main | Pending | [80](https://github.com/coder13/sudoku-app/issues/80) |

Each integration must preserve the complete source puzzle through import preview, desktop/mobile clues, input and conflicts, both Pencil modes, candidates, undo/redo, actual storage and sharing. Hints must offer several valid moves, retain Technique Finder counts and pages, and explain their real rule premises. Exact solutions and honest human walkthroughs must use every combined rule. Existing Learn and practice content must open playable, correctly drawn examples.

Use published puzzle/solution controls and independent numeric checks. Exercise combined rules, transformations, disabled techniques, explicit removals and changed positions. Measure candidates, validation, exact solving, ratings, hints and generation. Keep each family in its own PR and update the TODO as checks finish. New Puzzle generation is required for every supported variant, including the thirteen families currently available only through import. Each offered difficulty needs a verified recipe, visible preview, distinct puzzles, complete logical solving and independent uniqueness/rule-dependence checks. Between Lines starts with calibrated Easy and Medium recipes; the remaining family recipes are tracked in [issue 189](https://github.com/coder13/sudoku-app/issues/189).

Fog visibility is a separate engine feature tracked in [91](https://github.com/coder13/sudoku-app/issues/91). Remaining authored-source semantics and interchange formats stay in [7](https://github.com/coder13/sudoku-app/issues/7). General Difference research in [85](https://github.com/coder13/sudoku-app/issues/85) follows the existing-family parity work.

## Between Lines

The existing engine compiles ordered paths of at least three distinct cells. Every interior digit lies strictly between the two endpoint digits; interior digits can repeat when their houses and other rules permit it. Each original Coach `betweenLine` segment compiles independently. App rule acceptance, Coach decoding, grid markings, cell descriptions, placement cleanup and complete help/storage flows are now implemented, reusing existing native proofs and Learn content. [Source, behavior, generation and performance audit](SUDOKU_BETWEEN_AUDIT.md)

The first source controls are Philip Newman's [Between, the Lines](https://www.gmpuzzles.com/blog/2026/08/between-lines-sudoku-by-philip-newman/), with its published grid and solution PDFs, and Raumplaner's complete [Between the Dots](https://sudoku.coach/en/s/9KxH), which combines twelve Between paths and eleven black dots with zero givens. Keep every companion clue. The source fixtures retain original links, givens, ordered paths, printed completions and the original Coach code. Independent numeric search verifies one solution for both complete sources, matching the printed completions. The Newman control closes in one independent search node; the mixed Coach control uses 201. Static rendered clues and actual app contracts pass; exact-head release gates remain pending.

## New Puzzle generation parity

The user explicitly confirmed generation parity. In addition to the seven missing rule families above, add verified New Puzzle recipes for the current import-only families: Anti-King, Non-Consecutive, Odd/Even, Whispers, Palindrome, Global Entropy, Entropic Lines, Modular Lines, Renban, Inequality, XV, Two-cell sums and Quadruple. Existing generation/worker APIs already support these rules. Keep generation and all play/help flows in each family’s integration and verify every advertised difficulty.

Between calibration checks twenty of twenty Easy seeds and nineteen of forty one-attempt Medium seeds. Every accepted puzzle is independently unique and needs the Between rule. Three known Medium seeds provide the bounded fallback. App generation now passes full played-puzzle exclusions to the engine, including square symmetries; a reproduced rotated-duplicate fallback is covered by a regression.
