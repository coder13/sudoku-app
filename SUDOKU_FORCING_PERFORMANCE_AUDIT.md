# Forcing-branch intersection performance audit

This audit compares main `68684c6` with `codex/sudoku-entropic-rating-audit`. [Issue 165](https://github.com/coder13/sudoku-app/issues/165) tracks the change.

The change reached main at `54c75b6` through [PR 166](https://github.com/coder13/sudoku-app/pull/166). Native, feature, Wasm/app, strict documentation and deployment checks pass on reviewed head `8bf317f` in [run 44369897495](https://github.com/coder13/sudoku-app/actions/runs/44369897495). Both commits are ancestors of remote main. The source worktree remains pinned to the reviewed head.

## Problem and implementation

Hyk5, Entropic Loop, spends most of its rating time on searches that return no deduction. Its final position has no Nested Forcing Net proof. A five-second native sample places 3,734 of 3,794 samples inside branch propagation. The dominant instruction offsets scan locked-candidate premises during inner branch trials.

A literal records whether a candidate is true or false. Each branch now caches false literals as nine cell masks, one for each digit. Each locked-candidate intersection stores its original shared cells and outside source cells. It can advance only when every outside source cell is removed and at least two shared source cells remain.

This condition matches the previous candidate-list scan. The engine keeps the original intersection order, target order, premise lists and evidence. Duplicate facts do not change the cache. Inner and outer rollback remove exactly the discarded false literals. Chain and ordinary Net modes do not update this cache.

The change preserves all technique costs, enabled techniques, custom orders and scoring version 8. It does not change witness budgets or treat a failed witness search as a proof. Hyk5 and Hafj retain their partial human solve paths. Their reasoning gaps remain in [issue 162](https://github.com/coder13/sudoku-app/issues/162).

## Method and artifacts

Measurements use Node 26.13.0 on macOS arm64. Each checkout has a separate Cargo target directory. The saved main app artifact contains 3,402,659 raw bytes and 898,241 Node gzip bytes. Its SHA-256 is `8d5e9764319156a5b20a7f81f2e6a527e4a7c3c1a5d1a44bcbfda128d42bd0d9`.

The candidate contains 3,406,552 raw bytes and 898,722 Node gzip bytes. Its SHA-256 is `2fc3ac9ea7ad3922c9dc13e578045702fb6b4bcfaa34a93ee31b9be4a545b41c`. The production build preserves that artifact.

The final measurement phase runs each benchmark sequentially after local compilation and correctness jobs finish. The host is not dedicated. Paired request benchmarks alternate artifact order and use fresh instances for each fixture. Timings include request serialization and exclude instantiation. Fixed requests use five warmups and twenty samples. Source app ratings and exhaustive scans use two warmups and five samples. A p95 from five samples is the maximum.

Native measurements use five alternating pairs of ten-request batches after one warmup pair. Each batch runs the saved native CLI against the real Hyk5 stalled position with only Nested Forcing Net enabled. Batch means include process startup and file I/O. The median batch means change from 244.433 to 165.596 ms per request. Both binaries return the same empty proof list for every request.

## Complete Entropic sources

Each entry reports median/p95 milliseconds. Both artifacts return the same complete ordered traces and all rating fields.

| Source | App rating before | App rating after | Exhaustive before | Exhaustive after |
| --- | ---: | ---: | ---: | ---: |
| entropic-clover | 0.215/0.241 | 0.211/0.282 | 77.717/78.573 | 74.730/75.409 |
| EoGB | 0.135/0.139 | 0.136/0.139 | 114.427/115.115 | 108.979/110.149 |
| BSEJ | 0.232/0.245 | 0.232/0.242 | 129.651/132.077 | 129.620/134.243 |
| Hyk5 | 884.961/886.623 | 798.371/805.122 | 3.365/3.383 | 3.298/3.412 |
| Hafj | 103.632/105.104 | 102.693/104.054 | 3.305/3.386 | 3.297/3.342 |
| Ksy3 | 0.577/0.671 | 0.559/0.600 | 1161.186/1163.606 | 1088.358/1091.428 |

Hyk5 retains 1,680 points and twelve steps, then stalls. Hafj retains 107 points and five steps, then stalls. The other four sources complete under the app order. The source run also compares candidates, exact analysis, exact completion, native ratings and ordinary hints. Cheap operations show small timing differences in both directions.

## Retained fixtures

The nine-fixture run preserves complete responses, selected proofs and both default orders. Fixed requests use five warmups and twenty samples. Exhaustive scans use two warmups and ten samples. Each table entry reports median/p95 milliseconds.

| Fixture | App rating before | App rating after | Exhaustive before | Exhaustive after |
| --- | ---: | ---: | ---: | ---: |
| quadruple | 1.207/1.317 | 1.210/1.304 | 146.424/150.700 | 146.622/150.533 |
| parity | 0.169/0.176 | 0.166/0.175 | 45.152/45.514 | 44.836/45.109 |
| anti-king | 0.158/0.166 | 0.155/0.169 | 97.972/100.318 | 97.472/99.582 |
| non-consecutive | 0.387/0.439 | 0.385/0.420 | 34.213/34.382 | 33.707/33.891 |
| nc-white-dots | 0.995/1.066 | 1.011/1.122 | 0.330/0.400 | 0.332/0.432 |
| whispers | 0.314/0.367 | 0.313/0.346 | 3.152/3.255 | 3.191/3.284 |
| palindrome | 0.120/0.123 | 0.120/0.124 | 39.629/40.000 | 39.254/39.539 |
| palindrome-knight | 0.891/0.934 | 0.877/0.950 | 191.722/196.446 | 168.541/171.737 |
| palindrome-whispers | 99.493/101.159 | 96.691/98.531 | 2.348/2.439 | 2.350/2.453 |

These measurements do not show a universal speedup. NC white-dot app rating changes from 0.995/1.066 to 1.011/1.122 ms. Whispers ordinary hints change from 3.138/3.212 to 3.196/3.285 ms. Non-Consecutive cumulative Wasm capacity falls from 4.06 to 3.69 MiB. The other eight retained sequences use the same capacity.

## XV and Renban controls

All six XV controls and five Renban controls preserve their complete results and ordered traces. The paired method matches the Entropic source run.

| Source | App rating before | App rating after | Exhaustive before | Exhaustive after |
| --- | ---: | ---: | ---: | ---: |
| xv-clover | 5.770/5.994 | 5.856/5.969 | 125.598/128.231 | 125.195/126.435 |
| xv-quadruple-clover | 0.295/0.387 | 0.291/0.299 | 140.896/145.309 | 143.518/146.187 |
| 7v7n | 89.180/89.534 | 85.724/86.572 | 278.151/281.629 | 277.179/283.034 |
| FCeS | 7.188/7.396 | 7.279/7.349 | 0.794/0.865 | 0.811/0.873 |
| 63Jk | 3997.348/4001.054 | 3667.600/3672.966 | 375.042/376.742 | 314.172/314.669 |
| Chcs | 257.743/258.528 | 258.406/260.985 | 299.372/303.149 | 296.846/301.426 |
| renban-clover | 0.240/0.258 | 0.251/0.264 | 87.048/87.709 | 86.294/86.796 |
| renban-killer-clover | 0.183/0.203 | 0.182/0.196 | 63.959/64.330 | 63.424/63.550 |
| Jh4o | 851.191/870.474 | 810.831/816.822 | 88.523/88.886 | 88.860/89.936 |
| KUUo | 63.428/63.595 | 63.046/63.629 | 48.002/48.350 | 47.035/47.430 |
| BSms | 66.753/71.759 | 66.141/66.521 | 87.447/88.158 | 86.137/86.406 |

63Jk retains its 27,358-point complete path with 199 steps. Chcs remains stalled at 160 points and six steps. BSms remains stalled at 54 points and two steps. The slow BSms exact count remains about 719 ms. This change targets branch propagation, so exact search still needs a separate audit. The Renban Clover sequence grows from 4,915,200 to 5,242,880 bytes of Wasm capacity. The other ten control sequences retain the same capacity.

## Generation

Both artifacts use their unchanged default technique order. Each family uses seeds 1 through 20, six attempts and a 20,000-node budget. The benchmark alternates artifact order. There are no warmups. Every returned puzzle passes exact uniqueness and completion checks. Renban and Entropic also pass independent digit-array uniqueness and rule-dependence checks.

| Family | Successes before/after | Identical outcomes | Before median/p95 | After median/p95 |
| --- | ---: | ---: | ---: | ---: |
| classic | 20/20 | 20 | 0.589/0.833 | 0.595/0.787 |
| x-sudoku | 20/20 | 20 | 0.567/0.711 | 0.581/0.687 |
| killer | 20/20 | 20 | 2.636/3.016 | 2.620/3.108 |
| jigsaw-killer | 20/20 | 20 | 2.467/2.623 | 2.538/2.751 |
| windoku | 20/20 | 20 | 0.760/2.136 | 0.793/2.152 |
| renban | 19/19 | 20 | 100.355/300.361 | 101.366/298.199 |
| entropic | 20/20 | 20 | 3.230/13.410 | 3.187/13.487 |

All 140 complete outcomes match. Renban seed 10 reaches its budget in both artifacts. The other 139 outcomes succeed. Each successful family returns twenty distinct puzzles, except Renban, which returns nineteen. Generation capacity remains unchanged. These recipes do not establish the cost of every score target or rule combination.

## Package costs

All four supported profiles pass their capability contracts. Sizes use raw bytes and Node gzip bytes.

| Profile | Before raw/gzip | After raw/gzip | Gzip change |
| --- | ---: | ---: | ---: |
| solver | 2,061,762 / 563,437 | 2,065,326 / 564,431 | +994 |
| variant-solver | 2,621,084 / 706,969 | 2,627,536 / 708,597 | +1,628 |
| classic | 2,563,763 / 663,682 | 2,567,801 / 664,249 | +567 |
| app | 3,402,659 / 898,241 | 3,406,552 / 898,722 | +481 |

The EoGB request sequence grows linear-memory capacity from 6,881,280 to 7,077,888 bytes. The other five source sequences retain the same capacity. These figures describe cumulative Wasm capacity after all requests for each fixture. They do not measure resident process memory or allocation per request.

## Actual app callers

The app benchmark runs preview import, Play candidates, ordinary hints, the solution walkthrough, input and static Board rendering. It runs each artifact in a separate sequential process. Its in-process worker uses the explicit `SUDOKU_BENCH_WASM` path. This avoids replacing generated files during a measurement.

The benchmark preserves all six final ratings and ordinary hint counts. It also independently counts twenty distinct Entropic generations per artifact. It includes caller conversions and request serialization. It excludes worker startup, message transfer, browser layout and paint. These measurements do not establish real browser-worker latency.

Slow callers use two warmups and five samples. Each entry reports median/p95 milliseconds. These are sequential caller measurements, not alternating paired request measurements.

| Caller | Before | After |
| --- | ---: | ---: |
| clover: preview including rating | 0.305/0.312 | 0.300/0.337 |
| clover: ordinary app hints | 0.248/0.299 | 0.238/0.259 |
| clover: solution walkthrough | 1.724/2.198 | 1.791/2.550 |
| EoGB: preview including rating | 0.506/0.587 | 0.459/0.517 |
| EoGB: ordinary app hints | 2.523/2.817 | 2.605/2.791 |
| EoGB: solution walkthrough | 3.053/4.499 | 3.087/4.933 |
| BSEJ: preview including rating | 0.548/0.594 | 0.557/0.617 |
| BSEJ: ordinary app hints | 119.529/120.179 | 119.353/120.227 |
| BSEJ: solution walkthrough | 3.027/3.096 | 3.008/3.205 |
| Hyk5: preview including rating | 895.004/902.830 | 806.536/818.687 |
| Hyk5: ordinary app hints | 3.411/3.513 | 3.430/3.541 |
| Hyk5: solution walkthrough | 889.944/904.315 | 800.835/807.982 |
| Hafj: preview including rating | 104.609/105.160 | 104.702/105.233 |
| Hafj: ordinary app hints | 3.362/3.428 | 3.299/3.392 |
| Hafj: solution walkthrough | 102.731/103.767 | 102.516/102.715 |
| Ksy3: preview including rating | 1.472/6.632 | 1.448/6.825 |
| Ksy3: ordinary app hints | 0.243/0.250 | 0.248/0.271 |
| Ksy3: solution walkthrough | 3.745/4.089 | 3.701/4.124 |

The raw instance in this caller benchmark is shared across the source sequence. Its capacities after each source are:

| Source | Before bytes | After bytes |
| --- | ---: | ---: |
| clover | 4,980,736 | 5,308,416 |
| EoGB | 7,274,496 | 7,077,888 |
| BSEJ | 7,274,496 | 7,340,032 |
| Hyk5 | 7,274,496 | 7,340,032 |
| Hafj | 7,274,496 | 7,340,032 |
| Ksy3 | 7,602,176 | 7,602,176 |

Both sequences end at 7,602,176 bytes. Intermediate capacity changes depend on the complete request sequence. These values do not include the separate app-worker instances or host process memory.

The selected-technique profiler uses one unmeasured call and five measured calls. At Hyk5's stalled position, Nested Forcing Net changes from 217.079 to 176.533 ms median. Its complete proof list remains empty. All 119 selected-technique proof lists match. Quintuple Pattern Overlay remains about 52 ms and Tridagon Forcing Net remains about 44 ms. Those searches and broader worker costs remain in [issue 88](https://github.com/coder13/sudoku-app/issues/88).

## Correctness and integration

The comparison preserves 10,531 complete responses across 71 variant positions and 357 positive practice positions. It covers all 119 detector IDs. The corpus includes all six Entropic sources and every progressed Hyk5 stage. Another 148 complete Classic responses match across nine Tridagon practice positions. Catalogs, scores, complete proofs, traces, counts, custom orders, disabled searches and every hint page match without response normalization.

Native tests establish the intersection condition from the remaining source cells across all overlapping Classic house pairs and every removal subset. They include high cell bits, zero or one remaining site and unrelated removals. Separate tests establish cache coherence through inner and outer rollback. Existing independent inference replay and all twelve AI Escargot nested proofs pass.

Final local gates pass 346 native tests, sixteen feature combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript, 485 app tests and 292 Wasm contracts. The production/offline build preserves all 161 routes.

## Reproduction

Save an app Wasm build from main before rebuilding the candidate. Use separate Cargo target directories for separate source checkouts. Run correctness and build commands before timing requests. Run benchmarks sequentially.

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus
node --experimental-strip-types scripts/profile-variant-hints.mjs progressed-position.json results.json after.wasm
node --experimental-strip-types scripts/bench-xv-rating.mjs before.wasm after.wasm source-inputs.json
SUDOKU_BENCH_WASM=/absolute/path/before.wasm node --experimental-strip-types --test scripts/bench-entropic-app.mts
SUDOKU_BENCH_WASM=/absolute/path/after.wasm node --experimental-strip-types --test scripts/bench-entropic-app.mts
```

The profiler accepts an object with `position`, including entries and removals, or an original puzzle fixture. Source benchmark inputs use `{ "cases": [{ "name": "...", "position": { "puzzle": {} }, "solution": "..." }] }`. Use complete original puzzle definitions and their established solutions from the committed source fixtures. The `--entropic-corpus` flag expands comparisons between engines that both support Entropic Lines. The older `--entropic` flag expects the original catalog addition instead.

To reproduce all seven generation recipes, extend the committed five-family corpus with the original Renban and Entropic layouts:

```sh
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const recipes = await read('crates/engine/benches/fixtures/variants.json')
for (const [name, variantClues] of [['renban', 12], ['entropic', 8]]) {
  const { puzzle } = await read(`tests/fixtures/${name}-clover.json`)
  recipes.push({ name, template: { ...puzzle, givens: '0'.repeat(81) },
    givens: 30, variantClues, requiredRule: name })
}
await writeFile('/tmp/sudoku-forcing-recipes.json', JSON.stringify(recipes))
JS
node --experimental-strip-types scripts/bench-exact-houses.mjs before.wasm after.wasm --generation-only --recipes=/tmp/sudoku-forcing-recipes.json
```
