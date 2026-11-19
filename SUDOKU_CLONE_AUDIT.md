# Clone app integration

Baseline: main `a9ee37952f406d93a2949adcbbb236276566e75d`. The native Clone rule, 17-point Easy technique, proofs and three practice positions already exist. This change adds app acceptance, visible/accessibly labelled clues, complete play/help flows and Easy New Puzzle recipes. Rust, engine dependencies, scoring version 8, costs and technique orders are unchanged.

## Complete source controls

| Control | Original definition | Independent result | App human path |
| --- | --- | --- | --- |
| Bill Murphy, [Legs in a Snare](https://www.gmpuzzles.com/blog/2026/03/clone-sudoku-by-bill-murphy-2/) | 20 givens, two pairs of six-cell shapes | Unique printed completion, one search node | Complete Easy, 824 points, 71 steps |
| Philip Newman, [Hello There](https://www.gmpuzzles.com/blog/2026/04/clone-sudoku-by-philip-newman-2/) | 12 givens, two pairs of seven-cell shapes | Unique printed completion, one search node | Complete Easy, 1,136 points, 89 steps |
| Authored mixed Murphy control | Complete original Clone puzzle plus one thermometer, two dots, odd cells and a sum-7 cage | Unique original printed completion | Complete Easy, 824 points, 71 steps |

The original grid/solution PDFs were rendered and checked. Fixtures retain publication/author links, PDF links and SHA-256 values. Grid/solution hashes are `8fafb54a83b3bb03d1466292542103ef550fd50bd6184cb8d2310c223b39fe99` / `a6000f4a5e0620572818b74e84c2c303a591ac928ada203ed84d92ad34f8d222` for Murphy and `2220375d65d22db8e140a78c5cce58ff579920ab69d159436e493612da38e503` / `54fcb7348696fdfee7f75c55591ce9b42dd51c194a3f994b30d48220ee80836f` for Newman. Independent numeric search uses direct equality relations and Sudoku houses; completed-grid checks read every rule directly. Removing Clone admits multiple solutions for both published controls. The mixed fixture explicitly identifies its additional clues as authored test data.

## Equality, presentation and play

Native `clone.groups` contains sets of corresponding cells sharing one digit. A set may contain more than two cells, and sets may overlap. Different positions within a shape may repeat digits when their houses allow it. A private layout helper compiles the immutable clues into transitive equality sets, with a weak cache keyed by the rule array. Stable letters follow first-visit order and survive all eight grid transforms. Every declared cell remains shaded; a letter identifies each matching set, including disconnected cells and overlapping copies. The source shape families retain separate tints. Cell descriptions and rule help list the actual matching addresses.

Candidate cleanup restricts matching cells after a placement; it does not place their digits automatically. Contradictory matching placements are marked as conflicts. Both Pencil modes, bulk/individual input and history are checked. All 10,000 partial four-cell states are compared with direct complete equal-digit assignments, including a chain through two overlapping rules. Literal coordinate controls verify all eight orientations, independent of the transform implementation. Different letters can repeat the same digit.

The grid reserves a lower strip for letters. Shared candidate-link geometry receives the actual Clone/cage candidate insets, keeping advanced chains attached to candidate centers. Cell-center links keep their centers; Classic candidate positions retain their existing coordinates. Tests check literal candidate centers and the rendered, trimmed link direction for a cell with both a Clone label and cage total. Shared grid, navigation and input controls remain in use. The component catalog and three Storybook cases cover published shapes, compact candidates and overlapping clues.

Static clue renders were inspected in light/dark themes at 290/540 pixels, including both published shapes, dense candidates, two-letter labels and companion clues. These are actual clue SVGs over reference grids. SSR checks the desktop/mobile grid, all 81 cell roles and every candidate button. Live browser layout, pointer and keyboard review was not performed.

## Import and remaining format work

Native/shared puzzle links preserve every equality set and companion rule through preview, storage, sharing and transformations. The new f-puzzles decoder preserves parallel `cells` / `cloneCells` positions in raw JSON, compressed codes, f-puzzles URLs and encoded SudokuPad f-puzzles URLs. Tests construct typed exports from the checked native controls and verify complete preview/solution/hint flows. Missing partners, repeated shape cells, invalid coordinates, unknown fields and unreadable custom rule text are rejected.

The typed schema was checked against official f-puzzles 1.11.3 [export/import code](https://f-puzzles.com/Import%20Export.js?v=1.11.3), SHA-256 `f24f048b4c34499603d3057f6b65d6d94f4354f8dfd028b18534433581a15e31`, and [Clone objects](https://f-puzzles.com/Constraint%20Objects.js?v=1.11.3), SHA-256 `3a32d070bb856c520bb6d37a4792503f75d907fcd3b5d2598eb671b26863e217`.

The authors' original online copies use colors and custom prose to define Clone. Newman's export also includes cages without totals. Their full original online codes and URLs remain in the published fixtures, and regression checks retain the explicit custom-rule rejection. These exports still need faithful authored-source interpretation in [issue 7](https://github.com/coder13/sudoku-app/issues/7). Establish the cage semantics before normalization. The independently transcribed PDF controls and constructed typed exports do not prove that the original online payloads are already importable. The inspected Coach compiler build has no named Clone entry, so this change adds no invented Coach decoder schema. General short-link resolution and other formats remain open.

## Hints, solutions and teaching

Both sources and the complete authored mix have ten ordinary opening hint choices and complete human walkthroughs. Every replayed placement/removal agrees with the independent printed completion. Selected Clone proofs are also checked directly against their cited equality sets and candidate premises: enumerate the nine possible equal-digit assignments, then verify every elimination or placement. Practice/drill proofs receive the same independent check. Native exact solving enforces all rules even with an empty human-technique order; explicit removal of a solution candidate makes the puzzle unsolvable.

The selected-hint flow preserves every page, action and collection release. Finder counts retain distinct actions before/after a placement. Dense authored equality clues exercise more than 32 selected proofs. Save/reload uses the actual storage module and checks progress, undo/redo and original shared data. The Learn article explains matching letters, permits repeats between different letters, links both published sources and keeps all three existing practice positions plus a fresh drill.

## New Puzzle

Only the checked Easy level is offered. Two attributed shape layouts and their compatible completions supply three bounded recipes. Generation carves fresh thirty-given puzzles from those layouts; it does not invent new shape geometry or solved grids. Each source's initial calibration succeeds on twenty of twenty one-attempt seeds. Independent numeric checks verify uniqueness, distinct givens and multiple solutions without Clone.

The real New Puzzle caller independently verifies twenty distinct Easy outputs across the recipe bank, complete logical solving and Clone use. Repeats are deterministic. Played-puzzle exclusions retain all eight square symmetries, valid `mixed` aliases and reordered equivalent equality sets. Native generation continues to accept its existing configurable targets through the engine API. Required generation for thirteen older import-only families remains in [189](https://github.com/coder13/sudoku-app/issues/189).

## Validation

Local checks pass 576 app tests, 359 Wasm contracts, TypeScript, strict typing of the new contracts, the 122-component catalog and the 171-route production/offline build. The additional numeric proof checks pass in the focused Clone suite. Rust sources and dependencies match main; the rebuilt app Wasm and all five generated JSON files are byte-for-byte identical to the released artifacts. Native response/scoring behavior therefore uses the same artifact. All exact-head native/feature, four-profile, documentation, app/Wasm and deployment gates pass; the release is recorded below.

## Performance

Darwin arm64, Node 26.13.0, app Wasm `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`. Reproduce with `SUDOKU_BENCH_FAMILY=clone node --experimental-strip-types --test scripts/bench-entropic-app.mts`. No other owned local build, test suite or benchmark ran during controlled measurements. Fast operations use five warmups/twenty samples, and app rating/preview/hints/walkthroughs use two/five. Assertions and independent checks are outside timing. In-process worker measurements include request/caller conversions and exclude startup, transfer, layout and paint. The p95 of five samples is the maximum. Raw hint requests use Medium; actual app hints use the puzzle's grade and candidate masks.

Milliseconds, median / p95:

| Operation | Hello There | Legs in a Snare | Authored mix |
| --- | --- | --- | --- |
| Candidates | 0.021 / 0.028 | 0.014 / 0.016 | 0.018 / 0.023 |
| Unique-solution check | 0.058 / 0.062 | 0.026 / 0.031 | 0.034 / 0.037 |
| Exact solve | 0.052 / 0.059 | 0.026 / 0.029 | 0.033 / 0.034 |
| Native default rating | 0.221 / 0.239 | 0.097 / 0.117 | 0.110 / 0.118 |
| App-order rating | 0.210 / 0.240 | 0.166 / 0.219 | 0.148 / 0.152 |
| Raw ten-choice request | 0.112 / 0.137 | 0.074 / 0.081 | 0.074 / 0.084 |
| Exhaustive request | 42.841 / 43.863 | 56.904 / 57.972 | 56.444 / 58.396 |
| Import preview with rating | 0.304 / 0.312 | 0.211 / 0.242 | 0.253 / 0.264 |
| Play candidates | 0.017 / 0.019 | 0.015 / 0.020 | 0.022 / 0.024 |
| Actual app hints | 0.184 / 0.213 | 0.118 / 0.131 | 0.148 / 0.161 |
| Solution walkthrough | 1.528 / 1.968 | 1.056 / 1.443 | 1.201 / 1.453 |
| Input with all candidates | 0.032 / 0.044 | 0.024 / 0.032 | 0.087 / 0.106 |
| Grid SSR | 2.075 / 2.638 | 1.980 / 2.558 | 1.167 / 1.385 |

Ordinary/exhaustive opening counts are 10/14, 10/98 and 10/102. Retained Wasm capacities after the cumulative request sequences are 4,063,232 / 5,701,632 / 5,701,632 bytes; these are not live allocation peaks or isolated per-puzzle requirements. The exhaustive table retains its 43–58 ms slow path.

Twenty fixed-layout generation seeds succeed with median 0.665 ms / p95 0.787 ms, six attempts and 20,000 nodes per exact check, with no warmups. Deterministic repeats and independent checks are outside timing. The actual Easy New Puzzle caller at seed 2 measures 0.689 / 0.798 ms with two warmups/five samples. Calibration and timing are separate runs.

A separate paired run alternates engine-independent app module order, with ten warmups/forty samples. The before module uses released Region Sum shipping sources, which match main `a9ee379`; the after module uses this Clone integration. Input checks compare the resulting positions. SSR measures server rendering, and its output includes the intended caption/link changes.

| Existing control | Operation | Before median / p95 | After median / p95 | Median change |
| --- | --- | --- | --- | --- |
| between | input | 0.0428 / 0.0742 | 0.0425 / 0.0738 | -0.0003 ms (-0.7%) |
| between | SSR | 0.9265 / 1.4853 | 0.9513 / 1.3237 | +0.0248 ms (+2.7%) |
| region-sum | input | 0.0625 / 0.0785 | 0.0641 / 0.0832 | +0.0015 ms (+2.5%) |
| region-sum | SSR | 0.8390 / 1.1724 | 0.8716 / 1.0030 | +0.0326 ms (+3.9%) |
| classic | input | 0.0127 / 0.0188 | 0.0125 / 0.0251 | -0.0002 ms (-1.6%) |
| classic | SSR | 0.8036 / 0.8765 | 0.8294 / 1.1193 | +0.0258 ms (+3.2%) |
| killer | input | 0.0500 / 0.0540 | 0.0500 / 0.0550 | -0.0000 ms (-0.1%) |
| killer | SSR | 1.2210 / 1.3321 | 1.2382 / 1.6810 | +0.0171 ms (+1.4%) |
| x-sudoku | input | 0.0315 / 0.0650 | 0.0311 / 0.0715 | -0.0004 ms (-1.3%) |
| x-sudoku | SSR | 0.9051 / 1.0119 | 0.9422 / 1.0109 | +0.0370 ms (+4.1%) |

This is a feature integration. The table retains increases, including the Killer SSR p95 increase. These small samples do not establish a broad speedup or latency guarantee. Native rating/search code is unchanged; the wider performance audit remains in issue 88.

## Package cost

The baseline is the integrated Region Sum production build whose shipping sources match main `a9ee379`. Both builds use the same dependencies and compiler; per-asset gzip totals use Node `gzipSync`.

| Asset group | Baseline raw / gzip | Clone raw / gzip | Change raw / gzip |
| --- | --- | --- | --- |
| JavaScript, 21 files | 6,251,601 / 2,066,310 | 6,255,947 / 2,067,557 | +4,346 / +1,247 |
| CSS, 1 file | 299,670 / 41,301 | 300,068 / 41,361 | +398 / +60 |
| App Wasm | 3,416,046 / 893,636 | 3,416,046 / 893,636 | +0 / +0 |

The four pending native UI families, thirteen older New Puzzle integrations, authored-source semantics, remaining formats and full R&D goal remain open.

## Release

[PR 195](https://github.com/coder13/sudoku-app/pull/195) merged at `193b336c2c06328671673e6a461e22979245bc64` after every check passed on reviewed head `3022cf5775e3925411fd6264792944624f4b7a77` in [CI 44467126537](https://github.com/coder13/sudoku-app/actions/runs/44467126537). Completed logs confirm 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants Cargo docs, 576 app tests, 359 Wasm contracts, TypeScript and the 122-component catalog. Deployment and header checks pass. The local production/offline build covers 171 routes.

Fetched main contains the reviewed head and merge with identical Rust, scripts, app, test, story, dependency and catalog sources. The isolated source worktree remains pinned. Read-only HTTP confirms the published shell, Clone lesson with both clue diagrams, service worker and its actual Wasm asset. The deployed artifact is byte-for-byte identical to the preceding validated deployment: 3,416,046 bytes, SHA-256 `f4f2a123db3a51b2d7873dc8354098204637dd402efa60ebad58b0e9accdc149`. These HTTP and static-render checks do not constitute live browser interaction review.

Issue 42 is closed. The original color/prose/unsummed-cage exports remain in issue 7. Four existing native UI families, thirteen older New Puzzle integrations, authored-source semantics, remaining formats and broader R&D remain open.
