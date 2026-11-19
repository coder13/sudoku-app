# Shared grid rules and layout audit

[Issue #224](https://github.com/coder13/sudoku-app/issues/224) tracks the shared layout and rule contract. This worktree uses the same diagonals, parity, thermometers and Renban rule definitions on rectangular boxes and explicit connected regions. The sized solver derives houses, candidate masks, path lengths, and assumption work from the layout. The 9×9 variant solver still serves its existing protocol, and saved 4×4 Algebraic Cages keep their existing response format.

## Source and engine controls

- [TVDK’s published 6×6 Renban](https://sudokupad.app/f3ownh9dic) still imports with five paths and author credit. Chrome verified a hint, undo and redo, the complete solution, and a mobile share preview.
- The same Wasm Renban request checked candidates, uniqueness, exact solution, and replay on 4×4, both 6×6 layouts, both 8×8 layouts, 10×10, 12×12 and 16×16. A 5×5 irregular control composes Renban and parity. Independent enumeration found one completion with both rules and multiple completions with either rule removed.
- [Michael Lefkowitz’s published 4×4 Renban](https://sudokupad.app/g0b07xt4eu) reached its independently verified answer in 25 steps after research decoding. Chrome drew all four paths and exposed their cell descriptions in the shared Board at desktop and phone widths. The original short-link flow still needs compact SCL decoding under [#282](https://github.com/coder13/sudoku-app/issues/282) plus the shared import, editor, save, and share integration under [#224](https://github.com/coder13/sudoku-app/issues/224) and [#284](https://github.com/coder13/sudoku-app/issues/284).
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
