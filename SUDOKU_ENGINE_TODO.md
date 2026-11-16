# Sudoku engine TODO

The Rust engine supports ordered logical solving, ratings, ranked hints, and targeted generation. It detects singles, pointing, claiming, naked and hidden subsets through size four, locked pairs and triples, basic, finned, and Sashimi fish through Jellyfish, XY-Wing, XYZ-Wing, WXYZ-Wing, W-Wing, Skyscraper, Two-String Kite, Empty Rectangle, Simple Coloring, 3D Medusa, X-Chains, and XY-Chains. It also detects plain and grouped Alternating Inference Chains and Nice Loops, Unique Rectangles, Hidden Rectangle, BUG+1, forcing chains and nets, ALS-XZ, ALS-XY-Wing, ALS chains, Sue de Coq, Death Blossom, Junior Exocet, SK Loop, and Multi-Sector Locked Sets. The browser worker exposes these engine functions through WebAssembly. [Engine requirements](README.md#engine-requirements) · [Browser worker](src/sudoku/engine.worker.ts)

## 1. Share a reliable engine contract

- [x] Use one puzzle validation path for ratings, solve traces, hints, and opening analysis. Add a sparse regression case where a logical solve succeeds after exact search reaches its limit.
- [x] Represent a position as givens, placed digits, and established candidate removals. Use it for hints, solve traces, and practice examples.
- [x] Define one catalog for technique IDs, alternate names, costs, difficulty tiers, and which techniques require a unique solution. Make sure that each catalog entry has a detector and practice fixtures.
- [x] Save and load solver configurations by stable technique ID. Preserve enabled techniques and their order across sessions. Include the scoring version in rating exports.
- [x] Expose ratings, logical solve traces, hints, and targeted generation through the browser worker. Test that malformed input cannot reuse cells from the previous request.
- [x] Add independent positive and negative fixtures for each technique. Assert the expected placements, removals, and evidence. Cover both row and column forms where they apply.
- [x] Test the public APIs against the engine requirements. Cover technique order, stalled solves, score boundaries, hint ranking, unique generation, and search limits.
- [x] Measure fixture solve time, exact search time, and generation success rate separately. Include easy puzzles, 17-clue puzzles, and expert puzzles.

Audit complete. Ratings and traces agree on the sparse regression puzzle. The Wasm contract test covers the new client calls. Removing column X-Wings makes the new rule test fail. The fixed benchmark measures rating, exact search, and generation separately.

[HoDoKu solver configuration](https://hodoku.sourceforge.net/en/docs_solv.php) · [HoDoKu regression and exemplar libraries](https://hodoku.sourceforge.net/en/libs.php) · [Tdoku benchmark data](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md)

## 2. Expand the technique catalog

- [x] Add naked and hidden triples and quadruples. Add HoDoKu-style locked pairs and locked triples.
- [x] Add XY-Wing, XYZ-Wing, W-Wing, Skyscraper, Two-String Kite, and Empty Rectangle.
- [x] Extend X-Wing support to Swordfish and Jellyfish. Add their finned and Sashimi variants.
- [x] Add simple coloring, 3D Medusa, X-Chains, and XY-Chains.
- [x] Build shared candidate links for Alternating Inference Chains, grouped chains, and loops. A link records how one candidate affects another.
- [x] Add Unique Rectangles and BUG+1. Allow these deductions after the engine proves that the puzzle has one solution.
- [x] Add WXYZ-Wing, forcing chains, and forcing nets. Record the branches that prove each deduction.
- [x] Extend expert coverage with ALS-XZ, ALS chains, Sue de Coq, and Death Blossom. An almost locked set (ALS) has one more distinct candidate digit than cells. Its cells share a row, column, or box. ALS-XY-Wing uses three sets. The ALS Chain search covers four to seven sets.
- [x] Add Exocet, SK Loop, and Multi-Sector Locked Sets after the engine can represent their evidence. This covers Junior Exocet, eight-arm SK Loops with solved cells allowed in the arms, and Multi-Sector Locked Sets with a rectangular core of up to 20 unsolved cells across two to five rows and columns, plus up to two fully covered attachments.

Audit complete. Multi-Sector Locked Sets reuse cover bounds across equivalent rectangles. Hint and opening validation use a short exact search before expensive detectors and retain the full logical fallback. Before-and-after comparisons matched traces, hints, and openings for 17 boards and deductions for all 57 practice examples. AI Escargot still stalls at 200 points. Rating time fell from about 8.0 ms to 5.7 ms in the native benchmark.

[Sudoku Coach practice catalog](https://sudoku.coach/en/practice) · [HoDoKu technique catalog](https://hodoku.sourceforge.net/en/techniques.php) · [YZF expert techniques](https://github.com/YZF-Sudoku/yzf-sudoku-web/blob/main/techniques.md)

## 3. Explain and practice deductions

- [x] Add a search across the selected techniques for one position. Return alternate proofs with their affected cells and candidates.
- [x] Test ranked hints with competing proofs and tied costs. Assert at most ten distinct moves and an empty list when fewer than two moves exist.
- [x] Offer three hint levels. Reveal the technique, then the cells or candidates to inspect, then the full deduction.
- [x] Replay a solve trace to any step. Return the position before the deduction, the evidence, and the position after it.
- [x] Open practice puzzles at the position just before the requested technique. Include all established candidate removals in that position.
- [x] Compare a submitted practice move with a proof for the target technique. Accept valid alternatives that use the same technique.

Audit complete. Native hint choices retain the two-move minimum. The worker tests cover adjustable limits, staged hints, and replay. Practice checking uses the same technique detectors as solving, including alternate proofs and actions in deductions that remove several candidates. Finned fish previews now include the fin’s box in deduction search, staged hints, and replay.

[HoDoKu finding all steps](https://hodoku.sourceforge.net/en/docs_fas.php) · [HoDoKu hints and practice modes](https://hodoku.sourceforge.net/en/docs_play.php) · [HoDoKu working with solutions](https://hodoku.sourceforge.net/en/docs_sol.php) · [Sudoku Coach practice](https://sudoku.coach/en/practice)

## 4. Target and batch-generate puzzles

- [x] Combine difficulty or score, clue count or range, and a technique target in one generation request. Rate the result with the requested solver configuration.
- [x] Support a technique anywhere in the solve path, first in that path, or as the only applicable opening. Test that a competing proof rejects an exclusive opening.
- [x] Detect incompatible requests such as Full House as the sole opening. A Full House also yields a Naked Single.
- [x] Add a reusable pool of verified sparse and expert templates. Rate each resulting board after it changes.
- [x] Report generation attempts and support cancellation between attempts. Return distinct outcomes for an invalid request, an exhausted search, and a verified match.
- [x] Add batch rating and generation commands. Record the seed, solver configuration, and scoring version with each result.

Audit complete. Native, browser, and batch generation share the attempt logic. Pool requests validate before loading the templates. Batch output records the resolved solver order, and malformed rows leave later records usable. The native benchmark matched 20 of 20 seeds at each count from 17 through 19 clues and 15 of 20 at 20 clues, using a 1,001–1,600 point target and up to 208 attempts per seed.

The batch regression also generates a unique 21-clue puzzle with Forcing Net as its sole opening technique. [Source template dml50](https://gitlab.com/scilab/forge/sudoku/-/blob/master/collection/hardest.sdm)

[HoDoKu targeted creation](https://hodoku.sourceforge.net/en/docs_cre.php) · [HoDoKu batch commands](https://hodoku.sourceforge.net/en/docs_ref.php) · [Tdoku sparse and expert puzzle sets](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md#benchmarked-data-sets)

## 5. Return the easiest hints first

In a local Wasm run, the starter puzzle returned 629 moves in about 32 ms with the full search. It returned the first ten in under 1 ms. [Play hint request](src/components/Worktable.tsx) · [Hint ranking](crates/engine/src/hints.rs)

- [x] Request up to ten ranked moves during play. Offer the full search for analysis.
- [x] Refine the ranking of similarly difficult proofs with factors such as the number of houses or chain length. Keep the number of placements and removals out of the ranking.
- [x] Test that the bounded search returns the first ten distinct moves from the full ranking.

Audit complete. The bounded request matches the full ranking on the starter grid and on a grid with established candidate removals and disabled techniques. A warmed local Wasm run on the starter grid measured a median of 0.072 ms for ten moves and 31.5 ms for all 629 moves, including proof diagrams.

## 6. Measure coverage on expert puzzles

- [x] Build a fixed set of everyday, 17-clue, and expert puzzles. Report logical solve rates and rating times separately for each group.
- [x] Save the position and candidate removals where each solve stalls. Use these positions to choose which detectors to extend.
- [x] Add detectors and practice positions for Franken Fish and Mutant Fish. Test valid deductions and similar patterns that prove none.

Baseline with the default solver order and scoring version 10. The release build timed 25 ratings per grid on one local machine. [Benchmark and fixed grids](crates/engine/benches/coverage.rs)

| Puzzle group | Logically solved | Rating median | Rating p95 |
| --- | ---: | ---: | ---: |
| Everyday | 6/6 | 0.007 ms | 0.009 ms |
| 17-clue | 6/6 | 0.036 ms | 0.045 ms |
| Expert | 3/5 | 5.994 ms | 14.250 ms |

AI Escargot stalled after one deduction. Easter Monster stalled after four, with the same remaining candidates as the end of step 4 in Allan Barker’s solution. His next move removes candidate 1 from r6c7 with a multi-digit rank-zero pattern. Use that position to evaluate a broader rank-zero detector and use AI Escargot to evaluate stronger forcing deductions. Track the complex fish independently against their own exemplars. [Replayable version 10 stalls](crates/engine/benches/fixtures/coverage-stalls-v10.jsonl) · [Allan Barker’s Easter Monster solution](https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm) · [AI Escargot](https://www.sudokuwiki.org/Escargot)

Audit complete. Both complex fish detectors use two to four houses on each side and account for fins and overlapping houses. They reproduce both practice deductions and reject near-miss removals. They are available to hints and custom solver profiles. [Detector](crates/engine/src/patterns/complex_fish.rs) · [HoDoKu practice sources](https://hodoku.sourceforge.net/libraries/reglib-1.3.txt)

[Tdoku benchmark sets](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md#benchmarked-data-sets) · [HoDoKu complex fish](https://hodoku.sourceforge.net/en/tech_fishc.php) · [Inkala’s 2012 grid](https://www.sudokuwiki.org/Arto_Inkala_Sudoku)

## 7. Compare solve paths

Each rating describes a path under one solver configuration. The solution panel marks unfinished positions with at most one distinct move from the enabled Easy techniques. [Path analysis](crates/engine/src/logical/paths.rs)

- [x] Count the easy moves at each step. Highlight positions with few or no easy moves.
- [x] Compare the same puzzle with and without a selected technique. Include the versioned score for each completed path.
- [x] Search for an alternate path that avoids the selected technique within a fixed budget. If the budget runs out first, report that the result is inconclusive.

Audit complete. The default starter path begins with 16 distinct Easy moves and flags its last unfinished position with one. On an ordered profile without Alternating Inference Chain, the Unique Rectangle Type 1 practice grid stalls along the first path. The alternate search finds a complete 18-step path after expanding 22 positions and the test verifies every proof during replay. [Native regression](crates/engine/tests/engine_contract.rs) · [Wasm regressions](tests/engine-wasm.mts)

[Research on Sudoku difficulty](https://arxiv.org/abs/1403.7373)

## 8. Add variety to generation and practice

The built-in pool has fourteen templates with exactly 17 clues and three expert grids with more clues. The pool regression verifies that each has a different canonical grid. [Built-in pool](crates/engine/src/generation/templates.rs) · [Canonical grid](crates/engine/src/generation/canonical.rs)

- [x] Add verified templates that represent different puzzles after accounting for grid symmetries and digit renaming.
- [x] Measure generation match rates and distinct puzzles by clue count and score range. Start with 17 through 20 clues.
- [x] Add several distinct practice positions per technique. Include more than one pattern layout and make sure that each expected move has a valid proof.

The release benchmark sampled 20 seeds per cell in the table with up to 208 attempts per seed. Each group returned 20 matches and 20 raw grids. The table counts grids after identifying symmetry and digit-renaming equivalents. [Generation benchmark](crates/engine/benches/engine.rs)

| Givens | 0–800 points | 801–1,000 points | 1,001–1,600 points | 1,601–8,000 points |
| ---: | ---: | ---: | ---: | ---: |
| 17 | 4 | 4 | 2 | 6 |
| 18 | 20 | 19 | 19 | 19 |
| 19 | 20 | 20 | 20 | 20 |
| 20 | 20 | 20 | 20 | 20 |

Audit complete. The practice catalog has 177 grids across 59 techniques. The regression checks three independent givens grids and at least two layouts per technique. It verifies each expected deduction against the unique solution and replays the technique-specific proof with the stored candidate removals. [Practice grids](crates/engine/src/practice/examples.rs) · [Native regression](crates/engine/tests/engine_contract.rs) · [Wasm regression](tests/engine-wasm.mts)

## 9. Model puzzles as sets of rules

Start with single 9×9 grids. A constraint is a rule that limits which digits can appear in specified cells. A house is a set of cells that contains each digit exactly once. Today the exact solver and proof model assume three houses per cell. [Exact solver](crates/engine/src/lib.rs) · [Proof model](crates/engine/src/hints.rs)

- [ ] Define a versioned puzzle format for givens, regions, and constraints. Use stable rule IDs and typed parameters. Treat variant names as presets that combine these rules.
- [ ] Keep the 81-character format for classic puzzles. Round-trip full variant puzzles and positions through Rust, Wasm, and batch commands. Reject unknown or unsupported rules explicitly.
- [ ] Derive house membership, intersections, and pairs of cells that cannot share a digit from the rules. Allow both replacement regions and extra houses. Keep other relationships, such as sums or ratios, separate from houses.
- [ ] Validate cell references, region coverage, path lengths, clue parameters, and allowed overlaps before search.
- [ ] Make candidate calculation, conflict checking, exact solving, and solution counting use the same rules. Distinguish an invalid definition, a direct conflict, no solution, multiple solutions, and a search limit.
- [ ] Keep puzzle rules separate from the techniques that explain deductions. Enforce all active rules even when the solver profile disables a technique.

## 10. Support X Sudoku, Jigsaw, and Killer

- [ ] Add X Sudoku with both main diagonals as extra houses. Allow either diagonal on its own in mixed puzzles.
- [ ] Add Jigsaw with nine connected regions of nine cells each. Make sure that each cell belongs to exactly one region. Use these regions in place of the standard boxes.
- [ ] Add Killer cages with a target sum and no repeated digits. Validate feasible totals. Allow cells outside cages in mixed puzzles and enforce full coverage only when the preset requires it.
- [ ] Explain Killer deductions from possible cage sums and the digits that can occupy each cage cell. Use the sum of a complete house to explain deductions in cages that cross its boundary.
- [ ] Test all three variants through validation, candidates, exact solving, ranked hints, trace replay, ratings, practice, and generation. Include a mixed Jigsaw and Killer puzzle.

[World Sudoku Championship rules and examples](https://wspc2023.com/downloads/16thWorldSudokuChampionship-InstructionBooklet-v1.pdf) · [WPF Diagonal Irregular example](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2023/2023_SudokuRound3_IB.pdf)

## 11. Add common rule families

Build rule families that work on their own and in combinations. Store the rule and its parameters explicitly when a puzzle uses a variation.

See [Sudoku variant research](SUDOKU_VARIANT_RESEARCH.md) for additional rules, published examples, and choices to consider when defining the puzzle format.

- [ ] Add extra houses for Windoku and Disjoint Groups. Add odd and even cell restrictions and groups of cells with matching digits for Clone Sudoku.
- [ ] Add Anti-Knight, Anti-King, and orthogonal Non-Consecutive rules. Test their combination for Miracle Sudoku.
- [ ] Add relationships between marked cells. Cover inequalities, consecutive and double-ratio Kropki dots, and XV sums of 5 and 10. An unmarked pair can exclude a relationship only when the puzzle declares that rule. Apply that setting separately for each marker type.
- [ ] Add Thermo and Arrow. Digits strictly increase from the Thermo bulb to its tip. The digits on an Arrow path sum to the number in its circle.
- [ ] Add Renban, Whispers, Palindrome, Between, and Region Sum lines. Store the ordered cells, the minimum difference for Whispers, and the regions that divide a Region Sum line.
- [ ] Add outside clues for Sandwich, Little Killer, X-Sums, and Skyscrapers. Store each clue’s direction and ordered cells. Allow repeats on Little Killer paths where the other rules permit them.
- [ ] Plan separate support for smaller and larger grids and for overlapping grids such as Samurai. For fog puzzles, track visible constraints separately. Use only visible information to explain player hints.

[World Sudoku Championship variants](https://wspc2023.com/downloads/16thWorldSudokuChampionship-InstructionBooklet-v1.pdf) · [Sudoku U constraint reference](https://www.sudoku-u.org/constraints) · [WPF X-Sums examples](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound4_IB.pdf)

## 12. Explain and rate variant deductions

- [ ] Review which classic techniques still apply under each rule set. Enable a technique only when its proof assumptions hold. For deductions that rely on swapping digits in a unique puzzle, prove that the swap respects every active rule.
- [ ] Add stable IDs and replayable evidence for variant techniques. Name the constraints, cells, and candidates that prove each move. Keep exact-search shortcuts out of logical traces and hint choices.
- [ ] Use the same ranked hint and practice APIs for variants. Include several distinct practice positions for each new technique. Test that proofs still hold when rules overlap.
- [ ] Record the rule set, solver order, and scoring version with each rating. Calibrate variant technique costs against sample puzzles. Mark ratings as partial when the selected logical techniques stall.

## 13. Generate and verify variant puzzles

- [ ] Generate from solved grids that satisfy the selected rules. Build variant clues from those solutions and verify uniqueness under the final rule set.
- [ ] Target given counts and variant clue counts separately. Allow targets for cage sizes, score, difficulty, and opening techniques where the rules support them.
- [ ] Offer a target that requires a selected rule family for uniqueness. Test it by removing that family and counting solutions again.
- [ ] Make seeded generation repeatable, bounded, and cancellable. Record the seed and rule set with each result.
- [ ] Deduplicate by transforming givens and constraints together. Use only transformations that preserve the active rules, including sums, ratios, and directions.
- [ ] Test known solutions, direct conflicts, impossible puzzles, and multiple solutions for every rule family. Use an independent solver or small exhaustive fixtures to test deduction soundness.
- [ ] Benchmark classic, single-rule, and mixed puzzles in native Rust and Wasm. Measure rating and hint latency, generation match rates, and Wasm size.
