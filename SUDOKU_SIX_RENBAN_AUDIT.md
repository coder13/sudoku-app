# 6×6 Renban source audit

[Issue #272](https://github.com/coder13/sudoku-app/issues/272) tracks Renban on both rectangular 6×6 layouts. The 9×9 Renban solver already uses digit-mask support for paths of two or three cells. Reuse those cases for the sized rule and preserve the 9×9 benchmark.

[TVDK’s 6×6 Renban](https://sudokupad.app/f3ownh9dic) has two givens, 2×3 boxes and five Renban lines with 5, 3, 2, 2 and 3 cells. Its SCL export omits one intermediate cell on a straight stretch. Expand those cells before applying the consecutive-set rule. Independent search verified the authored solution in 905 calls. Without Renban, it found multiple solutions in 43 calls. SHA-256 of the original code is `80ed219c5ee630101964e69587cab3f12108265340a7ef6b772b027035fc3727`.

[Bluejay’s Race track](https://sudoku.coach/en/s/9uMo) has five givens, two six-cell Renban lines and three exact differences of 1, 2 and 3. The same verifier found one completion in 590 calls. It found multiple completions after removing either Renban or Difference. Preserve the complete export once sized Difference support lands under [#279](https://github.com/coder13/sudoku-app/issues/279). SHA-256 is `63237f4719357bb50f4851adc85b839130a7b2a0a263533a7d91b13508270e20`.

## Engine and app checks

The rectangular-grid solver uses the same mask intersections as 9×9 for short lines and a 64-state matching cache for longer 6×6 lines. It propagates results alongside parity, diagonal, and thermometer support. A mixed test grid with intersecting Renban and thermometer clues has one solution in both box orientations. Removing either clue gives multiple solutions. Its walkthrough explicitly uses the Renban clue.

The original SudokuPad puzzle retains all five lines, the authored answer, and the author credit. The walkthrough reaches that answer in 69 steps. A separate Coach test checks that branching Renban segments share one consecutive set and still draw their original segments in play and shared links.

On this host, 1,200 warm requests against the published SudokuPad puzzle produced the following WebAssembly timings. Measurements include the engine request and response conversion.

| Operation | Median | p95 |
| --- | ---: | ---: |
| Uniqueness check | 185.8 µs | 205.3 µs |
| First solution | 61.8 µs | 66.7 µs |
| Candidates | 7.8 µs | 9.2 µs |
| First ten hints | 11.8 µs | 13.3 µs |
| Complete walkthrough | 1.33 ms | 1.40 ms |
