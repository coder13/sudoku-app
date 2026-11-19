# Odd/Even New Puzzle integration

Base: main `530aeca`, with reviewed Non-Consecutive shipping source `a3f6f6d`. Release is pending. Odd/Even already has complete import, marker rendering, combined-rule play, candidates, hints/Finder, exact and human solutions, Learn/practice and persistence. This change adds checked Easy/Medium New Puzzle and next-puzzle access. Rust, lockfiles, rule meanings, technique costs and scoring version 8 remain unchanged.

## Rules and sources

An odd circle permits 1, 3, 5, 7 or 9. An even square permits 2, 4, 6 or 8. Unmarked cells permit either parity, subject to ordinary Sudoku and any other declared rules. Generated puzzles use only their printed parity markers; existing mixed sources retain every companion and original marker value.

The complete published control remains Thomas Snyder's [Big Eight](https://www.gmpuzzles.com/blog/2023/03/even-odd-sudoku-by-thomas-snyder-2/), with all sixteen givens, thirteen odd circles, ten even squares, printed solution and original PDF URLs in `parity-big-eight.json`. Existing original Coach demonstrations and mixed-rule controls remain intact. The second generator pattern reuses all twenty-three marker positions, then derives new odd/even values from each sampled completion. It is not a transcription of that published puzzle. The balanced twenty-seven-cell pattern is authored geometry, marking cells where row plus column is divisible by three.

## Generation and proof checks

The native generator samples a completed grid from a blank template and derives the selected markers from that grid. Easy targets at most thirty givens; Medium targets 20–30. A typed optional `markedCells` recipe field passes the positions to the existing native parity-derived-clue API. No new native generator or fixed solved-grid bank is introduced. The app uses one fresh request with one attempt and 20,000-node exact-check bounds, then checked recipe fallbacks and played-puzzle exclusions.

One-attempt seeds 1–100 accept 98 distinct Easy and 32 Medium results for the balanced pattern, and 98/28 for source geometry. Every accepted result is independently unique, completion-correct, has multiple solutions without parity and has a complete requested-level path using parity. A twenty-seed 41-marker control yields twenty Easy/one Medium, while the 81-marker control yields twenty Easy/no Medium; these finite samples do not prove Medium impossible. The recipe bank selects fifteen checked seeds per pattern at each level, thirty recipes per level. Selection also excludes repeated givens across the two geometries; the shared all-variant regression caught nine repeated Easy boards in the first selection, which were replaced with already checked distinct seeds.

Actual app contracts verify every checked recipe and thirty successive distinct puzzles per difficulty while excluding prior results. Every result has several sound hints, independently unique and parity-dependent givens, correct numeric marker values and a complete app-order replay. Each parity proof independently checks its cited marker, explicit candidate domain and every resulting action without a uniqueness premise. Original practice examples use the same independent proof helper. Every other action agrees with the independently found completion. Generation's advertised points, counts, hardest technique and difficulty agree with the full app order; its declared technique list is capped at the requested level.

Additional contracts verify repeat determinism, a known fresh miss/fallback, all eight square transforms, mixed aliases, reordered rule and marker-cell lists, generated save/reload, undo/redo, solution help and shared import. The source geometry test checks that all twenty-three original marker positions are retained. The parity technique remains 6 points, Easy, without a uniqueness premise; required-family uniqueness is a separate generation condition.

## App and performance checks

Local verification passes 638 app tests and 450 Wasm contracts, strict app/new-contract/benchmark types and the 123-component catalog. Production prerenders 171 routes and passes all three offline checks. Light/dark reference cards at 290/540px use the actual shared marker SVG and its CSS; inspection led to stronger preview-only outlines/fills. This is static/component verification, not a browser layout, paint or interaction audit.

Controlled measurements use Darwin arm64, Node v26.13.0 and the unchanged 3,416,046-byte engine, SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`. Each operation has five warmups and forty timed samples, with independent assertions outside timing and no owned compiler, suite or other benchmark alongside. The in-process worker adapter excludes worker startup/transfers and browser rendering. These observations are not a general speedup claim or an exhaustive all-technique hint scan.

| Actual caller | Median ms | p95 ms |
| --- | ---: | ---: |
| Complete published import preview | 0.295 | 0.505 |
| Published candidates | 0.014 | 0.016 |
| Published ordinary hints | 0.150 | 0.210 |
| Published app-order rating | 0.178 | 0.250 |
| Published exact solution | 0.023 | 0.025 |
| Published human walkthrough | 1.145 | 1.596 |
| Easy New Puzzle | 0.542 | 0.603 |
| Medium New Puzzle | 3.195 | 3.929 |
| Medium known fresh miss and checked fallback | 2.986 | 3.130 |

The 45 timed/warmup generation requests have empty played history: Easy gives 45 distinct boards and Medium 27, because fallback results may repeat without exclusions. Separate contracts with actual played history verify thirty successive distinct puzzles per level. Deterministic fallback is intentional; the app must pass its saved games to exclude repeats.

All 405 preceding recipe requests remain identical. All 160 paired complete native responses match: 140 successes and twenty `search-limit` results, with transport IDs excluded. The comparison covers twenty fresh seeds per retained Sandwich, Little Killer, X-Sums, Skyscrapers, Anti-King Easy/Medium and Non-Consecutive Easy/Medium request. Budget-limited outcomes are retained rather than counted as generated puzzles.

Fourteen complete controls retain identical input positions and Board SSR strings, including parity and all preceding release families. Ten warmups and forty alternating paired samples put input medians at 0.014–0.210 ms before / 0.014–0.211 after, and SSR at 0.771–1.302 / 0.772–1.299 ms. Individual tails vary; these measurements provide compatibility evidence without establishing an input/render speedup. SSR does not measure browser paint.

## Package and release status

The UI-only change borrows the previously verified Darwin Wasm artifact for local app validation; CI will rebuild all engine profiles and native contracts. Rust, Cargo/package lockfiles, Wasm and all five generated JSON metadata files are byte-identical to the preceding release. Final per-file asset totals, using default Node gzip and the preceding `a3f6f6d` production build as baseline, are JavaScript 6,297,119 raw / 2,075,648 gzip bytes (+7,188 / +416), CSS 302,155 / 41,836 (+87 / +14) and Wasm 3,416,046 / 893,636 (unchanged). These sums cover client asset files and exclude HTML/cache manifests. Exact-head CI/deployment/release are pending.

The original dirty R&D worktree is untouched. Ten other older New Puzzle families remain after this integration ships; [189](https://github.com/coder13/sudoku-app/issues/189) keeps its checklist open until release. Remaining authored source formats stay in [7](https://github.com/coder13/sudoku-app/issues/7).
