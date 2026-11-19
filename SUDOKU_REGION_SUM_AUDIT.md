# Region Sum Lines app integration

Implementation and controlled timing baseline: main `a761a71970f58aa240fbfeeab7e37f3a68b4e34c`. Before release, the branch incorporated main `acf77b1f63ca6b3b1ca740bde580be27efc54ce3`, including the independent solved-view and mobile-header changes. The native equal-sum rule, proof formatter, 48-point Medium technique and three practice positions already exist. This integration adds complete app support and Medium New Puzzle recipes. Scoring version 8, technique costs and enabled-technique semantics stay unchanged.

## Source and mathematical controls

Every part of a line has the same total. The default splits a part whenever the logical path crosses a region boundary; a later visit to the same region is another part. `groupByRegion: true` instead combines all visits to each region. Jigsaw borders replace standard boxes. Different lines keep independent totals.

| Complete control | Original clues | Independent uniqueness | App human result |
| --- | --- | --- | --- |
| Philip Newman, [Symmetease](https://www.gmpuzzles.com/blog/2026/09/region-sum-lines-sudoku-by-philip-newman-5/) | 19 givens, 7 lines | Printed completion, 1 node | Complete Medium, 986 points, 68 steps |
| CaroBaro, [Thermos and Region Sums](https://sudoku.coach/en/s/91BB) | 0 givens, 9 lines, 11 thermometers | Printed completion, 1 node | Partial, 2,262 points, 67 steps |
| CaroBaro, [Non Con and Anti Royal Region Sums](https://sudoku.coach/en/s/8AGt) | 3 givens, 6 lines, Non-Consecutive/Anti-Knight/Anti-King | Printed completion, 7 nodes | Complete Impossible, 4,058 points, 185 steps |
| CaroBaro, [Region Lines and Dots](https://sudoku.coach/en/s/8oer) | 2 givens, 7 lines, 17 white dots | Printed completion, 9 nodes | Partial, 1,272 points, 55 steps |
| funnyamliy, [Region Sum, Easy](https://sudoku.coach/en/s/FaxQ) | 8 givens, 4 lines | Printed completion, 3,793 nodes | Partial, 48 points, 1 step |

Source titles do not imply the app's difficulty or a complete human solution. Every source retains its original full code, companion rules and printed completion. The independent numeric counter enumerates distinct digit assignments within each region part and common totals, combined with Sudoku houses and every companion rule. It does not call engine support, candidates, solving or rating.

Newman's original grid/solution PDFs were rendered and checked. Their SHA-256 values are `aaf5c217c8b6084fbbab243f1fea03f997696c13ea48adfbfc4d61d3570ea271` and `f65c7ad78c655f22b3a41a739e30bff963726e3b16c79a0016fa44e7c3602d59`. The fixtures contain the original PDF links. The versioned Coach compiler is `jCfXtZs-1776367508519.js`, SHA-256 `567c7f9023cfff3a7f8feb4f8393d3b10a1f85f9539ef48f31c577b105ad521f`.

Local placed-digit restrictions are checked against every partial four-cell assignment in two grouping layouts, using a separate truth table of complete equal-sum assignments. These masks deliberately leave houses and explicit candidate deductions separate. Tests distinguish separate and combined visits, use declared Jigsaw boundaries, intersect Between/Global Entropy restrictions, and verify both Pencil modes, bulk entry, conflicts and undo/redo.

## Interchange and rendering

Coach joins connected Region Sum drawing segments in insertion order. For a closed component, it rotates the logical cells until the first/last cells belong to different regions, preventing one visit from being split at the cut. The importer follows that behavior and retains original drawing paths. This differs from independent Between/Entropic/Modular segments. Native/shared rules also accept both grouping modes directly. Unknown semantic settings, invalid geometry and single-part definitions are rejected.

Native Region Sum now has optional `segments`, following the existing Palindrome/Renban drawing contract. Its union must exactly equal the distinct logical `cells`. Drawing closures and revisits do not change the sum equations. Old JSON omits the field; Rust callers use `segments: None`. Native transforms move both logical and visible paths. Canonical-key tests use literal coordinates in all eight orientations. Rule help and hints list the actual equal-total cell groups when explicit drawing paths are present. Geometry contract tests reject missing/extra/out-of-grid cells. Round-trip and generation contracts retain closures in all eight orientations.

The shared renderer draws blue paths and preserves original closing edges. Overlap lanes keep companion line families visible, and Region Sum lines render above thermometer bodies. Separated logical cells use explicit dots and dashed connectors, so crossed unmarked cells are not implied constraints. Accessible cell descriptions identify the line, part and grouping mode using actual region borders. Shared controls and board interaction remain in place; no new keyboard control is introduced.

Static clue SVGs were inspected in light/dark themes at 290/540 pixels, including Newman, thermometers, dots, closed/separated paths and overlapping families. Desktop/mobile component output, all cell roles, sharing after progress and Jigsaw labels are checked with SSR. Live browser layout, pointer and keyboard review was not performed.

The complete app callers cover import preview, candidates, exact solutions, explicit disabled profiles, action-by-action human trace replay, several hint choices where the engine finds them, Finder counts before/after entries, all selected hint pages, stale collection release, actual storage reload, history, sharing, Learn and three practice exercises plus a fresh drill. Partial human traces remain partial; exact completions are not substituted into them.

FaxQ currently has only one ordinary and exhaustive hint. Its explicit 20,000-node verification check reports `search-limit`; the normal budget confirms its unique solution. These coverage/search gaps and the slow mixed rating paths remain in [issue 192](https://github.com/coder13/sudoku-app/issues/192). They are not presented as solved engine research.

## New Puzzle

A named choice and preview offer the checked Medium level. Twenty of twenty one-attempt seeds produce distinct thirty-given puzzles within 20,000 nodes per exact check. Independent numeric search confirms uniqueness and matching solutions, and finds multiple solutions when Region Sum rules are removed. Seeds 1, 7 and 15 provide checked fallback recipes. The real app path verifies deterministic repeats and full played-puzzle/symmetry exclusions, including valid saved `mixed` aliases. A reproduced duplicate-generation bug is fixed: equivalent explicit drawing paths cannot bypass exclusions. A private generation key ignores only validated drawing metadata for Region Sum, Palindrome and Renban; the public canonical definition retains it. Native regressions cover all three families and invalid exclusions, and the real New Puzzle regression covers the drawing alias.

Generation carves fresh givens from the attributed Symmetease layout and compatible completion. It does not claim to invent new line geometry or solved grids. A separate generation contract preserves optional closed geometry. Required recipes for thirteen older import-only families remain in [189](https://github.com/coder13/sudoku-app/issues/189).

## Retained behavior and validation

`compare-geometry-engines.mjs` compares the released Between artifact with the new app artifact using exact full responses, including failures, ordering, scores, scoring version, evidence and scopes. All **7,103 responses** match: 363 positive practice positions, 121 detectors and complete traces/ratings/every hint page across 45 stored corpus positions, followed by 200 generation requests across ten families. Those generation pairs retain 194 accepted results and six exhausted searches (one Windoku, one Diagonal, four Jigsaw). Twenty new Region Sum requests all succeed. No scoring metadata is stripped from the comparisons.

Local verification passes 369 native tests including seven Cargo doc examples, 562 app tests, 345 Wasm contracts, TypeScript, strict typing of all new contracts and the 121-component catalog. Strict full/core/variants Cargo docs pass. After integrating main `acf77b1`, the full 562-app/345-Wasm suites, TypeScript, catalog and production/offline build pass again, with 171 prerendered routes. The integration leaves the tested native sources and app Wasm hash unchanged. All exact-head feature-matrix, four-profile, app/Wasm, strict documentation and deployment gates pass; the release is recorded below.

## Performance

Controlled measurements precede the independent solved-view/mobile-header integration; native and Sudoku caller sources are unchanged by that merge. Board SSR measurements refer to the earlier board wrapper. Darwin arm64, Node 26.13.0, app Wasm `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`. Reproduce app-path measurements with `SUDOKU_BENCH_FAMILY=region-sum node --experimental-strip-types --test scripts/bench-entropic-app.mts`. No other owned build, test suite or benchmark ran during controlled measurements. Fast paths use five warmups/twenty samples; slow app paths use two/five. Assertions and independent checks are outside timing. The in-process test worker excludes startup, transfer, layout and paint. Raw hint requests use Medium; actual app hints retain their game grade and explicit candidate masks. The p95 of five samples is the maximum.

Milliseconds, median / p95:

| Operation | Symmetease | 91BB | 8AGt | 8oer | FaxQ |
| --- | --- | --- | --- | --- | --- |
| Candidates | 0.034 / 0.040 | 0.054 / 0.086 | 0.031 / 0.036 | 0.054 / 0.112 | 0.020 / 0.020 |
| Unique-solution check, normal budget | 0.140 / 0.157 | 0.758 / 0.799 | 0.702 / 0.706 | 0.514 / 0.528 | 115.639 / 123.023 |
| Exact solve | 0.114 / 0.117 | 0.691 / 0.704 | 0.612 / 0.653 | 0.393 / 0.396 | 100.463 / 103.499 |
| Native default rating | 0.128 / 0.144 | 0.367 / 0.390 | 1.210 / 1.239 | 0.290 / 0.294 | 0.053 / 0.067 |
| App-order rating | 0.175 / 0.212 | 179.524 / 182.229 | 1074.682 / 1081.112 | 86.065 / 86.344 | 93.860 / 95.079 |
| Raw ten-choice request | 21.509 / 21.960 | 0.154 / 0.158 | 0.162 / 0.169 | 66.803 / 68.555 | 13.693 / 13.980 |
| Exhaustive request | 21.017 / 22.745 | 33.177 / 33.575 | 74.490 / 75.406 | 66.426 / 67.172 | 13.677 / 13.972 |
| Import preview with rating | 0.449 / 0.458 | 183.134 / 183.933 | 1061.941 / 1065.811 | 87.042 / 87.343 | 319.153 / 339.303 |
| Play candidates | 0.026 / 0.031 | 0.051 / 0.066 | 0.033 / 0.040 | 0.054 / 0.060 | 0.041 / 0.193 |
| Actual app hints | 22.059 / 22.506 | 0.219 / 0.221 | 74.344 / 75.003 | 65.293 / 66.202 | 16.054 / 18.587 |
| Solution walkthrough | 1.100 / 1.595 | 181.295 / 183.405 | 1078.972 / 1086.426 | 86.505 / 86.682 | 96.988 / 100.398 |
| Input with all candidates | 0.067 / 0.082 | 0.162 / 0.340 | 0.077 / 0.086 | 0.148 / 0.155 | 0.092 / 0.123 |
| Board SSR | 1.732 / 2.186 | 1.706 / 2.164 | 1.643 / 1.987 | 1.698 / 2.113 | 1.788 / 2.165 |

Opening ordinary/exhaustive choice counts are 7/7, 10/20, 10/36, 6/6 and 1/1. Recorded Wasm capacities after each cumulative request sequence are 3,145,728 / 3,473,408 / 6,553,600 / 6,553,600 / 6,553,600 bytes. These are retained capacities, not live allocation peaks or isolated per-puzzle requirements.

The fixed-layout thirty-given generation sample succeeds on all twenty seeds: median 3.077 ms, p95 4.799 ms, six attempts and 20,000 nodes per exact check, no warmups. Deterministic repeats and independent checks are outside timing. The actual Medium New Puzzle caller at seed 2 measures 3.632 / 4.164 ms with two warmups/five samples. Calibration yield and timing samples are separate runs.

A separate paired native run alternates engine order within each round. Fast operations use five warmups/twenty samples; slow operations use two/five. Exact responses are checked outside timing. App-order ratings (milliseconds, median / p95) retain slow and noisy samples:

| Source | Released artifact | New artifact | Median change |
| --- | --- | --- | --- |
| Symmetease | 0.203 / 0.223 | 0.202 / 0.209 | -0.001 ms (-0.5%) |
| Thermos and Region Sums | 180.139 / 183.077 | 180.148 / 188.172 | +0.009 ms (+0.0%) |
| Non Con and Anti Royal Region Sums | 1052.658 / 1056.330 | 1064.502 / 1076.131 | +11.844 ms (+1.1%) |
| Region Lines and Dots | 86.116 / 87.673 | 85.830 / 86.880 | -0.286 ms (-0.3%) |
| Region Sum, Easy | 93.486 / 94.452 | 92.421 / 93.381 | -1.065 ms (-1.1%) |

No broad speedup is claimed. The table retains increases and decreases, including five-sample maximums. Treat these as measurements, not latency guarantees. The roughly one-second mixed rating, partial human paths and FaxQ verification/hint limits remain explicit follow-ups in issue 192.

## Package cost

The package baseline is a separate production build of main `acf77b1`, compared with integrated Region Sum head `a722847`. Both builds use the same dependencies and compiler, including the independent solved-view/mobile-header changes. The baseline app Wasm is released Between artifact `d5bf3ebcd76528c51901498889bcd6d35ef1d9487051a147b6463b794abfd045`. Per-asset gzip totals use Node `gzipSync`:

| Asset group | Baseline raw / gzip | Region Sum raw / gzip | Change raw / gzip |
| --- | --- | --- | --- |
| JavaScript, 21 files | 6,246,484 / 2,064,963 | 6,251,601 / 2,066,310 | +5,117 / +1,347 |
| CSS, 1 file | 299,388 / 41,259 | 299,670 / 41,301 | +282 / +42 |
| App Wasm | 3,430,109 / 898,293 | 3,416,046 / 893,636 | -14,063 / -4,657 |

The Wasm size change accompanies the optional rule field and the generation identity fix; it is not a separate algorithm optimization or a promised future size saving. Reduced-profile costs and feature gates are checked in release CI. The remaining five native UI families, thirteen older generation integrations, authored-source semantics, other formats and the broader R&D goal remain open.

## Release

[PR 193](https://github.com/coder13/sudoku-app/pull/193) merged at `3706a0f19bb4f8ffb25e6dca4762d05be1a10f17` after all checks passed on reviewed head `4d284a679d8cd92507dc6e3f82a71c8cd652f274` in [CI run 44460015789](https://github.com/coder13/sudoku-app/actions/runs/44460015789). Completed logs confirm 369 native tests including seven Cargo examples, sixteen capability combinations, strict full/core/variants docs, four Wasm profiles, 562 app tests, 345 Wasm contracts, TypeScript and the 121-component catalog. Deployment and header checks pass. The local production/offline build prerenders 171 routes.

Fetched main contains both the reviewed head and merge commit, with identical Rust, scripts, app, tests, stories, dependencies and component catalog. The isolated source worktree remains pinned to that reviewed head. The separately compiled preview engine is 3,416,046 bytes, SHA-256 `f4f2a123db3a51b2d7873dc8354098204637dd402efa60ebad58b0e9accdc149`; all 7,103 complete-response comparisons against the local artifact pass, including the 200 generation outcomes. Read-only HTTP confirms the published shell, Region Sum lesson, service-worker asset list and referenced Wasm asset. Deployment verification uses the actual service-worker asset path. These checks do not constitute live layout, keyboard or pointer review.

Issue 67 is closed. Issue 192 retains the partial human paths, single FaxQ hint and slow rating/search work. Five existing native UI families, thirteen older New Puzzle integrations, authored-source semantics, remaining formats and the full R&D goal remain open.
