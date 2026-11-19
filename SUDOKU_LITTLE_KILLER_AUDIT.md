# Little Killer app integration

Base: main `bf0aac4`. The existing engine already supports full diagonal sums, exact solving, proofs, teaching, rating and generation. This change integrates those rules with the app. Native Rust, lockfiles and generated app Wasm/metadata are unchanged.

## Source controls

Every Little Killer arrow identifies a complete diagonal ray from one grid edge to another. Its digits sum to the outside total. Digits may repeat on that ray when the other Sudoku rules permit them. It is not a Killer cage and does not add an independent all-different condition. Singleton diagonals are valid; direction still determines where their printed arrows belong.

| Full published control | Givens / diagonals / companions | Independent completion | Existing human coverage |
| --- | --- | --- | --- |
| Bill Murphy, [New Body Rhumba](https://www.gmpuzzles.com/blog/2025/06/little-killer-sudoku-by-bill-murphy/), 2025-06-23 | 8 / 12 / none | Unique, printed completion | Stalled at 958 points; eight opening hints |
| Philip Newman, [Triforce](https://www.gmpuzzles.com/blog/2025/07/little-killer-sudoku-by-philip-newman/), 2025-07-24 | 9 / 12 / none | Unique, printed completion | Stalled at 558 points; eight opening hints |
| Mr.Menace, [Renban ModE](https://www.gmpuzzles.com/blog/2025/09/renban-little-killer-sudoku-by-mr-menace/), 2025-09-05 republication of a 2021 puzzle | 0 / 4 / fourteen complete Renban lines | Unique, printed completion, 88,809 independent search nodes | No opening human hint; zero-step stalled path |

Fixtures retain original grid/solution PDF URLs and their SHA-256 hashes, all printed givens, ordered diagonal cells, directions, totals and printed completions. Original PDFs were rendered and checked. Triforce retains both printed directions of its long diagonals, including all four corner clues. Renban ModE retains every one of its fourteen lines; no companion clue is removed to simplify import or solving.

The independent oracle uses direct digit sets, integer sums and Sudoku houses. It allows repeated diagonal digits except where an actual shared house forbids them. The initial 200,000-node Renban ModE audit exhausted after about 264 seconds. A search-order tie break using clue involvement then proves the unique printed completion in 88,809 nodes, about 45 seconds in the separate research run. This changes the test oracle's branching order, not its mathematical constraints or production engine behavior. Existing puzzles without Little Killer keep the prior branching order.

Two additional controls are explicitly authored regression companions: Murphy plus a Renban line and Sandwich total, and the repository Jigsaw/Killer benchmark plus four Sandwich totals and four Little Killer diagonals. Their completions are independently checked. These added clues are not attributed to the original publishers.

## Import boundary

Native rule acceptance requires integer totals between the diagonal's cell count and nine times that count, a diagonal direction, and the exact ordered edge-to-edge ray. It rejects incomplete, reversed-without-direction, malformed and unknown-parameter rules. Native and app transformations preserve singleton direction, all four diagonals, opposite clues, regions and companions.

The inspected official Coach compiler, `https://sudoku.coach/js/jCfXtZs-1776367508519.js`, SHA-256 `567c7f9023cfff3a7f8feb4f8393d3b10a1f85f9539ef48f31c577b105ad521f`, stores Little Killer segments as `cells: [[x,y]]` at an outside grid coordinate with `{positive, value}` parameters. Positive selects the northeast/southwest diagonal; false selects southeast/northwest. The app chooses the inward direction and walks the complete ray. Non-default semantic settings, interior starts, missed-grid arrows and cosmetic zero clues fail explicitly.

Typed Coach test exports are constructed from the checked PDF/native definitions using that official schema. They are converted controls, not original publisher Coach exports. They cover every diagonal direction and corner, the complete Renban combination, and preservation of all companions. Coach short-link resolution and further authored/export formats remain in issue 7.

Preserved negative Coach controls:

- [DLeM, Symmetrical Inside](https://sudoku.coach/en/s/DLeM) explicitly says its Little Killer arrows are cosmetic. Its real rule puts printed digit lists among the first three indicated cells. The full code, cosmetic text and metadata remain intact and rejected; zero arrows do not become ordinary sum constraints.
- [GJBz, Little killer and between lines part 3](https://sudoku.coach/en/s/GJBz) is a 6×6 puzzle with a 36-digit solution. It is not a 9×9 positive control and remains explicitly unsupported by the present engine/app grid size.

## App behavior and independent contracts

The shared outside-clue layer now draws all labels and arrows in the exact inner-cell viewport used by candidate links, including the two-pixel grid border inset. Shared CSS keeps those viewports aligned; labels overflow into separately reserved gutters. It reserves corner space and moves repeated anchors outward along their actual rays, including mixed Sandwich/Little Killer labels. Glyph bounds fit inside the computed gutters. Arrow lines intersect their declared first cell in the declared direction under all eight square transforms. Coordinate guides remain outside the clues. Teaching crops expand so complete constrained rays remain visible; ordinary candidate grids and link coordinates retain their local frame.

Local input checks subtract placed digits and bound the remaining sum using digits 1–9. They impose no additional diagonal distinctness. Both Pencil modes and bulk input obey those sum restrictions, while actual house peers enforce repetition rules. Undo/redo restores prior state. Independent tests enumerate every three-cell partial state and all totals 3–27 and compare the possible assignments directly; separate counterexamples verify legal distant repeats and ordinary shared-house conflicts.

Full sources, mixed rules, Jigsaw borders, cages, zero Sandwich totals, all corners, repeated clues, candidate buttons and advanced links are exercised through desktop/mobile SSR. Actual clue SVGs were checked at 290px and 540px in light/dark themes, including crowded candidates. This is static visual and component-contract validation; it does not claim live browser pointer/keyboard testing.

Actual worker callers verify candidates, several ordinary hints where available, selected Little Killer proofs, Finder counts, retained collections, exact completions, disabled technique profiles, explicit removals, action replay, honest partial walkthroughs, storage reload/history, sharing, Learn and all three practice examples plus a fresh drill. Independent proof replay computes integer totals from the cited candidate lists and verifies each proposed placement/removal. House-only proof masks stay separate from local automatic input cleanup.

The native technique remains 50 points, Medium. Human coverage is not replaced by the exact solution. The two GAS controls keep their partial paths; Renban ModE keeps zero hints and its zero-step stalled path. Default-budget exact solving/import verifies Renban ModE's printed unique completion, while an explicit 20,000-node request returns search-limit. Further human coverage and exact-search latency need engine work.

## New Puzzle

Little Killer is offered with Medium, using three bounded recipes from the two published fixed diagonal layouts/completions. Native calibration verifies twenty of twenty one-attempt Medium candidates per source within 20,000 nodes. Each has thirty givens, a complete Medium path using Little Killer, independent uniqueness and multiple solutions after removing Little Killer. Each source contributes twenty distinct grids.

The actual app New Puzzle caller checks twenty distinct independently unique/Little Killer-dependent Medium puzzles, deterministic repeats, mixed aliases, reordered rules and played-puzzle exclusions under square symmetries. These are fresh clue-removal puzzles from fixed layouts, not arbitrary new diagonal-pattern construction.

## Validation and performance

Final local validation passes 604 app tests, 388 Wasm contracts, strict application/new-contract TypeScript and the 123-component catalog. The production build prerenders all 171 routes. Three actual-build offline contracts check every shell, precached asset and the packaged Wasm. The viewport alignment correction is covered by thirteen focused component checks and the final full app suite. All five generated JSON files and the app Wasm are byte-identical to pinned main. The production build uses that previously verified compiled artifact; no native Rust source changes are needed. Exact-head CI/deployment and merge remain pending.

### Controlled runtime samples

Darwin arm64, Node 26.13.0, app Wasm SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`, 3,416,046 raw / 893,636 gzip bytes. Values are median/p95 milliseconds. No owned local compiler, suite or second runtime benchmark ran alongside the timed requests. Fast operations use five warmups/twenty samples; slow requests use two/five. Renban ModE exact solve, uniqueness and import preview use one warmup/three samples. p95 of three or five is the maximum. Serialization and app conversion are included; the in-process worker excludes startup, transfer, browser layout and paint. Grid SSR was resampled after the border-inset correction with the same five/twenty method; other request/input code is unchanged.

| Operation | Newman | Murphy | Authored mixed | Full Renban ModE |
| --- | --- | --- | --- | --- |
| raw candidates | 0.058 / 0.075 | 0.024 / 0.026 | 0.048 / 0.050 | 0.030 / 0.045 |
| raw analyze | 0.426 / 0.443 | 0.345 / 0.352 | 0.334 / 0.374 | 6865.735 / 6899.719 |
| raw solve | 0.425 / 0.439 | 0.249 / 0.252 | 0.317 / 0.321 | 6042.332 / 6257.504 |
| raw native-rate | 0.270 / 0.306 | 0.175 / 0.187 | 0.273 / 0.284 | 0.073 / 0.108 |
| raw app-rate | 208.434 / 211.782 | 91.252 / 91.730 | 119.232 / 120.162 | 30.839 / 31.403 |
| raw ten-hints | 16.285 / 16.777 | 26.789 / 27.181 | 26.765 / 27.275 | 61.470 / 62.425 |
| raw exhaustive | 16.325 / 16.534 | 26.812 / 27.255 | 26.554 / 27.063 | 61.011 / 62.001 |
| preview including rating | 209.027 / 209.216 | 91.376 / 94.793 | 121.981 / 122.773 | 12960.323 / 13138.836 |
| play candidates | 0.050 / 0.057 | 0.027 / 0.037 | 0.053 / 0.057 | 0.035 / 0.046 |
| ordinary app hints | 16.503 / 17.143 | 26.440 / 27.237 | 27.034 / 27.288 | 61.496 / 75.172 |
| solution walkthrough | 208.985 / 212.886 | 90.680 / 90.926 | 120.385 / 121.670 | 30.820 / 31.240 |
| input with all candidates | 0.081 / 0.103 | 0.121 / 0.142 | 0.090 / 0.100 | 0.082 / 0.218 |
| Board SSR | 1.812 / 2.323 | 0.965 / 1.228 | 0.934 / 1.126 | 0.891 / 1.047 |

Ordinary hints and exhaustive raw hints expose eight/eight/eight/zero choices. Raw hint requests use Medium; actual app hints use the imported grade. Human ratings remain partial at 558/958/2,352/0 points, scoring version 8. Retained raw-instance Wasm memory is 3,604,480 bytes after each case; these are capacity snapshots, not peaks. The full Renban ModE preview verifies uniqueness and then solves separately, explaining its roughly thirteen-second latency. All slow samples and zero-hint states are retained; [192](https://github.com/coder13/sudoku-app/issues/192) tracks performance and [202](https://github.com/coder13/sudoku-app/issues/202) tracks explicit joint Renban/sum proofs.

Fixed-template generation succeeds for twenty of twenty distinct, independently unique/Little Killer-dependent puzzles at 3.143/3.535 ms, with six attempts and 20,000 nodes per exact check. Actual Medium New Puzzle generation measures 3.172/3.207 ms. Independent assertions and repeat checks are outside the timed interval.

### Existing-family and package checks

An alternating paired run checks Between, Region Sum, Clone, Sandwich, Classic, Killer and Diagonal controls against the preceding shipping app. Each operation has ten warmups and forty samples. Input positions match exactly. Median input changes range from -0.0006 to +0.0061 ms; Sandwich changes 0.0809 to 0.0870 ms. SSR medians vary within about 0.009 ms. Tail regressions remain visible: Between SSR p95 changes 1.223 to 2.218 ms and Killer 1.332 to 1.621 ms. These measurements do not establish a general speedup. Full paired data is retained in the session's `paired-app.json`; production native code and Wasm are unchanged.

Summed production `dist/client/assets` files, per-file Node gzip at its default level, change JS from 6,263,040 / 2,069,934 to 6,269,903 / 2,071,696 raw/gzip bytes (+6,863 / +1,762). CSS changes from 301,232 / 41,633 to 301,338 / 41,666 (+106 / +33). Wasm changes by zero bytes. HTML/service-worker files are excluded from this asset-only comparison.
