# Algebraic Cages I: roadmap source

The user requested these additions from [Algebraic Cages I by zainasaur20](https://sudokupad.app/babxk5ixus). The complete source needs a 4×4 grid and Algebraic Killer Cages with a shared positive integer. Both capabilities are planned. The current shipping engine does not support this complete puzzle.

Track sized grids in [issue 224](https://github.com/coder13/sudoku-app/issues/224) and algebraic cage totals in [issue 225](https://github.com/coder13/sudoku-app/issues/225). The [engine roadmap](SUDOKU_ENGINE_ROADMAP.md#requested-source-algebraic-cages-i) records their order and release criteria.

## Complete source and expected result

The public SudokuPad API returns an `scl` payload for `babxk5ixus`. Its compressed payload SHA-256 is `49b2d64fda3ada97c91611c82810e61786870d59b5aa40410b81508f1991b114`. The source has sixteen cells, zero givens, digits 1–4 and four standard 2×2 regions. Every row, column and region contains each digit once.

One positive integer `x` supplies all three cage totals. Cage digits cannot repeat. Preserve these cells and labels together:

| Authored label | Cells | Total in the unique solution |
| --- | --- | ---: |
| `x` | R2C2, R2C3, R3C2 | 6 |
| `x+1` | R3C4, R4C4 | 7 |
| `x-5` | R1C1 | 1 |

The source's expected digit grid is:

```text
1 3 4 2
4 2 3 1
3 1 2 4
2 4 1 3
```

Independent row-permutation enumeration visits all 288 completed standard 4×4 grids. Exactly one satisfies all three symbolic sums and cage distinctness, matching the source completion with `x = 6`. The audit uses direct integer equations and row/column/box checks, without the shipping solver. The full source and audit remain under `/tmp/sudoku-babxk5ixus-roadmap`.

A direct opening proof also establishes `x = 6`. The singleton cage gives `1 ≤ x-5 ≤ 4`, so `6 ≤ x ≤ 9`. Two distinct digits from 1–4 sum to at most 7, so `x+1 ≤ 7`. Together these bounds force `x = 6`, then R1C1 is 1. The two-cell cage uses 3 and 4, and the three-cell cage uses 1, 2 and 3.

## Model and implementation requirements

Build and verify a sized single grid first. A versioned grid specification must describe the digit alphabet, cell coordinates, houses and regions. Derive masks, validation, applicable techniques and grid rendering from that specification. Preserve version-1 9×9 behavior and its public contracts.

Represent the shared integer separately from Sudoku digits. Here `x = 6` exceeds the grid alphabet 1–4. Existing digit-cipher proposals and alternative fixed cage totals do not express this requirement. Use typed expressions with shared variable references and integer offsets for `x`, `x+1` and `x-5`. Infer variable bounds from all active constraints. Preserve the authored labels alongside their parsed meaning.

Exact enforcement must combine cage distinctness, expressions and every grid rule even when explanatory techniques are disabled. Define complete-solution identity over both required digit and variable assignments. Retain original constraint indices and expression premises in replayable proofs. Start independent proof controls with the opening bounds above. Calibrate technique costs separately when implementation has evidence.

Release requires complete import/preview, visible labels, accessible rules, editor/input support, candidates, several hints, full solutions and honest human walkthroughs. Finder, pages, Learn/practice, persistence, sharing and undo/redo must retain the complete combined source. New Puzzle needs independently checked unique, algebraic-dependent recipes and played-puzzle exclusions. Measure native/Wasm size, memory, propagation, rating, solving, hint and generation costs.

Until both capabilities are integrated, preserve unsupported-source rejection. Do not coerce the grid into 9×9, discard cages or replace the shared unknown with unrelated fixed totals. Keep this work queued behind current variant-generation parity unless a documented correctness requirement changes its priority.
