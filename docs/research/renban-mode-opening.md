# Remove 8 from R9C5 in Renban ModE

The 15 diagonal and two Renban lines rule out 8 in R9C5 at the opening of Mr.Menace’s *Renban ModE*. The opening has zero givens, zero placements and zero candidate removals. The fixture keeps all fourteen Renban lines and four Little Killer diagonals. [Published puzzle](https://www.gmpuzzles.com/images/puzzles2025/250905-RenbanLittleKillerSudoku-RenbanModE.pdf) · [Issue 202](https://github.com/coder13/sudoku-app/issues/202)

## Proof

1. If R9C5 is 8, the 15 diagonal leaves a sum of 7 for R8C4, R7C3, R6C2 and R5C1.
2. R8C4, R7C3 and R6C2 form a three-cell Renban. Their smallest possible sum is 6, from 1, 2 and 3. R5C1 needs at least 1, so R5C1 is 1 and that Renban uses exactly 1, 2 and 3.
3. R4C1, R5C1 and R6C1 form a second three-cell Renban. That line contains the 1 in R5C1, so it also uses 1, 2 and 3.
4. Those three column 1 cells share box 4 with R6C2. They rule out 1, 2 and 3 in R6C2. This leaves no candidate in R6C2, so remove 8 from R9C5.

## Independent check

The integer verifier generates each clue’s legal digit tuples. It joins tuples on shared cells and checks equal digits only when cells share a house. The three printed clues admit 202 joined assignments after 3,304 tuple checks. They support digits 1 through 7 at R9C5. The 15 diagonal and its own Renban already rule out 9. The second Renban and box 4 rule out 8.

The verifier checks the 8 assumption in 26 tuple checks and finds zero assignments. Removing any one of the three clues admits a local witness with 8. The table lists its other digits. A dash marks a cell outside the remaining clues.

| Omitted clue | R4C1 | R5C1 | R6C1 | R6C2 | R7C3 | R8C4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 15 diagonal | 1 | 2 | 3 | 4 | 2 | 3 |
| Column 1 Renban | — | 1 | — | 3 | 2 | 1 |
| Diagonal Renban | 2 | 4 | 3 | 1 | 1 | 1 |

A separate Jigsaw control moves R6C2 out of the region that contains the column 1 Renban. The same three clues then admit 8 at R9C5. On the original grid, a valid local tuple places 3 in both R5C1 and R9C5. Those two cells share no house. In a control with 2 removed from R5C1, the 15 diagonal also loses support for 7 at R9C5.

The broader scan checked 71 connected clue sets with at most five rules and at least one of each clue type. It completed 42 scopes and reached its 250,000-check limit on 29. The three-clue proof and its controls all completed.

## Current engine replay

A stripped release app build from main `a400d36f6c51467cb6868d983187c3725ae02907` returned zero hints and a zero-step stalled trace at zero points. Its exact check reached the 20,000-node limit and proved uniqueness at 1,000,000 nodes. It rejected a placement of 8 at R9C5. With only that candidate removed, the exact solve returned the published completion. The deduction is verified research and the shipping human path remains stalled. [Published solution](https://www.gmpuzzles.com/images/puzzles2025/250905-RenbanLittleKillerSudoku-RenbanModE-soln.pdf)

The fixture SHA-256 is `82cce79aa71fa38a3af6c06da94fa16d145f69abb6416b1d93c357660b2bbbd2`. The release Wasm SHA-256 is `f81a8e9bc35f22861f5e714a5b9673e099e7260d7c7a66607019e110289aac1f`. The run used Rust and Cargo 1.92.0, Node 22.23.1, Python 3.14 and an AMD Ryzen 7 7840U on Arch Linux.

```sh
timeout 90s python scripts/research/verify-renban-mode-opening.py \\
  tests/fixtures/little-killer-menace.json --budget 250000 > local-scopes.jsonl
timeout 120s node --experimental-strip-types scripts/research/replay-renban-mode-opening.mjs \\
  baseline.wasm tests/fixtures/little-killer-menace.json > opening-engine.jsonl
```
