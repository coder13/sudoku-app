# Variant rectangle graph performance audit

This work starts from main `96b475f`, after the Modular Lines integration and release record. It follows the measured empty-search costs in [issue 175](https://github.com/coder13/sudoku-app/issues/175) and the broader [performance audit](https://github.com/coder13/sudoku-app/issues/88). No rule, technique, point cost or default order is added.

## Measured cause

The control is cyboogie's original [Modular VII/XIII 2](https://sudoku.coach/en/s/HCHW), preserved completely in [the source corpus](tests/fixtures/modular-coach.json). Its native path stalls at 420 points after 21 deductions; the app path stalls at 2000 points after 25. Both exact completions agree with an independent numeric-rule counter. The optimization must retain those logical paths and every proof.

Temporary private-stage instrumentation in a native release test separated graph construction from all three traversals. Five fresh constructions per position observed roughly 60 ms at the opening, 26 ms at the native stall and 22 ms at the app stall. Traversals were below 0.2 ms. The opening construction produced no graph. Instrumentation was removed before the shipping build.

Classic `DeductionSearch` already caches its rectangle graph, but `classic_proofs` constructs a separate search for each variant technique. The three rectangle inference techniques repeat the same construction on the same immutable board and masks. An empty result repeats the full guardian enumeration too.

## Change and safety boundaries

Each private `ProofPosition` now owns a lazy `RectangleInferenceCache`. The three Unique Rectangle inference techniques borrow it through the existing Classic search. The first lookup stores owned copies of the board and candidate masks together with its completed graph result. A completed empty result is retained. Every lookup checks both complete input arrays; a mismatched caller uses its local graph instead and cannot replace the original cached position.

Graph construction, edge ordering and each technique's traversal remain unchanged. Unique-solution eligibility, extra-rule swap checks and proof conversion remain in their existing locations. Changed entries or removals create a new logical position. The cache adds no global state, cross-worker state, unsafe code or public API. It is compiled only with `variants`; other inference families retain their existing cache lifetimes.

Native regressions use the published practice positions for all three shapes. They retain expected actions and complete proof lists in both technique orders. Further controls warm an empty result before a different positive position, replace domains after warming a positive graph, and return to the original position. All 356 unit/integration tests pass. Seven Cargo examples pass in a separate serial run, for 363 native cases; strict full/classic-only/variants-only documentation also passes.

## Focused Wasm comparison

The comparison uses Node 26.13.0 on macOS arm64. Each position gets fresh engine instances, and execution alternates between builds. Each request has two warmups and seven measured samples. Timings include serialization; assertions and exact response comparisons are outside timing. Instantiation, worker startup, transfer, browser layout and paint are excluded. p95 of seven is the maximum. No audit-owned compiler, test or other benchmark runs concurrently; the host is not dedicated.

The [benchmark](scripts/bench-variant-graphs.mjs) derives the two stalls from the unchanged baseline and also checks the first published exercise for each rectangle inference shape. It compares complete replies without normalizing fields. Shared graphs live within a combined request; separate messages retain separate logical positions.

| Position | Request | Main → cache, median/p95 ms | Committed MiB, main → cache |
| --- | --- | --- | --- |
| HCHW-opening | rectangle-inferences | 275.904/285.936 → 93.251/94.264 | 1.375 → 1.500 |
| HCHW-opening | reversed-rectangle-inferences | 278.711/283.130 → 92.716/94.525 | 1.375 → 1.500 |
| HCHW-opening | app-rate | 873.575/881.765 → 595.487/602.997 | 5.875 → 6.625 |
| HCHW-opening | exhaustive | 276.917/283.408 → 92.632/94.438 | 5.875 → 6.625 |
| HCHW-native-stall | rectangle-inferences | 121.371/124.721 → 40.773/41.955 | 3.250 → 3.250 |
| HCHW-native-stall | reversed-rectangle-inferences | 121.814/123.231 → 40.690/41.351 | 3.250 → 3.250 |
| HCHW-native-stall | app-rate | 874.934/880.014 → 594.299/596.310 | 5.875 → 6.562 |
| HCHW-native-stall | exhaustive | 276.070/281.417 → 196.230/198.872 | 7.000 → 7.812 |
| HCHW-app-stall | rectangle-inferences | 102.791/102.886 → 34.827/35.211 | 3.000 → 3.062 |
| HCHW-app-stall | reversed-rectangle-inferences | 103.239/104.563 → 34.723/35.396 | 3.000 → 3.062 |
| HCHW-app-stall | app-rate | 211.062/211.314 → 143.457/143.995 | 5.750 → 6.500 |
| HCHW-app-stall | exhaustive | 211.250/212.243 → 143.567/144.042 | 5.750 → 6.500 |
| unique-rectangle-aic-published | rectangle-inferences | 1.112/1.289 → 0.737/0.847 | 1.625 → 1.625 |
| unique-rectangle-aic-published | reversed-rectangle-inferences | 1.042/1.054 → 0.675/0.706 | 1.625 → 1.625 |
| unique-rectangle-continuous-nice-loop-published | rectangle-inferences | 5.101/5.314 → 4.980/5.249 | 7.500 → 7.500 |
| unique-rectangle-continuous-nice-loop-published | reversed-rectangle-inferences | 5.123/5.559 → 5.040/5.287 | 7.500 → 7.500 |
| unique-rectangle-discontinuous-nice-loop-published | rectangle-inferences | 0.792/0.915 → 0.622/0.720 | 2.000 → 2.000 |
| unique-rectangle-discontinuous-nice-loop-published | reversed-rectangle-inferences | 0.740/0.793 → 0.594/0.673 | 2.062 → 2.000 |

On this control, opening app rating falls from 873.575 to 595.487 ms, about 32%. The exhaustive opening scan falls from 276.917 to 92.632 ms, about 67%. Positive published chains retain their full proof lists; their smaller improvements depend on how much time construction contributes.

Committed memory is Wasm linear-memory capacity, not live allocations or process RSS. The focused HCHW sequences increase capacity by up to 0.8125 MiB. Holding a graph until its logical position ends can overlap other detector work. This is a measured cost, and broader controls remain necessary before release.

Main app artifact: 3417181 raw / 897461 gzip bytes, SHA-256 `9f61fa13458970e78a2a054a74ddef92e5c204e93b256f364b08b21a8f6a8498`. Initial cache build: 3378493 raw / 910165 gzip bytes, SHA-256 `483980ddcd572247c66745479c982f1a922e7bcad889674a0dc1578e9e9da1eb`. This compiler's app saves 38688 raw bytes and adds 12704 gzip bytes. The four package profiles and production rebuild pass; the production artifact reproduces this hash. Teaching examples, aliases, difficulty metadata and capability declarations match main exactly.

## Capability profiles

| Package | Main raw / gzip bytes | Cache raw / gzip bytes |
| --- | ---: | ---: |
| solver | 2065326 / 564431 | 2065124 / 564227 |
| variant-solver | 2621324 / 711615 | 2622683 / 711379 |
| classic | 2567801 / 664249 | 2568331 / 666825 |
| app | 3417181 / 897461 | 3378493 / 910165 |

The reduced variant package saves 236 gzip bytes. Classic-only builds omit the new cache module and preserve their behavior, but compiler layout changes alter their measured artifacts too. The app adds about 1.4% gzip bytes. The package decision trades this measured transfer cost for the affected request improvement; startup and network latency are not measured here.

## Classic and reduced callers

Classic requests already share this graph in one search. Six paired forward/reverse requests on the three published examples retain every action and proof. Their median times remain about 0.7–10.5 ms; this control does not establish a Classic speedup.

| Published case | Classic request | Main → cache, median/p95 ms |
| --- | --- | --- |
| unique-rectangle-aic-published | classic-rectangle-inferences | 1.087/1.285 → 1.136/1.297 |
| unique-rectangle-aic-published | classic-reversed-rectangle-inferences | 1.138/1.833 → 1.105/1.416 |
| unique-rectangle-continuous-nice-loop-published | classic-rectangle-inferences | 10.434/10.954 → 10.450/10.956 |
| unique-rectangle-continuous-nice-loop-published | classic-reversed-rectangle-inferences | 10.326/10.448 → 10.105/10.760 |
| unique-rectangle-discontinuous-nice-loop-published | classic-rectangle-inferences | 0.679/0.694 → 0.675/0.702 |
| unique-rectangle-discontinuous-nice-loop-published | classic-reversed-rectangle-inferences | 0.658/0.669 → 0.675/0.696 |

The reduced `variant-solver` artifact agrees with the app on 21 complete replies: candidates, analysis, solving, traces and ratings for all three complete Modular sources, plus forward/reverse combined inference proofs for the three published chain examples. Its catalog agrees; generation and practice requests still return `unsupported-capability`.

The production rebuild retains 18 client JavaScript assets at 6073395 raw bytes. Their summed individual Node gzip sizes change from 2000855 to 2000861 bytes. The engine artifact accounts for the material transfer difference.

## Remaining gates

The extended comparison preserves 12341 complete replies on 83 corpus positions and 363 positive practice positions, all 121 detector IDs and every hint page. Another 148 complete Classic replies agree on nine Tridagon examples. This includes all three Modular sources, both HCHW stalls and the intervening app positions. TypeScript, 520 app tests, 316 Wasm contracts, all four package profiles and the 163-route production/offline build pass. The full capability runtime matrix is still required in CI: local native linking exhausted disk space. Generation and broad paired performance checks are in progress. Existing difficulty calibration, source-format gaps and HCHW's human reasoning gap remain separate work. The comparison also exposes an expensive empty Quintuple Pattern Overlay query before app step 22. The labelled baseline scout took about 61 seconds while other validation was active; this is a diagnostic observation, not a controlled performance statistic. All baseline/candidate replies eventually match. [Issue 179](https://github.com/coder13/sudoku-app/issues/179) preserves the exact position and separate optimization requirements.

Local accumulated Cargo caches exhausted disk during the first documentation-example and four-profile attempts. The documentation examples pass after clearing completed caches and running serially. All four profiles pass after repeating the same validation commands with a fresh target per profile. The native feature-matrix runtime attempt also exhausted disk during linking; its full gate remains pending CI. These infrastructure failures are retained in the logs and do not establish a product failure or a passed gate.

## Reproduce

```sh
node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm src/sudoku/generated/engine.wasm
node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm src/sudoku/generated/engine.wasm --classic-only
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy-corpus --modular-corpus
```
