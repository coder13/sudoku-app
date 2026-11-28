# X-Sums app integration

Base: main `ffd80bd`. The native engine already supports ordered row/column X-Sums, exact solutions, human proofs, rating, teaching and targeted generation. This change integrates that family with the app. Rust, lockfiles, the app Wasm and its five generated JSON files are unchanged.

## Rule and complete source controls

An outside total adds the first X digits in its direction. The first digit is X and is included in the sum. An X of 1 gives a total of 1; an X of 9 gives 45. Standard row/column distinctness still applies. Native acceptance requires an ordered complete nine-cell edge-to-edge ray, an orthogonal direction and an integer total 1–45. A syntactically valid but impossible total, such as 2, remains a mathematical contradiction rather than a new rule interpretation. Diagonal X-Sums require different native support and stay in [204](https://github.com/coder13/sudoku-app/issues/204).

| Complete published control | Givens / totals | Independently checked completion | App-order human path |
| --- | --- | --- | --- |
| Philip Newman, [Double Digits](https://www.gmpuzzles.com/images/puzzles2026/260518-XSumsSudoku-DoubleDigits.pdf), 2026-05-18 | 12 / 10 | Unique, printed solution | Complete Hard, 3,036 points |
| Bill Murphy, [All Futures](https://www.gmpuzzles.com/images/puzzles2025/251030-XSumsSudoku-AllFutures.pdf), 2025-10-30 | 16 / 10 | Unique, printed solution | Complete Hard, 2,710 points |
| clover!, [The Scariest Thing](https://www.gmpuzzles.com/blog/2026/10/x-sums-sudoku-by-clover-3/), 2026-10-31 | 22 / 12 | Unique, printed solution | Complete Hard, 1,916 points |
| GenevieveArchbaker, [X sums #3, AsnF](https://sudoku.coach/en/s/AsnF), reviewed Coach export | 0 / 16 | Unique, source completion | Complete Hard, 5,514 points |

The first three fixtures preserve every printed given and total, ordered cell paths, directions, original grid/solution PDF URLs and SHA-256 hashes. All six PDFs were rendered and checked. Independent digit-set/permutation search verifies each complete source in one search node and matches its published completion. Native solving and all eight square transforms match those completions. No companion clue is removed to simplify import or solving.

The original AsnF SCv7 code stores the totals as text. The short-link importer uses the complete X-Sums declaration in the matching publication. The exact reviewed raw export is also recognized by its digest; both paths validate every label’s position and total. All sixteen clues match the independently checked manual transcription. Both source forms are archived in the test fixtures. [Coach interchange](https://github.com/coder13/sudoku-app/issues/7)

Two regression companions are explicitly authored: the complete Newman control plus matching Sandwich, Little Killer and Renban clues, and the repository Jigsaw/Killer benchmark with its existing outside clues plus four X-Sums. Their added clues are not attributed to the publishers. Both complete combinations have independently checked unique completions and complete app walkthroughs.

## App behavior

Native/shared import preserves every rule and parameter. Unknown semantics, malformed directions, partial rays and non-integer totals fail explicitly. The outside SVG shares the inner-cell viewport and grid-border inset with candidate links. All four edges, repeated clues, Jigsaw borders and diagonal companions retain separate gutters and accessible names. A mixed Sandwich/X-Sums puzzle prefixes totals with S/X and displays a visible legend. Single-family puzzles keep conventional numeric totals. Paused overlays hide the clues and legend from both visual and accessible content. Teaching crops retain the complete constrained rows/columns.

Local input support uses placed digits only, never pencil marks as proof premises. A table of 512 distinct-digit subsets checks each possible starting length, remaining prefix total and remaining row digits. Direct independent enumeration of all nine-digit permutations checks every total 1–45 against varied partial rows, including fixed and unknown lengths, repeated digits, impossible states and extremal clues. Both Pencil modes, bulk entry, conflicts and undo/redo follow that support. The shared Coach Sandwich decoder also now rejects array/null side values before interpretation; an array containing `top` must not be coerced and silently mapped to a different edge.

Actual worker callers verify candidates, multiple ordinary hints, selected technique proofs, every retained hint page, Finder counts, changed positions, disabled techniques, explicit removals, full solution replay, storage reload/history, sharing and all eight transforms. Independent proof replay enumerates the cited row's digit assignments and checks the first-digit length sum for every proposed placement/removal. The existing 80-point Hard technique and scoring version 8 remain unchanged. The real Learn diagram, three practice positions and a fresh drill retain outside clues and sound checked answers.

Desktop/mobile SSR covers all four source controls and both combinations. Twenty-eight static SVG renders cover light/dark 290/540px views, including all outside families, cages, irregular regions, crowded candidates and real BoardLinks. These use the actual clue SVGs with a reference grid; they are not live CSS layout or pointer/keyboard browser tests.

## Required New Puzzle generation

Three Hard recipes use the checked PDF layouts and printed completions. Native one-attempt calibration accepts twenty of twenty seeds per source within 20,000 nodes. All sixty results have thirty givens, complete Hard paths using X-Sums, independent uniqueness and multiple solutions without X-Sums; each source yields twenty distinct grids.

The actual app New Puzzle caller verifies twenty distinct independently unique/X-Sums-dependent Hard puzzles, several ordinary hints per puzzle, deterministic repeats and exclusion of played puzzles under every square symmetry. Mixed aliases and reordered clues cannot bypass those exclusions. Generation removes givens from fixed layouts and uses valid coordinate transforms; it does not claim arbitrary new outside-clue pattern discovery.

## Validation

All exact-head release gates pass in [CI 44487864316](https://github.com/coder13/sudoku-app/actions/runs/44487864316) on `a24241e`: 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants documentation, 619 app tests, 404 Wasm contracts, types/catalog and deployment. Local new-contract/benchmark TypeScript, the 123-component catalog, all 171 production routes and three actual-build offline checks also pass. All five generated JSON files and the packaged Wasm match pinned preceding main byte for byte. The local production build uses that already verified compiled artifact; no local native rebuild is claimed.

[PR 206](https://github.com/coder13/sudoku-app/pull/206) reached main at `973a4f3`. Fetched main contains the reviewed head and merge with identical shipping sources. The published X-Sums lesson returns two outside totals; its Linux-built Wasm is byte-identical to the preceding deployed release. Cross-host byte equality with the local Darwin build is not claimed. The isolated implementation checkout stays pinned to its reviewed head.

## Performance

Darwin arm64, Node 26.13.0, Wasm SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`, 3,416,046 raw / 893,636 Node-gzip bytes. No owned compiler, suite or second runtime benchmark ran alongside the controlled requests. Run `node --experimental-strip-types --test scripts/bench-x-sum-app.mts` in isolation. Fast operations use five warmups/twenty samples; app-order rating, hints, preview and walkthrough use two/five. p95 of five is the maximum. Assertions are outside timing. The in-process transport includes serialization/app conversion and excludes real worker startup, transfers, layout and paint; SSR excludes module loading. The later strict malformed-side guard does not change these valid controls or timed paths.

Values are median/p95 milliseconds. Raw rate uses the native default order; raw app-rate uses the actual app order. The selected exhaustive request enables only X-Sums; it must not be described as an all-technique exhaustive scan.

| Operation | Newman | Murphy | clover! | AsnF transcription | Authored mixed | Jigsaw mixed |
| --- | --- | --- | --- | --- | --- | --- |
| raw candidates | 0.406 / 0.444 | 0.243 / 0.258 | 0.420 / 0.446 | 1.585 / 1.603 | 0.395 / 0.437 | 0.544 / 0.565 |
| raw analyze | 1.069 / 1.134 | 0.928 / 0.949 | 1.118 / 1.143 | 5.262 / 5.369 | 1.069 / 1.092 | 0.960 / 1.011 |
| raw solve | 1.046 / 1.073 | 0.919 / 0.937 | 1.112 / 1.126 | 5.248 / 5.516 | 1.069 / 1.097 | 0.959 / 0.967 |
| raw rate | 1.935 / 2.062 | 1.318 / 1.416 | 1.037 / 1.099 | 17.279 / 17.570 | 2.635 / 2.760 | 0.730 / 0.746 |
| raw app-rate | 2.074 / 2.153 | 1.616 / 1.668 | 1.226 / 1.236 | 18.314 / 18.382 | 2.616 / 2.811 | 0.745 / 0.752 |
| raw ten hints | 0.698 / 1.064 | 0.548 / 0.583 | 0.500 / 0.559 | 2.787 / 2.906 | 0.698 / 0.708 | 0.595 / 0.613 |
| raw selected exhaustive hints | 0.603 / 0.608 | 0.470 / 0.476 | 0.584 / 0.600 | 2.737 / 2.741 | 0.583 / 0.613 | 0.604 / 0.612 |
| preview | 4.250 / 8.218 | 3.465 / 3.562 | 3.707 / 4.116 | 29.089 / 29.580 | 4.856 / 5.072 | 2.835 / 3.119 |
| play candidates | 0.382 / 0.393 | 0.241 / 0.252 | 0.424 / 0.463 | 1.598 / 1.682 | 0.400 / 0.421 | 0.525 / 0.550 |
| ordinary hints | 0.724 / 0.727 | 0.601 / 0.639 | 0.967 / 1.057 | 2.834 / 2.838 | 0.748 / 0.767 | 1.126 / 1.135 |
| walkthrough | 3.528 / 4.096 | 2.882 / 3.546 | 2.059 / 2.278 | 20.529 / 20.678 | 4.093 / 4.371 | 1.855 / 1.916 |
| input with all candidates | 0.059 / 0.075 | 0.042 / 0.048 | 0.030 / 0.035 | 0.086 / 0.127 | 0.099 / 0.105 | 0.187 / 0.376 |
| Board SSR | 1.677 / 2.124 | 0.907 / 1.148 | 1.821 / 1.907 | 1.814 / 2.068 | 0.891 / 1.135 | 1.427 / 1.516 |

Fixed-template Hard generation measures 12.383/14.163 ms with six attempts and 20,000 nodes per exact check. All twenty-five warmup/timed outcomes are distinct and independently unique/X-Sums-dependent. Actual Hard New Puzzle measures 13.416/18.375 ms; independent assertions are outside timing.

Retained raw-instance Wasm capacities are newman: 1,572,864, murphy: 1,572,864, clover: 1,572,864, coach-transcription: 1,638,400, mixed: 1,572,864, jigsaw-mixed: 1,507,328 bytes. Ordinary hints return ten choices for every benchmark source. These capacity snapshots are not peaks or full worker/JavaScript heap measurements.

### Unfinished broad exhaustive scan

A separate full all-app-order hint request on Murphy did not finish during observation. The benchmark was still in that stage at 103 seconds total process elapsed time and 103.84 seconds CPU. Its verified parent/child were intentionally terminated, their terminal handle and absent processes checked, and the stage log retained as `benchmark-unbounded-aborted.log`. This is not a completed timing sample or successful request. The final benchmark explicitly measures selected X-Sums exhaustive hints instead. [192](https://github.com/coder13/sudoku-app/issues/192) retains the complete source/request for bounded technique profiling, proof completeness and cancellation/responsiveness work. No enabled technique is removed to conceal this case.

A follow-up probes all 116 technique IDs from the actual app order in separate cold processes, with a three-second whole-process budget each. Exactly one request, `quintuple-pattern-overlay`, fails to finish within that budget; its owned process is terminated and waited. The other 115 requests return normally; their largest measured operation time is 35.536 ms, excluding process/Wasm startup. This narrows the likely bottleneck without establishing the unfinished request's result, completeness or true latency. Full records remain in the session's `bounded-probes.json` and issue 192. No production code or default order is changed by this profiling.

### Completing Murphy’s all-technique scan

Main at `f1b25e6` still hit a 120-second limit on Murphy’s original opening. A second scan gave each of the 116 app-order detectors its own process and three seconds. Quintuple Pattern Overlay was the only detector to reach that limit. A diagnostic scan over the other 115 detectors returned 174 hints. The request uses Hard, a choice limit of 4,294,967,295, and all sixteen givens and ten X-Sums clues in the source. [Issue 88](https://github.com/coder13/sudoku-app/issues/88) · [Issue 192](https://github.com/coder13/sudoku-app/issues/192)

The native diagnostic reached a group with identical domains for 1, 3, 5, 7 and 9. Each digit had 65 allowed cells and the same 1,664 nine-cell layouts. Earlier witnesses covered 57 cells. The old fallback tried to prove each remaining cell impossible for each digit. On this group, the five layouts can be assigned to the digits in any order. A complete packing therefore supports each cell it contains for all five digits. The new fallback tests pairwise disjoint layouts with a bitset table and visits each group of followers in increasing layout order. The table is limited to 512 KiB. The general exact search handles larger domains and groups with different layouts.

The independent integer check built nine-cell layouts from column permutations and partitioned balanced sets of occupied cells into five layouts. It recorded nine complete witnesses covering all 57 supported cells. The other eight cells admit no set with five occupied cells in every row, column and box. Each of the five proof choices rules out one odd digit in R1C5, R3C5, R5C1, R5C3, R5C7, R5C9, R7C5 and R9C5.

Rows 2, 4, 6 and 8 contain exactly five empty cells, so their five odd digits must occupy every empty cell. That accounts for four odd places in column 5. Box 5 also has only five empty cells, including R5C5. This fills column 5’s fifth odd place. Columns 1 and 3 have two odd places left between them after those same four rows. Boxes 1 and 7 each still need three odd digits. Each has only two remaining cells in column 2, so each needs one of the last two odd places in columns 1 and 3. The same count in boxes 3 and 9 fills the two remaining odd places in columns 7 and 9.

The 19 Murphy controls matched in full, including the 90-step Hard trace at 2,710 points, the disabled profile, the progressed position, and an explicit candidate removal. The one-node exact solve and uniqueness requests both reached their budget. A one-point increase in the first printed clue made the position unsolvable on both builds. The retained overlay comparison matched 640 full replies on 30 positive practice positions and 13 corpus positions, including forcing proofs and paged results. Another 160 seeded generation requests matched across eight recipes, with six attempts and 20,000 nodes per request. Scoring version remains 8.


The long baseline run and candidate run both returned 179 choices, with identical actions, evidence and order. That includes all 174 choices from the diagnostic scan and all five Quintuple Pattern Overlay choices. The complete response SHA-256 is `e8686ce01a25f5c622e87bf0617caebb171a2e2daf7771e03a7e73279511021b` after the transport ID is removed. Separate complete runs took 887.852 s on the baseline and 0.869 s on the candidate. These samples ran on different cores of the same host while other validation jobs were active. Both runs used 10,158,080 bytes of Wasm linear-memory capacity. Peak process RSS was 135,456 and 135,272 KiB, respectively.

The controlled serial run pinned both builds to logical CPU 6 and alternated order. Its 30-second limit applied after the request process was ready. The baseline reached that limit in all four rounds. The candidate took 631.0 ms cold. After three ordinary ten-hint requests, its median was 593.2 ms and its p95 was 598.7 ms across three samples. Every finished response matched the complete baseline. The observed 887.852-second sample above gives a separate complete baseline measurement.

### Current full-scan verification

On 2026-11-27, the permanent import worktree reran the same full 127-technique app-order request on Darwin arm64 with Node 26.13.0 and Wasm SHA-256 `900036b79f8cbf43cb90ba9043445ecc30d1170f7ae8fc9b2661288369700a53`. The reproducible command is `node --experimental-strip-types scripts/profile-x-sum-murphy-exhaustive.mjs`. After two warmups, five measured requests had 261.521 ms median and 270.833 ms p95. All five returned the same 179 choices, including the five complete Quintuple Pattern Overlay proofs. This is a current single-host observation, not a new before/after claim; Wasm instantiation and worker startup/transfer are excluded.

The retained controls used two warmups and ten samples. The empty HCHW step-22 median/p95 changed from 49.793/54.019 to 51.157/55.244 ms. Positive Classic Quadruple Pattern Overlay changed from 37.911/42.469 to 40.440/49.195 ms. The 19 paired cases preserve their complete results, including empty replies. The 30-second-capped comparison records the slow-case lower bound separately from the retained timing regressions.

The baseline was built from `f1b25e63c7c6b5977278a94e2e83c0fb55fee5c1` and the candidate from `1fc28653c4b650042014257d91e769171d444abf`. Both were stripped release app builds with Rust/Cargo 1.92.0 on Linux x64, Ryzen 7 7840U, kernel 7.1.8-arch1-3 and Node 22.23.1. App Wasm changed from 3,718,817 to 3,689,139 raw bytes and from 985,075 to 980,803 gzip bytes. See [measurement checksums](docs/measurements/murphy-overlay.json).

Run the commands from the candidate checkout with each build in its own Cargo target directory. Use a new record file for each scan.

```sh
cargo rustc --offline --locked --lib --release -p sudoku-app-engine --no-default-features \
  --features wasm-api,variants,generation,teaching --target wasm32-unknown-unknown -- -C link-arg=--strip-all
node --experimental-strip-types scripts/profile-exhaustive-hints.mjs \
  tests/fixtures/x-sum-murphy.json baseline.wasm baseline-full.jsonl full 1200000
node --experimental-strip-types scripts/profile-exhaustive-hints.mjs \
  tests/fixtures/x-sum-murphy.json candidate.wasm candidate-full.jsonl full 10000
node --experimental-strip-types scripts/profile-exhaustive-hints.mjs \
  tests/fixtures/x-sum-murphy.json baseline.wasm baseline-each.jsonl each 3000 3
```

The 115 cold detector requests that finished on both builds match in full. Several forcing-net requests returned an empty list. The app-order rating and walkthrough finished within 30 ms in the diagnostic controls, so they did not justify a second optimization on this fixture. The full-hint and forcing controls preserve the same costs and order. [Merged PR 267](https://github.com/coder13/sudoku-app/pull/267)

### Existing families and package cost

An alternating paired run compares the preceding Little Killer app with this integration for Between, Region Sum, Clone, Sandwich, Little Killer, Classic, Killer and Diagonal controls. Input positions and complete SSR output match exactly. Each operation has ten warmups/forty samples. Input median differences range from -0.000917 to +0.001458 ms; SSR medians range from -0.013916 to +0.019875 ms. Slower tails remain visible: Between SSR p95 changes 1.104→1.336 ms, Clone 1.260→1.379 and Sandwich 1.158→1.283. This does not establish a general speedup.

Summed production `dist/client/assets`, per-file Node gzip at its default level: JS changes 6,269,903/2,071,696→6,274,466/2,072,929 raw/gzip bytes (+4,563/+1,233); CSS changes 301,338/41,666→301,614/41,717 (+276/+51). Wasm changes by zero bytes. This asset-only comparison excludes HTML and service-worker files.
