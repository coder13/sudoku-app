# Between Lines app integration

Baseline: main `ff9c9b942d533b40d18557a743f378041bae1d92`. The native rule, 23-point Easy technique, proof formatter and three practice examples already exist. This change exposes that family in the app and New Puzzle without changing Rust, scoring version 8, technique order or the worker protocol.

## Rule and source controls

Every interior digit is strictly between the two endpoint digits. Either endpoint can be smaller. Interior digits may repeat when houses and other rules permit it. A path contains at least three distinct cells. Touching paths remain independent.

The original source fixtures retain complete givens, ordered paths, companion rules and printed completions:

| Control | Source | Preserved clues | Independent unique solution |
| --- | --- | --- | --- |
| Philip Newman, Between, the Lines | [Puzzle and solution](https://www.gmpuzzles.com/blog/2026/08/between-lines-sudoku-by-philip-newman/) | 14 givens, 8 paths | Matches printed completion, 1 search node |
| Raumplaner, Between the Dots | [Original Coach export](https://sudoku.coach/en/s/9KxH) | 0 givens, 12 paths, 11 black dots | Matches supplied completion, 201 search nodes |

The Newman grid and solution PDF SHA-256 values are `409ce0be75139565204c8409389b8fb78fc57d81269c71609b7dbdebc24da66c` and `0127e224985db5e4c54b0028e828210b0d175f9673fc84f25bd8fafa6184b3a4`. Both PDFs were rendered and visually checked. The Coach fixture preserves its full original compressed code. Its versioned compiler `jCfXtZs-1776367508519.js`, SHA-256 `567c7f9023cfff3a7f8feb4f8393d3b10a1f85f9539ef48f31c577b105ad521f`, compiles each `betweenLine` segment as an independent Between constraint.

The independent test oracle searches numeric assignments using houses and endpoint/interior relations. It does not call native candidates, validation, solving or rating. Tests also enumerate every partial three-cell assignment in both orientations against a separate complete-triple truth table. They cover repeated interiors, wrong endpoints and unrelated cells.

## App behavior

The app accepts native/shared Between definitions and Coach `betweenLine` segments. Unknown semantic settings and segment parameters are rejected. Existing cosmetic line/bulb settings are accepted. This does not add another interchange format.

Endpoint circles and original paths appear in the shared clue renderer. Endpoint/interior cell descriptions identify the other circle or both circles. Shared edges retain separate line lanes; endpoint circles render above those overlays. Native paths that skip cells use dashed connectors and explicit interior dots so crossed, unmarked cells do not become implied constraints. Light/dark clue SVGs were rasterized and inspected at 290 and 540 pixels, including full sources, overlapping families and separated paths. Desktop/mobile component output is checked with SSR. Live browser layout, paint, pointer and keyboard inspection was not performed; existing board and picker controls are reused.

Placed-digit support is local to each line. It intersects Global Entropy support when both families are present. Endpoint peers remove equal digits; unrelated interior cells do not become peers. Both Pencil modes and bulk entry retain compatible notes, and undo/redo restores positions. House-only masks used to replay human proofs remain house-only; native candidates enforce the complete rule set.

Real app callers cover import preview, exact solutions, several hint choices, Technique Finder counts, full hint pages, stale collection release, enabled/disabled techniques, walkthrough replay, storage reload, history, sharing after progress and practice answers. All eight grid symmetries retain the source constraints and unique completion.

| Source | App rating | Human path | Opening choices |
| --- | --- | --- | --- |
| Newman | 958 points, 77 steps, Easy | Complete | 8 |
| Coach 9KxH | 1,921 points, 62 steps | Partial | 10 ordinary; 23 exhaustive |

The partial Coach walkthrough remains partial. Exact solution access verifies its unique completion. A solved grid is not substituted into an incomplete human trace.

## New Puzzle

Between Lines has a visible New Puzzle choice, clue preview, and checked Easy and Medium recipes. Geometry uses the attributed Newman source, with a fixed compatible completion from which the native generator removes givens. This is fresh given selection on a fixed layout; it does not claim to invent new line geometry or solved grids.

- Easy: twenty of twenty trial seeds produce distinct thirty-given puzzles. Each is independently unique and has multiple solutions when Between rules are removed.
- Medium: nineteen of forty one-attempt seeds succeed within the 20,000-node budget. All nineteen are distinct, independently unique and need Between. Successes have 10–28 givens. Seeds 11, 16 and 39 supply three checked fallback recipes.
- The real app path is checked for both levels. Deterministic requests reproduce their result. A Medium fallback regression checks played-puzzle exclusions and all eight square symmetries, including a valid saved `mixed` label for a pure Between definition.

Generation now passes complete played definitions to the native exclusion mechanism. The old client fallback could return a rotated version of a played puzzle and ultimately return a duplicate. That behavior was reproduced against the former policy. The replacement preserves bounded attempts and reports exhaustion instead of returning an excluded puzzle. No speedup is claimed by comparing a valid result with the old invalid duplicate.

The thirteen older import-only families still require generation integration under [issue 189](https://github.com/coder13/sudoku-app/issues/189). Their work is required by the confirmed parity scope.

## Performance and package size

Measured on Darwin arm64, Node 26.13.0, with the existing app Wasm. Run `SUDOKU_BENCH_FAMILY=between node --experimental-strip-types --test scripts/bench-entropic-app.mts`. No compiler, test suite or other owned benchmark ran concurrently. Request timings include serialization and app conversion, with an in-process test worker. They exclude worker startup/transfer, layout and paint. Fast paths use five warmups and twenty samples; app rating/preview/hints/walkthrough/generation callers use two warmups and five samples. The p95 of five samples is the maximum. Assertions and independent numeric checks are outside timing.

Times are milliseconds, median / p95:

| Operation | Newman | Coach 9KxH |
| --- | --- | --- |
| Native candidates | 0.030 / 0.034 | 0.032 / 0.042 |
| Unique-solution check | 0.096 / 0.099 | 2.589 / 2.939 |
| Exact solve | 0.067 / 0.081 | 1.743 / 1.762 |
| Native default rating | 0.162 / 0.199 | 0.268 / 0.280 |
| App rating | 0.190 / 0.225 | 298.162 / 300.899 |
| Raw ten-choice hint request | 6.689 / 7.029 | 0.133 / 0.144 |
| Exhaustive hint request | 6.668 / 6.753 | 9.715 / 9.752 |
| Import preview, including rating | 0.354 / 0.370 | 305.844 / 306.700 |
| Play candidates | 0.023 / 0.025 | 0.033 / 0.042 |
| App hint choices | 7.096 / 7.166 | 0.185 / 0.196 |
| App solution walkthrough | 1.252 / 1.749 | 301.845 / 302.401 |
| Input with all candidates | 0.077 / 0.143 | 0.115 / 0.137 |
| Board SSR | 1.791 / 1.977 | 1.829 / 2.276 |

The harder Coach rating is materially slower than the native default because it runs the broader app technique order. It remains an audit target; no speed gain is claimed here. Observed Wasm capacities after these request sequences are 1,572,864 and 3,276,800 bytes; these are retained capacities, not live allocation peaks.

Twenty fixed-layout, thirty-given generation requests all succeed with twenty distinct independently checked results: median 8.422 ms, p95 27.615 ms, six attempts and 20,000 nodes per exact check, no warmups. Deterministic repeats are outside timing. The actual New Puzzle path at seed 2 measures 0.999 / 1.056 ms for Easy and 11.779 / 11.813 ms for Medium, including its fresh request and bounded fallback behavior. Calibration yield and timing samples are separate measurements.

Both pinned-baseline and final production builds use the same dependencies and native artifact. Their client asset totals, with Node `gzipSync` applied per asset, are:

| Asset group | Baseline raw / gzip | Between raw / gzip | Change raw / gzip |
| --- | --- | --- | --- |
| JavaScript, 21 files | 6,241,795 / 2,063,916 | 6,245,568 / 2,064,706 | +3,773 / +790 |
| CSS, 1 file | 295,908 / 40,681 | 296,282 / 40,748 | +374 / +67 |
| App Wasm | 3,430,109 / 898,293 | 3,430,109 / 898,293 | 0 / 0 |

Wasm SHA-256 remains `d5bf3ebcd76528c51901498889bcd6d35ef1d9487051a147b6463b794abfd045`. Rust sources are unchanged. The production/offline build passes with 171 prerendered routes. TypeScript, the 120-component catalog, all 547 app tests and all 330 Wasm contracts pass on the final implementation.

## Release

[PR 190](https://github.com/coder13/sudoku-app/pull/190) merged at `30bbd857c3fb86a36055498d276cc5ce58e137a6`, closing issue 63. Reviewed head `f459103cb39c4e79fa59da8e69279c08104f4b28` passed both jobs in [CI run 44447946113](https://github.com/coder13/sudoku-app/actions/runs/44447946113), with 366 native tests including seven Cargo doc examples, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, 547 app tests and 330 Wasm contracts. Header and deployment checks also passed. Completed job logs confirm the counts. Read-only HTTP confirms the deployed Learn page renders the new endpoint clues; this does not replace live interaction review.

Fetched main contains both the reviewed head and merge commit. Its Rust, app sources, scripts, tests, public assets and dependency files match the tested head exactly. The original dirty R&D checkout remains at `63116cc` with its 39 working-tree entries preserved. Remaining six native UI integrations, required generation for thirteen older import-only families, authored-source semantics, other formats, live viewport review and the broader performance audit remain open.
