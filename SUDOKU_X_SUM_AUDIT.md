# X-Sums app integration

Base: main `ffd80bd`. The native engine already supports ordered row/column X-Sums, exact solutions, human proofs, rating, teaching and targeted generation. This change integrates that family with the app. Rust, lockfiles, the app Wasm and its five generated JSON files are unchanged.

## Rule and complete source controls

An outside total adds the first X digits in its direction. The first digit is X and is included in the sum. An X of 1 gives a total of 1; an X of 9 gives 45. Standard row/column distinctness still applies. Native acceptance requires an ordered complete nine-cell edge-to-edge ray, an orthogonal direction and an integer total 1–45. A syntactically valid but impossible total, such as 2, remains a mathematical contradiction rather than a new rule interpretation. Diagonal X-Sums require different native support and stay in [204](https://github.com/coder13/sudoku-app/issues/204).

| Complete published control | Givens / totals | Independently checked completion | App-order human path |
| --- | --- | --- | --- |
| Philip Newman, [Double Digits](https://www.gmpuzzles.com/images/puzzles2026/260518-XSumsSudoku-DoubleDigits.pdf), 2026-05-18 | 12 / 10 | Unique, printed solution | Complete Hard, 3,036 points |
| Bill Murphy, [All Futures](https://www.gmpuzzles.com/images/puzzles2025/251030-XSumsSudoku-AllFutures.pdf), 2025-10-30 | 16 / 10 | Unique, printed solution | Complete Hard, 2,710 points |
| clover!, [The Scariest Thing](https://www.gmpuzzles.com/blog/2026/10/x-sums-sudoku-by-clover-3/), 2026-10-31 | 22 / 12 | Unique, printed solution | Complete Hard, 1,916 points |
| GenevieveArchbaker, [X sums #3, AsnF](https://sudoku.coach/en/s/AsnF), manually verified native transcription | 0 / 16 | Unique, source completion | Complete Hard, 5,514 points |

The first three fixtures preserve every printed given and total, ordered cell paths, directions, original grid/solution PDF URLs and SHA-256 hashes. All six PDFs were rendered and checked. Independent digit-set/permutation search verifies each complete source in one search node and matches its published completion. Native solving and all eight square transforms match those completions. No companion clue is removed to simplify import or solving.

The fourth source requires a clear format boundary. Its original SCv7 code contains only cosmetic text segments; the author description supplies their X-Sums meaning. The complete original code, decoded fields, source description and completion are retained in `x-sum-unsupported-AsnF.json` and remain rejected by automatic import. A separately labelled manual native transcription preserves all sixteen totals. It is not a typed Coach export or automatic prose decoder. Authored context, short links and other export schemas remain in [7](https://github.com/coder13/sudoku-app/issues/7).

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

Final local validation passes 619 app tests, strict app/new-contract/benchmark TypeScript and the 123-component catalog. The full Wasm suite passes 404 contracts; the final Sandwich/X-Sums regression rerun after the stricter import guard passes 26, followed by the generated-puzzle multiple-hint check. Production prerenders 171 routes and passes three actual-build offline contracts. All five generated JSON files and the packaged Wasm match pinned preceding main byte for byte. The local production build uses that already verified compiled artifact; no local native rebuild is claimed. Exact-head CI/deployment and release remain pending.

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

### Existing families and package cost

An alternating paired run compares the preceding Little Killer app with this integration for Between, Region Sum, Clone, Sandwich, Little Killer, Classic, Killer and Diagonal controls. Input positions and complete SSR output match exactly. Each operation has ten warmups/forty samples. Input median differences range from -0.000917 to +0.001458 ms; SSR medians range from -0.013916 to +0.019875 ms. Slower tails remain visible: Between SSR p95 changes 1.104→1.336 ms, Clone 1.260→1.379 and Sandwich 1.158→1.283. This does not establish a general speedup.

Summed production `dist/client/assets`, per-file Node gzip at its default level: JS changes 6,269,903/2,071,696→6,274,466/2,072,929 raw/gzip bytes (+4,563/+1,233); CSS changes 301,338/41,666→301,614/41,717 (+276/+51). Wasm changes by zero bytes. This asset-only comparison excludes HTML and service-worker files.
