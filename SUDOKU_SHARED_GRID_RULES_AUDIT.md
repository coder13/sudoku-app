# Shared grid rules and layout audit

The shared layout and rule contract follows the grid foundation in [#224](https://github.com/coder13/sudoku-app/issues/224) and the combined-rule requirements in [#87](https://github.com/coder13/sudoku-app/issues/87). This worktree uses the same diagonals, parity, thermometers and Renban rule definitions on rectangular boxes and explicit connected regions. The sized solver derives houses, candidate masks, path lengths, and assumption work from the layout. The 9×9 variant solver still serves its existing protocol, and saved 4×4 Algebraic Cages keep their existing response format.

## Remaining engine work

Use one puzzle definition with explicit regions and an ordered rule list. Compile rule payloads against the layout's digit range, houses, adjacency, and cell IDs. Keep the 9×9 solver as an optimized backend during migration. The sized compiler currently covers diagonals, parity, standard thermometers, and Renban. Each subsequent migration should use the same authored rule payload for rule checks, candidate propagation, hints, and replay. Import and generation should validate that the player can view and edit every rule in the puzzle before offering it.

Run each rule against multiple layouts through a shared conformance suite. Use both 6×6 box orientations and an irregular layout where region membership matters. Keep published grid-specific puzzles as import and UI regression cases, including a mixed-rule example with independently verified uniqueness. Measure both solver backends against the existing 9×9 controls before changing the default.

## Source and engine controls

- [TVDK’s published 6×6 Renban](https://sudokupad.app/f3ownh9dic) still imports with five paths and author credit. Chrome verified a hint, undo and redo, the complete solution, and a mobile share preview.
- The same Wasm Renban request checked candidates, uniqueness, exact solution, and replay on 4×4, both 6×6 layouts, both 8×8 layouts, 10×10, 12×12 and 16×16. A 5×5 irregular control composes Renban and parity. Independent enumeration found one completion with both rules and multiple completions with either rule removed.
- Michael Lefkowitz’s published 4×4 Renban imports through the normal short-link flow. Chrome checked all four clues, author credit, Technique Finder, hint application, undo and redo, reload, the final grid, and a mobile share. A separate two-line draft verified editing, saved rules, and sharing. [Published 4×4 puzzle](https://sudokupad.app/g0b07xt4eu)
- The compact SCL decoder preserves the Thermometer bulbs and Kropki overlays in the accompanying published samples. The authored rule checks stop imports when a puzzle has markings or semantics the sized solver cannot verify. [Beginner variant pack](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000GOJ)
- For 10–16 digits, each candidate interval uses perfect matching and alternating-cycle reachability. An independent enumerator checked sparse 4–7-cell lines, and a full 16-cell case checked an impossible set of three cells with only two digits.

## Wasm timings

Local app-profile Wasm builds, with paired alternating requests for the released and shared implementations. Warm results use 450 samples for sized positions and 220 for the 9×9 control. The timings include request serialization and response decoding.

| Puzzle and operation | Released median | Shared median | Shared p95 |
| --- | ---: | ---: | ---: |
| 6×6 original Renban uniqueness | 184 µs | 188 µs | 216 µs |
| 6×6 original Renban solve | 62 µs | 63 µs | 70 µs |
| 6×6 original Renban candidates | 8 µs | 9 µs | 10 µs |
| 6×6 original Renban first hints | 12 µs | 13 µs | 14 µs |
| 6×6 original Renban walkthrough | 1.37 ms | 1.39 ms | 1.47 ms |
| 9×9 Renban Clover walkthrough | 265 µs | 268 µs | 285 µs |
| 5×5 irregular with two rules walkthrough | — | 69 µs | 76 µs |
| 16×16 full-length line candidates | — | 18 µs | 19 µs |
| 16×16 full-length line walkthrough near completion | — | 348 µs | 381 µs |

The first hint request on an empty 16×16 control with a full-length Renban fell from about 152 ms to 5.3 ms after sizing the assumption work budget to the digit and cell counts. Both prototype runs found zero hints. The 6×6 budget stayed at 2,048 assumption steps.

On the published 4×4 Renban, 200 warm application calls measured 76 µs median for code decoding and 112 µs for decoding, uniqueness, solving, and building the preview. Candidates took 10 µs, Renban hints took 21 µs, and the 25-step walkthrough took 84 µs. The preview measurement starts with the fetched code and excludes HTTP latency.

## Compact Thermometer import

The published 4×4 Thermometer has four bulbs in a darker gray than the shafts. The compact importer uses the recognized strict-increase clause, the matching drawing styles, and the bulb's endpoint to orient each path. The existing 6×6 controls use matching shaft and bulb colors and keep both rectangular box orientations. The tests reject unsupported rule wording and bulbs that cannot identify an endpoint. [Published 4×4 puzzle](https://sudokupad.app/9ghz1vyiv0)

Chrome verified the four bulb locations, the hint and full solution, reload, and a phone share. A separate draft kept both thermometers through editing, undo, redo, saving, and sharing. The app-profile Wasm replay solved the publication in 24 steps and offered four Thermometer hints on the starting grid.

Warm measurements over 200 requests start with the fetched source code and exclude network latency.

| Operation | Median | p95 |
| --- | ---: | ---: |
| Decode | 93 µs | 142 µs |
| Decode, verify uniqueness, and build preview | 127 µs | 213 µs |
| Candidate masks | 11 µs | 16 µs |
| Technique Finder hints | 26 µs | 39 µs |
| Full replay | 77 µs | 141 µs |

## Kropki dots and explicit negative rules

The same pair support code applies to the sized and 9×9 solvers. The sized compiler derives orthogonal edges from the layout and builds each relation's support table once per compilation. A negative rule constrains an edge only when the author enabled that relationship and neither dot color marks the edge. Hints name the specific pair, dot relation, and whether the edge is unmarked.

Independent solving found one completion for each published 4×4 and 6×6 puzzle with its authored dots. Both had multiple standard completions and zero completions after adding implicit negative rules. Chrome verified five and ten dots respectively, author credit, hints, reload, final grids, and phone shares. The Mini editor check also covered two different dots on the same edge, undo and redo, and independent negative settings. [4×4 source](https://sudokupad.app/z58l737mye) · [6×6 source](https://sudokupad.app/izy7jz9hzh)

The following warm app-profile Wasm timings use 200 samples per operation and exclude network latency. Replay took 33 steps on 4×4 and 88 steps on 6×6.

| Operation | 4×4 median / p95 | 6×6 median / p95 |
| --- | ---: | ---: |
| Decode | 101 / 285 µs | 71 / 119 µs |
| Decode, verify uniqueness, and build preview | 140 / 217 µs | 1,085 / 1,339 µs |
| Candidate masks | 11 / 15 µs | 12 / 15 µs |
| Technique Finder hints | 22 / 32 µs | 28 / 31 µs |
| Full replay | 126 / 141 µs | 2,097 / 2,279 µs |

A paired 9×9 control with both negative rules produced identical candidate and hint responses in 400 samples. The old and new medians were 31 and 32 µs for warmed candidates, 104 and 105 µs for compilation and candidates, and 71 µs for hints in both builds.

## Labeled Difference with Renban

The published 6×6 Race track export has two six-cell Renban lines and three numbered Difference markers. The importer preserves labels 1, 2, and 3 as exact absolute differences. A Coach layer with only difference-of-one dots retains the Kropki representation and its existing negative rule. Other numbered Difference layers require positive markers. The importer rejects unsupported negative settings for these layers.

The shared pair solver checked the published grid and its transposed 3×2-box version. Both rule families together give one completion. Either family on its own leaves multiple completions. The wider-grid control also checks the largest possible difference on 4×4, 8×8, and 16×16.

Chrome verified the short link through the Worker, the three printed labels at their exact edge midpoints, both Renban lines, Technique Finder, hints, reload, the authored final grid, and mobile sharing. A Mini draft kept its Difference marker through keyboard editing, reload, undo, and redo. [Race track](https://sudoku.coach/en/s/9uMo)

The local app-profile Wasm benchmark uses 200 warm samples and excludes network latency. The published puzzle offered two Difference hints initially and replayed to the full answer in 45 steps.

| Operation | Median | p95 |
| --- | ---: | ---: |
| Read the Coach export | 101 µs | 257 µs |
| Read, verify uniqueness, and build preview | 210 µs | 456 µs |
| Candidate masks | 20 µs | 23 µs |
| Difference hints | 32 µs | 38 µs |
| Full replay | 256 µs | 278 µs |

## Arrow sums on sized grids

The published 6×6 Arrow puzzle has six bulbs and shafts. The importer matches each shortened path to its bulb and fills skipped cells along straight segments. It keeps companion Kropki dots in their own rule. Independent solving and the app-profile Wasm engine both reached the authored answer, which repeats a digit on one shaft. The exact solver verified both rectangular box orientations. A 16×16 control exercised a shaft as long as the grid's digit range. [Published Arrow puzzle](https://sudokupad.app/68v1n4di20)

Chrome verified the live import, all bulb centers and shaft coordinates, the author credit, hints, the final grid, reload, and mobile sharing. A Mini draft verified bulb and shaft editing with keyboard and pointer input. Player-side tests cover both kinds of candidates, pencil updates, impossible sums, and save validation.

Warm timings from 200 local app-profile calls exclude network latency. The published puzzle has six initial Arrow hints and an 87-step replay.

| Operation | Median | p95 |
| --- | ---: | ---: |
| Read the SudokuPad export | 101 µs | 376 µs |
| Read, verify uniqueness, and build preview | 700 µs | 1,088 µs |
| Candidate masks | 19 µs | 94 µs |
| Arrow hints | 45 µs | 59 µs |
| Complete app replay | 4,564 µs | 6,145 µs |

The sized engine now scans for ordinary house hints only when rule deductions leave room in the result. Paired before-and-after Wasm calls returned identical hint and replay payloads for Arrow and Race track. Arrow replay fell from 7.47 ms to 4.79 ms median, and Race track replay from 303 µs to 272 µs. A paired 9×9 Arrow control also returned identical candidates, hints, and replay. Its candidate and hint medians stayed at 29 and 36 µs, with replay at 72 and 73 µs.

## Region Sum on sized grids

The same native code partitions Region Sum paths into box visits on standard and sized grids. Distinct visits to a box remain separate unless the authored rule groups them explicitly. A closed drawing starts its logical path at a box boundary so one visit does not get split between the first and last cells. The importer preserves the authored drawing for rendering.

TVDK’s published 6×6 puzzle has five lines and no given digits. An independent exact solver found one completion with all lines and multiple completions with the box rules alone. The app reproduced the author's solution in both rectangular box orientations and replayed the original in 85 steps. Chrome verified the SudokuPad short link, all path coordinates, the author credit, Technique Finder, reload, replay, and a shared puzzle on a phone-size viewport. The Mini editor verified separate and grouped visits, cell labels, keyboard input, undo, and redo. [Published Region Sum puzzle](https://sudokupad.app/2yastk3l6j)

An independent enumeration of all 288 Mini completions found a re-entry puzzle with one solution under the segment rule and zero under the grouped rule. A second Mini Coach fixture composes an overlapping Renban line with the same Region Sum path. Each rule alone leaves six completions, and together they leave one. The engine and player replay both rule families. A 16×16 engine contract exercises equal totals of 136 across two complete boxes.

The published 6×6 Region Sum median times were 60 µs for decoding, 937 µs for verifying uniqueness, 718 µs for exact solving, 15 µs for candidate masks, 28 µs for the first hints, and 4.39 ms for the complete replay. Building the preview took 1.73 ms. These timings use 200 warm app-profile requests and exclude network time. Paired 9×9 Arrow and Region Sum calls produced identical candidates, hints and traces. Their median times moved by at most 3 µs.

## Exact search on sparse sized grids

The published 7×7 irregular Thermometer has no givens and six lines. Restoring omitted region labels to their default row recovers seven connected regions. An independent solver and the native engine both found one completion, and the engine reached it through the logical replay. [Published Jigsaw pack](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=0008KH)

Exact search starts by propagating the authored rules. After it has expanded several gridfuls of nodes, it also checks every house for a missing digit or hidden single. A house with no possible placement for a digit rules out that branch. A digit with one possible placement restricts that cell's domain before search expands the branch. The sparse 7×7 now verifies its unique completion within the native test's 15,000-node budget.

Paired app-profile Wasm measurements use 40 warm calls per 7×7 operation and 150 per operation on the other controls. The two builds produced the same classifications and exact results in every pair. Values are medians.

| Grid | Before and after uniqueness | Before and after solving |
| --- | ---: | ---: |
| 7×7 Jigsaw Thermometer | 200.90 ms → 3.16 ms | 195.72 ms → 2.97 ms |
| 4×4 Region Sum with box re-entry | 15 µs → 15 µs | 14 µs → 13 µs |
| 6×6 Region Sum | 967 µs → 787 µs | 727 µs → 626 µs |
| 6×6 Arrow | 296 µs → 271 µs | 186 µs → 186 µs |
| 6×6 Race track | 50 µs → 50 µs | 34 µs → 35 µs |
| 16×16 empty Renban | 229 µs → 232 µs | 223 µs → 226 µs |

## 7×7 Jigsaw authoring, generation, and numbered dots

The two published f-puzzles exports use seven connected regions, with no given digits. The parser restores omitted region labels from their default rows. An independent solver counted one completion per authored puzzle. The Thermometer export has six lines. The Kropki export has six numbered differences and three numbered ratios, including 1:3. Chrome checked the exact boundary geometry, author credit, hints, final grids, reload, and phone sharing. A separate draft test swapped cells between regions, rejected an incomplete region, checked undo and redo after reload, added a numbered dot, and saved the result. [Published Jigsaw pack](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=0008KH)

The native generator uses the verified layout to choose a finished grid and retains uniqueness while removing givens. Easy puzzles replay with naked singles. Medium requires a hidden single or locked candidate. The app checks previously played givens for the selected layout. Eighty generation runs across four layouts and both recipes completed. Median generation took 0.11 ms, with p95 at 8.69 ms and a maximum of 9.16 ms.

Each timing below uses 100 warm app-profile calls and excludes network time. Values are median and p95 in microseconds.

| Operation | Thermometer | Numbered dots |
| --- | ---: | ---: |
| Decode | 81 / 137 | 78 / 122 |
| Verify uniqueness | 2,986 / 3,037 | 208 / 217 |
| Exact solve | 2,695 / 2,723 | 186 / 195 |
| Build preview | 5,761 / 5,879 | 481 / 564 |
| Candidate masks | 20 / 37 | 19 / 25 |
| Rule hints | 45 / 52 | 38 / 44 |
| Full replay | 564 / 640 | 3,132 / 3,245 |

### One exact verification request

Sized puzzle verification returns the unique completion from the same search that establishes uniqueness. This avoids compiling the puzzle and searching again for the first completion. The algebraic path also returns the verified variable values from the unique completion.

Paired app-profile measurements used 200 warm calls per control. Both paths returned identical solutions. The separate conflict, multiple, and unsolvable controls returned the same status without a solution. Values are median / p95 in microseconds.

| Control | Separate verification and solve | One verification request |
| --- | ---: | ---: |
| Mini Region Sum | 31 / 79 | 20 / 48 |
| Mini Algebraic Cages | 26 / 33 | 16 / 22 |
| 6×6 Arrow | 470 / 508 | 281 / 311 |
| 6×6 Region Sum | 1,410 / 1,506 | 790 / 842 |
| 7×7 Jigsaw Thermometer | 5,887 / 6,018 | 3,112 / 3,194 |
| 7×7 Jigsaw numbered dots | 396 / 430 | 215 / 245 |

## Boxless 7×7 engine baseline

The original Coach FWpZ code has an explicitly empty region list, no givens, and 18 distinct-digit Killer cages covering all 49 cells. An independent solver using only the rows, columns, and authored cages found one completion. Rows and columns alone admit multiple completions. The native prototype matches the independent answer and reaches it in 167 logical steps. [Published boxless Killer](https://sudoku.coach/en/s/FWpZ)

The engine stores only row and column houses for this layout. Numbered cages reuse exact digit-set support and support the supplied digit range. Warm app-profile median and p95 were 2,593 / 2,711 µs for uniqueness, 379 / 397 µs for exact solving, 27 / 31 µs for candidates, 35 / 41 µs for eight hints, and 33,564 / 34,464 µs for the full replay. No HTTP request or browser rendering is included. The rectangular and irregular sized-rule controls still pass with the prototype engine.

The paired parity run on the existing six sized controls returned identical classification and completion payloads. Median changes stayed within 9 µs across the 4×4, 6×6, 7×7 Jigsaw, and 16×16 controls.

### Exact support for smaller cages

One-cell cages intersect the given total with the cell's candidates. Two-cell cages test the two arrangements of each compiled digit pair. The larger cages continue to use digit-set matching. Exhaustive independent enumeration covers every 7×7 pair of candidate masks and eleven legal totals. The paired Wasm check matched 348 complete responses, including every position in the published boxless Killer replay and sized Killer controls on 6×6 and 16×16 grids.

The published boxless Killer was benchmarked with 100 warm calls per measurement, alternating the two builds. Values are median / p95 in microseconds.

| Operation | Digit-set matching | Direct one- and two-cell support |
| --- | ---: | ---: |
| Verify uniqueness and return solution | 2,628 / 2,909 | 1,992 / 2,171 |
| Candidate masks | 25 / 28 | 24 / 27 |
| Eight hints | 31 / 36 | 31 / 35 |
| Full logical replay | 32,866 / 33,876 | 27,481 / 28,174 |

An earlier singleton prefilter reproduced the proofs but increased verification and replay time on this control, so the direct support calculation is used for the shorter cages.

### Double Arrow deductions through shared houses

For short Double Arrows, logical deductions can match the two sums while checking that cells in the same row, column, or region contain distinct digits. Exact solving and automatic candidate computation keep their sum-propagation path.

Two published 6×6 SudokuPad controls returned identical complete exact-solve payloads and candidate masks in the paired Wasm benchmark. Choose Your Fighter completed in 64 replay positions, down from 78. Hamburger previously stopped after 11 positions. The new path reaches the independently verified completion in 79 positions, and each elimination preserves the solution digit.

| Control | Verification before / after | Opening hints before / after | Replay before / after |
| --- | ---: | ---: | ---: |
| Choose Your Fighter | 799 / 800 µs | 67 / 309 µs | 3,844 / 1,503 µs |
| Hamburger | 5,663 / 5,594 µs | 21 / 66 µs | 7,440 / 1,761 µs |

Values are medians for 50 warm calls to each build, alternating their order. Hamburger’s earlier timing is for its partial replay. The house-aware hints spend additional time checking for legal assignments. Candidate-mask medians stayed within 1 µs on both controls.

### Double Arrow paths with outside X-Sum ends

The published SudokuPad export uses an 8×8 drawing canvas around a 6×6 Sudoku grid. Its five equations share seven outside circles. Each X-Sum length is set by the first digit of its row or column. The linked solver merges coefficients for cells that appear in multiple terms, so a digit contributes consistently to every occurrence. An independent oracle and the native and Wasm engines agree on the unique completion. A separate native control checks a linked 16×16 sum above 128.

The original export completes a 60-position logical replay. App-Wasm timings over 100 warm calls were 236 / 287 µs for verification, 60 / 63 µs for candidate masks, 65 / 72 µs for eight hints, and 482 / 530 µs for the complete replay. Values are median / p95. Chrome also checked outside-circle positions, keyboard editing, reload, and sharing to a phone viewport.
