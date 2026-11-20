# Shared grid rules and layout audit

[Issue #224](https://github.com/coder13/sudoku-app/issues/224) tracks the shared layout and rule contract. This worktree uses the same diagonals, parity, thermometers and Renban rule definitions on rectangular boxes and explicit connected regions. The sized solver derives houses, candidate masks, path lengths, and assumption work from the layout. The 9×9 variant solver still serves its existing protocol, and saved 4×4 Algebraic Cages keep their existing response format.

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
