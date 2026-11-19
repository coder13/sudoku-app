# Sized Sudoku grid audit

[Issue 224](https://github.com/coder13/sudoku-app/issues/224) tracks the first playable 4×4 grid. [PR 236](https://github.com/coder13/sudoku-app/pull/236) covers single-grid Mini Sudoku with four 2×2 boxes. Version 2 carries explicit grid and box dimensions. The native solver supports rectangular box layouts with up to 16 digits. The app exposes 4×4 first.

The source review identifies several distinct compatibility requirements:

- Sudoku Coach publishes [a 6×6 solve](https://sudoku.coach/en/s/7Pyk) and [a mixed 6×6 puzzle](https://sudoku.coach/en/s/GErF). Both exports specify 36 cells and six 2×3 boxes. An independent search found one solution to the mixed puzzle and multiple solutions when it removed any of the main diagonal, even cells, or Thermometers. Import needs all three rules together. [Issue 230](https://github.com/coder13/sudoku-app/issues/230) tracks the player and import work.
- SudokuPad hosts [TVDK's 6×6 variant set](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000RIQ). It supplies separate Thermometer, Renban, Arrow, Kropki, and Region Sum Lines controls. [Algebraic Cages I](https://sudokupad.app/babxk5ixus) is a 4×4 control with three related cage totals, tracked in [issue 225](https://github.com/coder13/sudoku-app/issues/225).
- [Krazydad Hex Sudoku](https://krazydad.com/hexsudoku/) offers 16×16 puzzles in both hexadecimal and decimal notation. A displayed zero can be a given. Preserve external symbols separately from the engine's digit IDs and empty-cell encoding. [Issue 233](https://github.com/coder13/sudoku-app/issues/233) follows this work.
- [Krazydad's five-grid Samurai](https://krazydad.com/samurai/index.php?sv=SAM5_v1) requires shared cells at the four overlaps. [Issue 234](https://github.com/coder13/sudoku-app/issues/234) tracks composition separately.

## Verification

An independent row-permutation oracle enumerates all 288 completed 4×4 grids. The regression checks every subset of one completion against that oracle and compares 32 generated fixtures per recipe with independently counted solutions and exact replay. Easy uses 8–10 givens. Medium uses 4–6 givens and at most three opening naked singles. Both require a complete singles replay. The app supplies those two recipe labels and keeps Mini Sudoku outside the 9×9 adaptive rating system.

The app round-trips 16-character givens, four-line text, and a versioned share link. It accepts compatible 4×4 Sudoku Coach and f-puzzles exports, including f-puzzles payloads carried by SudokuPad links. It rejects layouts and authored rules the Mini Sudoku player cannot enforce. A desktop and 390 px touch browser check covered New Puzzle, import, keyboard movement, Finder, hint application, undo and redo, reload, the final solution grid, and a share link in a fresh session.

## Wasm performance

Run `node scripts/bench-sized-grids.mjs BASELINE_WASM [SIZED_WASM]` with release Wasm from the app profile. The baseline used the Classic and variant engine from `8b2f8d8`, plus the documentation-only update in `d9a04f5`. The fixtures below have about 60% givens. They check scaling on known-unique Classic layouts and are separate from hard or mixed-rule benchmarks. Times include the structured Wasm request and response, without browser scheduling or rendering. Reported values are medians of batch means on the local host.

| Grid | Verify unique | Candidates | Next deduction | Exact solve | Full trace |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4×4 | 4.7 µs | 3.2 µs | 3.9 µs | 2.9 µs | 23 µs |
| 6×6 | 3.7 µs | 4.0 µs | 3.9 µs | 4.4 µs | 63 µs |
| 8×8 | 5.5 µs | 5.5 µs | 4.8 µs | 7.2 µs | 157 µs |
| 12×12 | 15.9 µs | 10.5 µs | 7.7 µs | 20.3 µs | 609 µs |
| 16×16 | 39.7 µs | 17.7 µs | 11.7 µs | 49.4 µs | 1,824 µs |

Direct serialization removes the intermediate JSON tree. On an alternating comparison of the same 16×16 trace, the median fell from 1.81 ms to 1.23 ms and the 95th percentile fell from 2.23 ms to 1.48 ms. Wasm linear memory after that trace fell from 4.19 MiB to 2.25 MiB. The before and after outputs were equal.

The app Wasm grew from 3,417,504 to 3,479,007 bytes, or 24,514 additional bytes with gzip. The 9×9 reference grid's early checks kept the same result and linear-memory footprint. Median local verification, candidate, and solve times were in the same microsecond range. The generator found a puzzle for each of 1,000 sampled seeds per recipe without exclusions. Median generation was 7 µs for Easy and 23 µs for Medium. Native tests separately verify exclusions and solution counts.

## Algebraic Cages research

The original [Algebraic Cages I](https://sudokupad.app/babxk5ixus) export has three distinct cages and no givens. The exact solver verifies a unique completion with `x = 6`. The 21 logical steps reach the same grid. The first proof combines all three cage bounds to rule out 2, 3, and 4 from R1C1. The branch preserves the author's labels, rules, cage membership, and source export through preview, desktop and mobile Play, Finder, walkthrough, and sharing. A separate Wasm contract fixture makes the classic grid ambiguous so a regression that drops the arithmetic will fail.

An alternating benchmark used 1,800 samples per build and operation on the original source. The median hint request fell from 30.4 to 21.5 µs and the median walkthrough from 155.5 to 100.8 µs. The optimized build reused the position's cage bounds and serialized proofs directly. Independent verification and exact solving remained about 22 and 18 µs. The final app-profile build used about 1.38 MiB of Wasm linear memory after the requests, down from 1.50 MiB. The two builds returned equal results for every request shape in the benchmark.

A separate generation prototype tested 256 seeds against an independent enumeration of all completed 4×4 grids. Each output had one solution, needed every cage, and had a complete logical replay. The sampled search found a puzzle within 17 attempts for every seed. The Rust generator checks those constraints before returning a puzzle. In a separate release-Wasm run, 1,000 timed seeds produced 1,000 distinct definitions with a median of 114 µs and a 95th percentile of 379 µs including the Wasm response. The Learn lesson uses synthetic boards with engine-verified candidate removals. The editor, public generation and puzzle difficulty calibration are tracked in [issue 225](https://github.com/coder13/sudoku-app/issues/225).
