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

Final local validation passes 604 app tests, 388 Wasm contracts, strict application/new-contract TypeScript and the 123-component catalog. The production build prerenders all 171 routes. Three actual-build offline contracts check every shell, precached asset and the packaged Wasm. The viewport alignment correction is covered by thirteen focused component checks and the final full app suite. All five generated JSON files and the app Wasm are byte-identical to pinned main. The production build uses that previously verified compiled artifact; no native Rust source changes are needed. All exact-head native, feature, profile, app/Wasm, strict documentation, types/catalog and deployment checks pass in [CI 44481555013](https://github.com/coder13/sudoku-app/actions/runs/44481555013) on `975a44c`. [PR 203](https://github.com/coder13/sudoku-app/pull/203) reached main at `e85d79c`; fetched main contains both the reviewed head and merge, with identical shipping sources. The published lesson returns two outside labels and two arrows. Its Linux-built Wasm is byte-identical to the preceding deployed release; cross-host byte equality with the local Darwin build is not claimed. The implementation worktree remains pinned to the reviewed head.

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

## Short Renban support and exact import

The Renban ModE fixture retains zero givens, fourteen Renban lines, and four Little Killer sums. Its SHA-256 is recorded with the [measurement data](docs/measurements/renban-exact.json). The independent digit-array counter found the published solution and proved uniqueness in 88,809 of 200,000 nodes. The full fixture remains in [little-killer-menace.json](tests/fixtures/little-killer-menace.json).

The release Wasm CPU profile at main `3429f0b` sampled four exact requests. Of 72,802 exclusive samples, 25,715 were in the digit-set matcher and 17,594 were in line support. Sum support and its wide-shift helper accounted for 19,652 samples. The import caller sends separate uniqueness and solve requests before it rates the puzzle. [Issue #192](https://github.com/coder13/sudoku-app/issues/192)

A two-cell Renban uses the other cell's mask shifted by one digit in each direction. A three-cell Renban checks all six ascending cell orders. For each order, shifts align the masks with the smallest digit. The intersection finds every valid minimum. Reverse shifts give the supported digits for each cell. Longer lines use the interval matcher. The independent tuple tests cover every pair of two-cell masks, every subset of each three-digit window, mixed windows, and impossible assignments.

### Paired release measurements

Both builds used Linux x86-64 on an AMD Ryzen 7 7840U with eight cores, 16 threads, and 60.6 GiB RAM. Rust 1.92.0 built the release profile with LTO. Node 22.23.1 ran the app Wasm. The baseline was `3414314` and the candidate was `7541b00`. Each build used its own Cargo cache and target directory.

Each Wasm case used one warmup and five samples per build. Build order alternated on logical CPUs 6 and 7. The p95 is the largest of the five samples. The import measurements include serialization and the app caller in a single Node process. Browser worker transfer, layout, and rendering are outside this measurement.

| Operation | Baseline median / p95 (ms) | Candidate median / p95 (ms) |
| --- | ---: | ---: |
| Wasm uniqueness, 1,000,000 nodes | 10,091.4 / 10,109.0 | 5,407.2 / 5,540.7 |
| Wasm solve, 1,000,000 nodes | 8,762.9 / 8,769.3 | 4,724.2 / 4,728.9 |
| Wasm import preview | 19,174.9 / 31,721.8 | 11,255.1 / 25,655.9 |
| Wasm uniqueness, 20,000 nodes | 279.1 / 285.4 | 155.7 / 160.0 |
| Wasm solve, 20,000 nodes | 264.6 / 282.6 | 145.5 / 174.8 |
| Native CLI uniqueness, 1,000,000 nodes | 5,589.2 / 5,971.6 | 2,697.3 / 3,400.7 |
| Native CLI solve, 1,000,000 nodes | 4,913.9 / 5,064.2 | 2,285.4 / 2,298.8 |

Native timings include a fresh CLI process for each sample. Both builds returned the published solution and verified uniqueness at the default budget. Both exhausted the 20,000-node searches. The import reports a stalled rating at zero points with scoring version 8. Five previews per build completed, with longer exact calls near the end of the series.

Three fresh Node processes per build had a median first uniqueness call of 10,037.9 ms and 5,481.0 ms. Median instantiation was 13.57 ms and 13.56 ms. Median process peak RSS was 105.2 MiB and 105.9 MiB. Both Wasm instances reached 1,572,864 bytes of linear-memory capacity in the paired run. The buffer size measures capacity. App Wasm gained 333 raw bytes and saved 1,075 gzip bytes. The native CLI gained 584 bytes.

Seven additional exact controls covered Renban, mixed rules, Jigsaw, and FzzD. Clover's Renban/Killer solve median fell from 0.203 ms to 0.128 ms. The FzzD solve median rose from 399.99 ms to 400.91 ms. The [measurement data](docs/measurements/renban-exact.json) includes all control summaries and the raw Renban ModE timing samples.

The generation controls returned 140 identical results from seven recipes and seeds 1–20. Each request allowed six attempts and 20,000 nodes. Each recipe returned twenty distinct puzzles. Independent counts include uniqueness and rule dependence for both Little Killer recipes. X-Sudoku generation had the largest slower tail, from 1.56 ms to 2.68 ms p95.

### Reproduction and validation

Build the app Wasm at each pinned commit with `npm run build:wasm`. Use a separate Cargo target directory for each build. Run these historical commands from PR 261's checked head `08ad5da`, which still uses the original separate import requests.

```sh
node --experimental-strip-types scripts/bench-renban-exact.mjs before.wasm after.wasm
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --renban --little-killer
cargo test --locked --release -p sudoku-app-engine --all-features
node --experimental-strip-types --test tests/little-killer-wasm.mts tests/renban-wasm.mts
```

The integrated comparison matched 5,178 full responses on 31 corpus positions and 363 practice positions. It covered all 121 detector IDs, every hint page, explicit removals, disabled techniques, and a sum off by one. The app request used the 116-ID order in the measurement data.

The initial candidate passed 381 native tests and doctests, 678 app tests, and 497 Wasm contracts. The native capability matrix, four Wasm profiles, and strict Rust docs also passed. The integrated candidate passed types and 28 of 29 focused Wasm tests. The failing Little Killer storage test also fails on the integrated baseline. Its Node window fixture lacks the location used by UUID sharing. [Reproduction on PR #254](https://github.com/coder13/sudoku-app/pull/254#issuecomment-7019829091)

## Reuse the uniqueness result during import

New 9 × 9 variant imports used to count solutions, find one solution again, then rate the puzzle. The count already records a completion. The import preview now requests the count and its verified solution together. The node budget and traversal match the existing uniqueness check. A count of zero, a conflict, multiple solutions, or an exhausted count returns its status alone. A separate Wasm test finds a first completion within five nodes and checks that the uniqueness request still returns a search limit at that budget.

The baseline `6d9ce33` and candidate `be6b938` used release app Wasm and Node 22.23.1 on an AMD Ryzen 7 7840U. Build order alternated on logical CPUs 6 and 7. Five samples followed one warmup per fixture. The p95 is the largest sample. Timings include the real preview caller and request serialization. The Wasm handler ran in process, so browser transfer, layout, and paint were outside the measured path.

| Preview | Baseline median / p95 | Candidate median / p95 |
| --- | ---: | ---: |
| Renban ModE | 10,514.6 / 10,926.0 ms | 5,604.9 / 5,620.4 ms |
| Coach Thermo Sandwich | 799.36 / 804.49 ms | 762.53 / 792.96 ms |
| X-Sums Murphy | 9.39 / 10.76 ms | 6.89 / 7.07 ms |
| Little Killer Murphy | 174.55 / 177.13 ms | 175.34 / 177.47 ms |
| Clover Renban/Killer | 1.14 / 1.43 ms | 1.12 / 2.47 ms |

The first Renban ModE previews took 10,556.7 and 5,601.1 ms in separately instantiated Wasm modules. The full preview comparison matched all 49 pairs across eight source fixtures. All eight saved-puzzle previews matched and made zero exact requests. Thirteen structured exact comparisons covered Classic, X-Sudoku, Killer, Jigsaw, mixed rules, entries, removals, and the 20,000-node Renban ModE limit. The published Renban ModE completion and its zero-step human path matched.

App Wasm grew by 1,819 raw bytes and 650 gzip bytes. Both Renban ModE instances reached a linear-memory capacity of 1,572,864 bytes. The shared Node process peak is recorded in the raw results. It includes both instances and cannot show each build's memory separately. [Measurement data and hashes](docs/measurements/variant-import-verify.json)

Build the app Wasm at both named commits in separate worktrees with independent Cargo targets. Install the pinned Node dependencies in each. Run from the candidate worktree and pass the original baseline worktree so each Wasm uses its own app preview caller.

```sh
taskset -c 6,7 timeout -s INT -k 5s 300s node --experimental-strip-types \
  scripts/bench-variant-import.mjs /path/to/baseline-worktree before.wasm after.wasm \
  > variant-import.jsonl
```

## Backward checks for supported sums

The engine first records the sums that each prefix of a line can reach. It then works backward from the allowed totals. For each candidate, it subtracts that digit from the totals and checks for a reachable prefix sum. A match shows that a prefix and suffix can support that candidate. This change replaces the loop over pairs of prefix and suffix sums.

The same sum check serves Little Killer, Region Sum, arrows, and Killer cage outies. The check still permits repeated digits where the puzzle's other rules allow them.

The baseline profile of three default-budget uniqueness requests recorded 17,545 CPU samples. The sum check accounted for 4,500 exclusive samples and 2,231 direct calls to the wide-shift helper. The independent Rust test enumerates digit tuples and uses integer addition. It covers missing candidates, repeated digits, several allowed totals, and sums above 63.

### Paired release measurements

The baseline is `b9ffe95015c8a2e9c80157e48ca06640d175ade5`. The measured candidate is `c079efe6d01e4cbe599dbaee5df48794e7aabf41`. Both builds use the stripped app Wasm profile, Rust 1.92.0, and separate Cargo caches and target directories. Node 22.23.1 ran on logical CPUs 6 and 7 of an AMD Ryzen 7 7840U under Arch Linux 7.1.8.

Each Renban ModE case uses one warmup and five samples per build. The build order alternates. For five samples, p95 is the largest sample. The preview uses the same caller on both builds and includes request serialization. Both preview builds use the earlier caller that sends separate uniqueness and solve requests. Browser worker transfer, layout, and rendering are outside this measurement.

| Renban ModE operation | Baseline median / p95 (ms) | Candidate median / p95 (ms) |
| --- | ---: | ---: |
| Uniqueness, 1,000,000 nodes | 5,501.59 / 5,556.02 | 4,335.19 / 4,352.86 |
| Solve, 1,000,000 nodes | 4,818.17 / 4,844.18 | 3,794.10 / 3,810.63 |
| Import preview with two exact requests | 10,345.96 / 10,520.22 | 8,162.72 / 8,216.71 |
| Uniqueness, 20,000 nodes | 149.17 / 150.03 | 115.95 / 123.01 |
| Solve, 20,000 nodes | 146.28 / 146.79 | 114.78 / 115.81 |

Both builds verify the printed unique solution at the default budget. Both exhaust the 20,000-node searches. The preview keeps the zero-step, zero-point stalled rating.

In three fresh Node processes per build, median first uniqueness time falls from 5,543.89 to 4,215.83 ms. Median instantiation rises from 14.51 to 14.77 ms. Median process peak RSS rises from 108,112 to 109,264 KiB. Wasm linear-memory capacity is 1,441,792 bytes after the first uniqueness request in all six processes. App Wasm grows by 1,227 raw bytes and 476 gzip bytes.

FaxQ uniqueness at 1,000,000 nodes falls from 193.45 to 146.19 ms median. Both builds exhaust 20,000 nodes. Newman's Little Killer uniqueness median falls from 0.767 to 0.486 ms. The mixed Arrow fixture stays near 0.085 ms. The 8AGt app-order rating rises from 2,157.74 to 2,162.94 ms. The FzzD uniqueness p95 rises from 487.37 to 491.17 ms. The [measurement data](docs/measurements/variant-sum-support.json) records all controls and samples for the main fixture.

All 140 generation pairs match for seeds 1–20 across seven recipes. Each request allows six attempts and 20,000 nodes per exact check. Both builds produce twenty distinct puzzles per recipe. The Jigsaw Killer generation median rises from 3.529 to 3.612 ms. The Newman Little Killer recipe drops from 7.473 to 4.404 ms.

### Reproduction and validation

Build the app Wasm at the two measured commits. Use a separate Cargo target directory for each build. Run these commands from the measured candidate `c079efe` to replay the same preview caller.

```sh
node --experimental-strip-types scripts/bench-renban-exact.mjs before.wasm after.wasm
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --renban --little-killer --region-sum
cargo test --locked --release -p sudoku-app-engine --all-features candidate_support_matches_direct_sum_enumeration
```

The comparison matches 5,864 complete responses across 36 corpus positions and 363 practice positions. It checks all 121 detectors, every hint page, the mixed Arrow opening and all five Region Sum sources. It also checks explicit removals, disabled techniques, and a sum off by one. Full ratings, traces, and proof fields match.


## Renban and Little Killer release batch

Scoring version 11 adds seven explicit techniques to the app profile when the puzzle contains the relevant rules. Ordinary hints, Technique Finder, replay, Learn, and practice use the same evidence. The scoped order reuses seven previously reviewed proof types. The engine's native default order still provides the earlier paths, and the unscoped app order matches the earlier proof lists and resulting positions on the paired controls.

- Renban ModE starts with seven hints and reaches the published completion in 154 steps at 4,702 points, Medium. Independent enumeration checks the Renban and Little Killer assignments, including legal repeats outside the Renban and matching houses in Jigsaw layouts.
- Renbann9 (BSms) goes from two moves and 54 points to four moves and 232 points. Both new moves test a candidate that would leave five cells in box 8 with only digits 6–9. The exported puzzle keeps all nine original lines and its exact solution. The app reports a partial walkthrough.
- New Body Rhumba, Triforce, and the archived mixed Little Killer, Renban, and Sandwich puzzle now have complete app walkthroughs.

Five warmed WebAssembly samples gave these median CPU times before the uniqueness optimization. Finder times are the exhaustive checks of one new technique.

| Sample | Rating before | Rating after | Ranked hints before | Ranked hints after | Finder after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Renban ModE | 20.48 ms | 3.45 ms | 38.13 ms | 24.27 ms | 0.12 ms |
| Renbann9 | 95.82 ms | 115 ms | 114.81 ms | 78.56 ms | 6.84 ms |
| New Body Rhumba | 66.50 ms | 0.66 ms | 40.65 ms | 0.23 ms | 0.08 ms |

The first benchmark retained identical candidate masks and published completions. The app Wasm grew from 4,153,837 to 4,188,223 bytes before the exact change. During the ModE run, the Wasm memory high-water mark rose from 1.56 MiB to 2.19 MiB.

Exact uniqueness now uses the contained Renban and Little Killer sum together. The engine prepares the combined constraint once per search. The same 1,000,000-node request returned the published ModE solution in all six paired runs. Median CPU fell from 3,005 ms to 2.79 ms. The improved search also verifies at 1,000 nodes, where the earlier build hits its limit. Removing a required solution candidate gives no solution, and a zero-node budget still returns a search limit. Public candidate display and logical rating use their own existing traversal.

[Joint proof integration #202](https://github.com/coder13/sudoku-app/issues/202) · [Renbann9 research #158](https://github.com/coder13/sudoku-app/issues/158)
