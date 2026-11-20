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
