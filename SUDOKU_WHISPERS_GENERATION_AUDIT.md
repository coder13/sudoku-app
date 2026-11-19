# Whispers New Puzzle integration

Base: main `fe23ae4`, with reviewed Odd/Even shipping source `c6d583c`. Release is pending. Existing Whispers import, numeric minimums, clues, candidates, hints/Finder, exact and human solutions, Learn/practice, mixed rules and persistence stay integrated. This change adds Medium New Puzzle with explicit German/Dutch rulesets and fixes equivalent-path played-puzzle exclusions. The 27/39-point Medium techniques, scoring version 8 and lockfiles remain unchanged.

## Rules and source fidelity

Neighboring digits on a German line differ by at least 5; Dutch uses at least 4. The same digit can appear in nonneighboring cells if other rules allow it. A line's numeric minimum, rather than its color or name, defines its rule. Custom and mixed minimums remain supported through import and play.

The complete published control stays Philip Newman's [Brain Zaps](https://www.gmpuzzles.com/blog/2026/01/german-whispers-sudoku-by-philip-newman-5/), retaining all three givens, all four ordered paths, minimum 5 and printed completion in `whispers-brain-zaps.json`. Existing original Coach exports, closed walks, XV/mixed companions and rejected unsupported whole-source controls stay unchanged. The generation fixture records every original path geometry and its provenance. Blank templates sample fresh completed grids and givens; the minimum-4 preset is a separate generated Dutch experiment, not a transcription of the original publication.

## Player flow and generation

Whispers is one family in the chooser. A shared native-radio selector explicitly chooses German or Dutch and explains its numerical rule on both New Puzzle steps. The actual shared line renderer supplies the preview; Dutch retains its printed ≥4 label. Queries, Continue/Back destinations, preferences and generated titles retain the chosen preset. The existing game schema still stores the complete rules under `whispers`; no incompatible family IDs are introduced. Pure Whispers sources/generated games retain their style in next-puzzle and change-difficulty actions. A mixed/custom minimum is not mislabeled as a pure preset. Old preferences acquire a valid default and unrelated variants discard nonapplicable preset fields. Explicit invalid generation requests reject rather than silently choosing another family’s preset.

A typed optional recipe minimum uses the existing native Whispers template API. Default generation is German; a selected style filters fresh and fallback recipes consistently. Each request uses one attempt, an initial 20,000-node exact-check bound and at most twenty givens, then checked fallback seeds and played-puzzle exclusions. There are thirty independently checked recipes per style, sixty in total, with distinct givens across both styles.

One-attempt seeds 1–100 at twenty givens accept 54 distinct German and 81 Dutch Medium puzzles; at twenty-four givens the results are 54/89. Earlier forty-seed thirty-given controls yield 21/34 Medium. Easy probes at thirty/thirty-six givens yield no acceptance in that finite sample. Both existing rule techniques are Medium, and their costs are preserved; failed samples do not prove all Easy puzzles impossible.

Every checked recipe and thirty successive actual app results per style have independently unique completions, multiple solutions without Whispers, correct neighboring numeric differences and full app-order Medium paths. Every basic Whispers action is independently checked against assignments satisfying its cited line/domain premises; line/house support proofs exhaust the written rules and named houses. All other actions agree with the independent completion. The full app-order points, counts, hardest technique and status match generation's advertised result. Every generated game offers several sound hints. Determinism, a known fresh miss/fallback for each style, storage reload, undo/redo, exact solutions and shared import pass.

## Equivalent played puzzles

The app tests exposed an existing native exclusion gap for reversed line paths. The private generation key now treats Whispers as undirected neighboring edges, coalescing duplicates and retaining the strongest minimum for an overlapping edge before all eight geometric transforms. Reversed paths, reordered or split lines, repeated/redundant edges and mixed aliases therefore exclude the same logical puzzle. Different minima or edge sets remain distinct. Directed Thermometers retain their existing identity.

This normalization affects exclusion keys only. It does not rewrite source/output paths, clue counts, proof indices or public canonical definitions, and it does not change candidate propagation, deductions, scores or technique order. Native tests check equivalent transforms and necessary-premise near misses; actual app tests exercise all eight transforms and the reversed/split/redundant representations for each style.

## Validation status

Local checks pass 371 native tests including seven Cargo examples, 645 app tests, 458 Wasm contracts, strict app/new-contract/benchmark types and the 124-component catalog. The final Wasm is freshly rebuilt, and all five generated metadata JSON files match the preceding release. Actual New Puzzle SSR checks cover selected radios and complete Continue/Back query paths. Light/dark 290/540px references use the real shared SVG and its CSS. These are static/component checks, not a live browser keyboard, layout, paint or interaction audit.

Production prerenders 171 routes and passes all three offline checks, including equality with the tested fresh Wasm. Review hardened malformed explicit preset rejection; focused contracts and final types/catalog/production checks pass after that guard change. Exact-head CI/deployment and release are pending.

## Controlled measurements

Darwin arm64, Node v26.13.0, installed stable rustc 1.100.0. Each caller has five warmups and forty measured samples, with independent assertions outside timing and no owned compiler, suite or other benchmark alongside. The in-process worker adapter excludes real worker startup/transfers and browser rendering. Ordinary hint calls do not stand in for an exhaustive all-technique scan.

| Actual caller | Median ms | p95 ms |
| --- | ---: | ---: |
| Complete published import preview | 28.437 | 29.980 |
| Published candidates | 0.016 | 0.021 |
| Published ordinary hints | 3.218 | 3.495 |
| Published app-order rating | 0.326 | 0.373 |
| Published exact solution | 14.016 | 14.232 |
| Published human walkthrough | 1.310 | 2.018 |
| German New Puzzle | 3.906 | 14.892 |
| German known fresh miss and fallback | 12.143 | 12.324 |
| German with thirty played puzzles | 2.761 | 2.916 |
| Dutch New Puzzle | 3.902 | 70.315 |
| Dutch known fresh miss and fallback | 17.240 | 17.554 |
| Dutch with thirty played puzzles | 4.732 | 4.928 |

The varying-seed calls include fresh misses and checked fallbacks. With empty history, forty-five warmup/measured requests produce 27 distinct German boards and 34 Dutch. Separate contracts with played history verify thirty successive distinct results per style. The fixed-seed history measurement excludes thirty actual prior app results. The Dutch tail is retained; no general speedup or uniformly bounded latency claim follows from these samples.

All 465 preceding recipe requests remain identical. Two hundred complete paired legacy native responses match: 164 successes and 36 search limits. A separate same-toolchain comparison checks 475 complete response pairs: fifteen controls through initial, placed and explicitly removed candidate positions, forty direct Whispers generation requests, and ninety warmup/timed generation pairs with thirty checked exclusions. The direct Whispers requests retain 27 successes/thirteen search limits; the caller/position and timed pairs return values. Whole response bodies are compared with only transport IDs omitted. These totals include repeated timing inputs, not 475 distinct puzzles.

The correctly normalized exclusion key has a measured cost. For a fixed fresh request with thirty checked played puzzles, German native protocol generation changes from 2.415/2.564 ms median/p95 to 2.773/2.882, and Dutch from 4.255/4.339 to 4.589/4.682. Forty alternating paired samples follow five warmups. The roughly 0.33–0.36 ms median overhead buys the required equivalent-edge exclusion behavior; it is not a performance improvement. After the corpus/timed calls, both instances retain 4,849,664 bytes of Wasm linear memory. That is capacity, not live allocation, process RSS or a long-run leak test.

Input positions and complete Board SSR strings remain identical across fifteen controls. Ten warmups and forty alternating samples put input medians at 0.013–0.206 ms before / 0.013–0.209 after, and SSR at 0.739–1.287 / 0.739–1.294 ms. Individual tails vary. These observations support compatibility without establishing an input/render speedup; SSR does not measure browser paint.

## Build and package

Both the preceding `c6d583c` engine and the changed engine are rebuilt with the same installed stable toolchain and app profile for native comparisons, into isolated targets/outputs. The original shipping artifact and source checkout remain intact. Fresh baseline Wasm is 3,416,110 raw / 893,618 default-Node-gzip bytes, SHA-256 `6fecc74dc59174ba9c003578210e0149a05a67ef6f2c2ad8c5328921e165d480`; changed Wasm is 3,396,953 / 892,775, SHA-256 `5e46c19112ec78cf40d718a258d01dac2e1e47627cd893ec32c7ea69bc5744b8`. The measured same-toolchain delta is −19,157 raw / −843 gzip bytes. Build paths and optimizer/code-generation effects can influence these observations; no general binary-size optimization is claimed.

Compared with the preceding retained production build, client asset sums are JavaScript 6,307,856 raw / 2,076,693 gzip (+10,737 / +1,045), CSS 303,032 / 41,971 (+877 / +135) and Wasm 3,396,953 / 892,775 (−19,093 / −861). Totals sum default Node gzip per client asset and exclude HTML/cache manifests. All five metadata JSON files and Cargo/package lockfiles remain byte-identical. CI will independently build the capability matrix, all four profiles and strict Cargo documentation. The original dirty R&D worktree is untouched. Nine older New Puzzle families remain after Whispers ships; issue 189 stays open for them. Authored Coach formats, other rule research and human/performance gaps remain separate under issues 7, 35, 88 and 192.
