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

A generation prototype tested 256 seeds against an independent enumeration of all completed 4×4 grids. Each output had one solution, needed every cage, and had a complete logical replay. The Rust generator applies those checks before returning a puzzle. The app’s editor verifies a draft with its exact cage rules before saving. Cage edits use the same undo history as digit edits. An algebraic share keeps the original SudokuPad export or the app’s typed cage definition under the existing UUID sharing contract. The Learn lesson uses synthetic boards with engine-verified candidate removals.

The algebraic score adds one point for a naked single, two for a hidden single, three for a locked candidate, and four for a cage deduction. Cage proofs have the highest cost because the player must compare compatible sums and check distinct digit assignments. A complete walkthrough is Easy at 27 points or less and Medium at 28 points or more. In an untargeted sample of 1,024 generated puzzles, 415 fell in the Easy band. This is a walkthrough measure. It does not feed the player’s 9×9 adaptive rating.

| Requested level | Distinct in 1,000 timed seeds | Score range | Median generation | 95th percentile generation | Median rating |
| --- | ---: | ---: | ---: | ---: | ---: |
| Easy | 1,000 | 19–27 | 207 µs | 863 µs | 17 µs |
| Medium | 1,000 | 28–51 | 145 µs | 505 µs | 18 µs |

These release-Wasm timings include the request and response. The app binary grew by 196,266 bytes against the shipped Mini Sudoku build, or 56,546 bytes with gzip. Wasm linear memory after both batches was 1.38 MiB. [Issue 225](https://github.com/coder13/sudoku-app/issues/225) tracks release integration.

## Six-by-six mixed-rule research

The 6×6 decoder and Wasm solver verified the two published Classic exports and both mixed exports. The mixed grids retained their main diagonals, even-cell markers and both Thermometers. The corrected sample's completion agrees with the independent solver. Removing any of its three rule types gives multiple solutions. Candidate propagation passes restrictions through shared Thermometer cells, including cases where a parity marker tightens the entire path.

On the published grid, applying the propagated masks before choosing the next search cell reduced the median native release verification from about 136 to 42 µs and the median exact solve from 114 to 16 µs. The candidate-only pass stayed below 1 µs. The baseline and optimized runs agreed on the exact grid, every rule ablation, and the presence of the solution digit in each empty cell’s candidate mask.

The Play branch opens published 6×6 Sudoku Coach URLs and preserves both rectangular layouts through preview, play, saved attempts, and public share definitions. GErF's original export passed a desktop import and play-through, including the Technique Finder, an applied Thermometer hint, undo and redo, reload, all 36 final digits, and the clues on the recipient's mobile board. Browser testing used a local app and a simulated share response. The Pages share handler was checked separately with SQLite for both box orientations.

Basic house, diagonal, parity, and Thermometer steps leave GErF incomplete after five deductions. The engine now tests candidate assumptions only when those techniques produce no step. It follows ordinary deductions inside each assumption and records the cell, house, or clue that makes it impossible. The full replay reaches the independently verified completion in 51 steps, including six such eliminations. The singles action uses the regular rules and singles.

An alternating benchmark checked 1,200 warm release-Wasm requests per build against GErF. Direct serialization produces the same hints and trace as the intermediate JSON tree. The median initial hint request fell from 21.2 to 17.1 µs. Median full replay fell from 372.9 to 291.8 µs, with a 95th percentile of 311.0 µs. Separate measurements of exact verification, solve, and candidates were approximately 46, 27, and 5 µs. These timings include serialization and exclude browser scheduling and rendering.

The five original SudokuPad exports from TVDK's pack are plain JSON in SCL envelopes. Thermometers combine a path in `lines` with a circular bulb in `underlays`. Renban and Region Sum Lines use the same general-purpose line field. Arrow also requires `arrows` and circle overlays. Kropki uses overlays. The encoded drawing properties and authored rule text both guide import. Treating every line or circle as a logical constraint would change some of these puzzles.
