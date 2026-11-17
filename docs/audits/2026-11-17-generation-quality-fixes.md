# Generation quality fixes and follow-up audit

Date: November 17, 2026. Audited generation source: [`1de0f9721dc1d3e8abb2109a8601a4dfff6194a4`](https://github.com/coder13/sudoku-app/commit/1de0f9721dc1d3e8abb2109a8601a4dfff6194a4). PR #27. Classic scoring version 11; generation quality-policy version 2.

The follow-up contains **599 puzzles per level, 5,990 total**, using the same seed schedule as the [original audit](2026-11-17-puzzle-quality.md). All have exactly one solution. All **412,433 deductions** replay correctly and agree with those solutions. The two extra lower-tier orders found **zero lower-tier solves**, compared with 15 before. No equivalent structure in this sample supplies a lower-tier counterexample either.

## What changed

- Every difficulty-targeted generator checks three lower-tier orders: canonical, reversed within each tier, and rotated within each tier. Identical orders are checked once. Fresh generation, templates, and Auto use the same acceptance rules.
- Medium and above require four productive non-single deductions. Medium additionally needs two technique types and two stretches of eliminations separated by a placement. These are internal floors, not a workload option or a way to promote a puzzle's grade.
- Tricky and Very Hard make a bounded attempt to include a seed-selected technique before the broad search. Auto can use the player's technique progress for that focus.
- Saved classic games exclude equivalent structures, including digit changes, transposition, and valid row, column, band, and stack permutations.
- Impossible draws from **768 distinct certified structures**, preserves their clue counts, removes saved structures before searching, and verifies every transformed candidate again.

The known 15 rating leaks and three different kinds of thin Medium solve are permanent regression fixtures. Existing saved ratings remain unchanged.

## Before and after

Counts describe a recorded solve path. They do not measure enjoyment or define the difficulty level.

| Level | Median non-single deductions | Lower-tier solves found | Distinct structures in 599 draws |
| --- | ---: | ---: | ---: |
| Beginner | 0 → 0 | 0 → 0 | 599 → 599 |
| Easy | 0 → 0 | 0 → 0 | 599 → 599 |
| Medium | 3 → 5 | 0 → 0 | 599 → 599 |
| Tricky | 4 → 6 | 0 → 0 | 599 → 599 |
| Hard | 6 → 7 | 2 → 0 | 599 → 599 |
| Very Hard | 9 → 10 | 8 → 0 | 599 → 599 |
| Expert | 15 → 15 | 0 → 0 | 599 → 599 |
| Master | 23 → 23 | 0 → 0 | 599 → 599 |
| Extreme | 29 → 29 | 5 → 0 | 580 → 580 |
| Impossible | 57 → 55 | 0 → 0 | 6 → 422 |

All levels yielded 599 successful puzzles. Extreme needed 601 calls, as in the first audit; both exhausted calls remain in the evidence. Every other level needed 599 calls. Exhaustion never returned an easier puzzle with a harder label.

### Medium

The median increased from three to five non-single deductions. All 599 now have at least four deductions, two technique types, and two separate elimination stretches. The median uses three technique types. The 213 paths with exactly two non-single deductions, including the 43 clearest thin-finish examples, are gone from the new sample.

Long singles finishes remain common: **564/599 (94.2%)** finish with at least 30 singles, compared with **522/599 (87.1%)** before. The stronger middle does not guarantee that deductions are evenly spread throughout a solve. This remains a useful playtest question; the generator does not pad the solve or reject every satisfying singles finish.

### Technique variety

The bounded focus helps, but it does not equalize the modes:

| Technique | Before | After |
| --- | ---: | ---: |
| Tricky: Skyscraper | 536/599 | 512/599 |
| Tricky: Two-String Kite | 53/599 | 90/599 |
| Tricky: Swordfish | 14/599 | 22/599 |
| Very Hard: 3D Medusa | 458/599 | 450/599 |
| Very Hard: XY-Chain | 163/599 | 226/599 |
| Very Hard: WXYZ-Wing | 49/599 | 71/599 |
| Very Hard: X-Chain | 10/599 | 30/599 |

A puzzle can contain several of these techniques. Skyscraper still appears in 85.5% of Tricky paths and Medusa in 75.1% of Very Hard paths. Expert still uses AIC in every sampled canonical path. These are remaining distribution limits, not claims that those puzzles are invalid.

Master retains its previous median of 23 non-single deductions, 599 distinct structures, and ten observed top-tier technique types. No forcing proof appears in its sampled paths.

### Impossible

The original 599 draws represented six structures, with one family appearing 263 times. The new draws represent **422 structures**, with the largest family appearing **five times**. This audit deliberately starts every draw with empty player history so it can be compared with the original audit. Repeats in this stateless sample are expected from a finite bank; normal play excludes structures in saved history.

Browser tests cover equivalent-grid rejection on all classic search routes, repeated seeds with saved history, and the case where **767 of the 768 bank structures are already saved**. That last case returns the one remaining structure.

The new paths also use a wider set of top-tier methods: Nested Forcing Net appears in 584 paths, Quintuple Pattern Overlay in 177, and Quadruple Pattern Overlay in 109. Counts overlap. All 599 searches matched their first bank candidate after runtime checks.

The bank was selected from 772 distinct accepted candidates among 1,152 checked source grids. Sixteen timed-out checks were excluded. Source attribution, license, the bank hash, and rebuild instructions are in [`crates/engine/data/README.md`](../../crates/engine/data/README.md). Distinct under Sudoku symmetries does not necessarily mean an unrelated construction or a different solving theme.

## Validation and limits

- Independent Python solution counting: 5,990 unique grids; no inconclusive checks.
- Independent replay: 412,433 deductions, including 91,950 non-single deductions; no conflicts with the unique solutions.
- Additional lower-tier solves: 10,782 attempts; none completed.
- Native/browser parity: 21 selected cases across all ten modes and a pool fallback matched exactly, including their ratings.
- Rust: 146 library tests plus three generation regression/bank checks passed.
- Browser engine: 109 tests passed. The saved-history test was rerun successfully with the nearly exhausted bank case.
- After integrating the collections PR: 239 TypeScript tests, type checking, and the full production/offline build passed. All 160 collection puzzles were rerated with the full canonical order and verified against their stored ratings. The app retains their original givens and source credits.

The alternate-order checks are now part of acceptance, so zero findings confirms the intended contract. It does not prove that no other easier deduction sequence or unimplemented human technique exists. These are automated quality checks, not human playtest ratings. The bank remains finite, and deleting saved games removes their duplicate protection.

The raw evidence includes native generation times. Those times were collected alongside other verification jobs and are not a controlled before/after speed benchmark or a mobile timing estimate. More thorough checks and harder source puzzles cost computation.

## Reproduce

```sh
cargo build --release -p sudoku-app-engine --features wasm-api --example quality_audit --example quality_recheck
python3 scripts/audit-puzzle-quality.py --count 599 --jobs 6 --output audit-after
python3 scripts/recheck-puzzle-quality.py audit-after --jobs 6
python3 scripts/summarize-puzzle-quality.py audit-after --quality-version 2 --verify
node --experimental-strip-types scripts/check-quality-audit-parity.mts audit-after
```

The per-puzzle CSV and raw-data archive retain the grids, canonical keys, seeds, deductions, solution checks, alternate-order results, failures, and bank certification evidence. The original audit remains unchanged.
