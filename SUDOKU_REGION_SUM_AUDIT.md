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

## Tridagon refutations in mixed ratings

The full 8AGt puzzle retains its Region Sum, Non-Consecutive, Anti-Knight, and Anti-King rules. A named app Wasm profile on `b9ffe95` recorded 8,448 samples across one full trace and three ratings. Forcing branch propagation accounted for 3,927 exclusive samples. The Tridagon guardian refutation loop accounted for another 2,004. This trace finishes in 185 steps and scores 4,058 points.

Each Tridagon refutation tries one candidate assumption against a list of guardians. A branch can start a new guardian inference only when it removes all but one guardian or removes them all. In a list of at least two guardians, that branch must remove at least one of the first two. The engine now uses each guardian's removal index to find those assumptions. It checks the full clause and tries each remaining assumption in the original order. The independent Rust regression checks every index bit against the facts from a separate branch search.

### Paired app Wasm timings

The baseline commit is `290041376b28421f8fee69ccc01bbd8d195698e4`. The measured candidate is `1e4279ee3ff5cba16fe3e6231572efff203d6597`. Rust 1.92.0 built both stripped app Wasm binaries. Node 22.23.1 ran on logical CPUs 6 and 7 of an AMD Ryzen 7 7840U under Arch Linux 7.1.8.

Each case records the first request, one warmup, and five measured requests per build. Build order alternates. With five samples, p95 is the largest sample. The measurements include serialization and app Wasm execution in Node.

| Published source and operation | Baseline median / p95 (ms) | Candidate median / p95 (ms) |
| --- | ---: | ---: |
| 8AGt app-order rating | 2,175.50 / 2,195.47 | 1,660.20 / 1,714.92 |
| 8AGt app-order trace | 2,165.54 / 2,182.84 | 1,651.70 / 1,659.36 |
| 91BB app-order rating | 397.26 / 400.68 | 394.35 / 396.07 |
| 8oer app-order rating | 161.66 / 162.78 | 162.36 / 163.39 |
| FaxQ app-order rating | 174.85 / 177.75 | 157.39 / 160.28 |
| 8AGt opening Tridagon forcing proofs | 36.79 / 38.13 | 36.61 / 37.25 |
| FaxQ opening Tridagon forcing proofs | 1.224 / 1.569 | 1.217 / 1.573 |

Both opening Tridagon scans return zero proofs. The 8AGt trace finishes with the published solution and the same proof for every step. The [measurement data](docs/measurements/region-sum-rating.json) contains the timing samples and response hashes.

The first 8AGt rating in each instance takes 2,377.32 and 1,837.24 ms. Instantiation takes 19.99 and 14.83 ms. These are single measurements. The initial replay had slow samples on both builds. Its 8AGt rating medians were 2,714.10 and 2,147.61 ms. The recorded table uses the complete repeat.

Both Wasm instances reach 5,570,560 bytes of linear-memory capacity in the paired replay. App Wasm shrinks by 9,833 raw bytes and 835 gzip bytes. A capacity snapshot gives the buffer size. The run uses one Node process for both instances.

### Reproduction and validation

Build both app Wasm binaries at the pinned commits with separate Cargo target directories. Run these commands from the branch that contains this audit.

```sh
node --experimental-strip-types scripts/bench-region-sum-rating.mjs before.wasm after.wasm
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --region-sum --classic-tridagon
cargo test --locked --release -p sudoku-app-engine --all-features --lib guardian_tests
```

The comparison matches 4,197 complete variant responses and 148 Classic responses. It includes ordered proofs, all hint pages, disabled techniques, explicit removals, and the complete source ratings and traces. All six native guardian tests pass. All 140 seeded generation pairs match across seven recipes with six attempts and 20,000 nodes per request. X-Sudoku generation p95 rises from 2.083 to 3.929 ms in that check.

## Distinct digits within a line part

The ordinary Region Sum deduction intersects totals without requiring distinct digits within a part. The new opt-in `region-sum-distinct` technique also checks whether each part can assign the digits without a repeat in its region. It reports candidate removals that need this extra premise. The proof records the source clue, each part’s cells and candidate masks, the totals each part can make, and the common totals. The app tries the 67-point Medium technique immediately after ordinary Region Sum and refreshes cached ratings for puzzles containing its rule. Scoring version 13 records the change. Native callers keep their existing default order and can opt in explicitly.

The detector tracks reachable digit sets in each part and traces back through the sets that reach a common total. There are at most 512 sets per depth. It uses the compiled parts for separate and grouped visits, including Jigsaw region layouts. It checks that the puzzle enforces each relevant region’s distinct-digit rule before making a deduction. Exact solving and candidate propagation keep their existing arithmetic paths.

| Complete source definition | Earlier Play steps / points | New Play steps / points | New proofs used | New status |
| --- | ---: | ---: | ---: | --- |
| Symmetease | 68 / 986 | 68 / 986 | 0 | Medium, complete |
| Thermos and Region Sums (91BB) | 67 / 2,262 | 156 / 3,830 | 6 | Medium, complete |
| Non Con and Anti Royal Region Sums (8AGt) | 185 / 4,058 | 219 / 2,815 | 1 | Medium, complete |
| Region Lines and Dots (8oer) | 55 / 1,272 | 146 / 3,218 | 4 | Medium, complete |
| Region Sum, Easy (FaxQ) | 1 / 48 | 22 / 881 | 5 | Partial |
| 220V (7rs9) | 82 / 2,895 | 200 / 3,815 | 3 | Medium, complete |

Every walkthrough action agrees with its published completion. An independent enumeration checks each distinct-digit Region Sum deduction on the five Region Sum source fixtures, including totals, rule topology, live candidates and removed digits. The 220V import contract retains the complete authored mixed ruleset and checks each walkthrough action against its published solution. FaxQ offers three opening hints, including two distinct-digit proofs. Its default exact request still verifies the unique completion, and its 20,000-node request still reports the search limit. The logical walkthrough ends after 22 explained steps.

Tests cover saved score refresh, grouped repeat visits, all nine opening proofs of the selected technique on 91BB, paging and Finder action counts, three practice positions, a fresh drill, undo and redo, and the existing Region Sum New Puzzle contracts. Chromium verified the new walkthrough proof in a desktop import of 91BB and a phone import of FaxQ. Learn explains the deduction and includes an interactive example.


### Paired request timings

The comparison uses the production Wasm from main `921344c5` and the local app Wasm on macOS arm64 and Node 26.13.0. Each value is median / p95 thread CPU milliseconds across seven warmed, alternating samples. Hints use the normal ten-choice request and the difficulty each profile assigns to the puzzle. The timings include direct protocol serialization and exclude browser startup, worker transport and rendering.

| Puzzle | Candidates before → after | Unique solution before → after | Rating before → after | Ten hints before → after |
| --- | ---: | ---: | ---: | ---: |
| Symmetease | 0.059 / 0.161 → 0.057 / 0.065 | 0.222 / 0.231 → 0.219 / 0.232 | 0.487 / 0.587 → 0.619 / 0.812 | 33.311 / 41.071 → 35.603 / 39.117 |
| 91BB | 0.091 / 0.116 → 0.087 / 0.102 | 0.883 / 0.944 → 0.879 / 0.905 | 104.685 / 112.375 → 1.758 / 2.049 | 0.467 / 0.569 → 0.555 / 0.601 |
| 8AGt | 0.088 / 0.166 → 0.106 / 0.161 | 1.096 / 1.682 → 1.116 / 1.784 | 982.711 / 1010.441 → 6.400 / 6.715 | 132.423 / 142.765 → 0.473 / 0.807 |
| 8oer | 0.123 / 0.251 → 0.133 / 0.149 | 0.649 / 1.010 → 0.888 / 1.008 | 89.469 / 93.858 → 1.258 / 1.798 | 110.504 / 111.696 → 0.611 / 1.090 |
| FaxQ | 0.032 / 0.051 → 0.031 / 0.037 | 131.101 / 142.408 → 135.165 / 147.635 | 103.414 / 113.650 → 69.389 / 74.758 | 15.386 / 17.200 → 14.182 / 16.205 |
| 7rs9 | 0.100 / 0.117 → 0.096 / 0.107 | 0.709 / 1.018 → 0.676 / 0.956 | 205.156 / 209.305 → 5.313 / 6.373 | 1.042 / 1.237 → 1.196 / 1.477 |
| HCHW | 0.079 / 0.141 → 0.076 / 0.110 | 0.396 / 0.619 → 0.383 / 0.574 | 8.646 / 10.293 → 10.983 / 13.115 | 0.470 / 0.633 → 0.484 / 0.512 |

The 8AGt rating avoids its earlier forcing work. Its new Medium rating also reduces the ranked hint request’s search scope. FaxQ still spends about 135 ms of Wasm CPU on default exact verification. HCHW exercises the unchanged Modular profile. Its full replies match after normalizing the rating version, with a 2.3 ms median increase in this build comparison. All candidate and unique-solution replies match on the seven fixtures. Removing the new technique from the current order reproduces earlier rates and hints on all seven fixtures after normalizing the rating version. A separate full replay matched earlier traces under that same disabled profile.

The app artifacts measured 4,297,093 bytes (1,133,862 gzip) in production and 4,261,430 bytes (1,163,135 gzip) in the local build. The artifacts come from different build hosts. These sizes and small timing differences include toolchain and build effects.

```sh
node --experimental-strip-types scripts/bench-region-sum-distinct.mjs released.wasm src/sudoku/generated/engine.wasm
```
