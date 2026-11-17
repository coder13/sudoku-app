# Impossible generation candidates

`impossible.txt` contains 768 distinct canonical classic Sudoku structures. Each passed uniqueness, the Impossible solve profile, the generation quality floor, and all three lower-tier rejection checks before inclusion. Runtime generation checks every transformed candidate again. The bank's label is evidence about the implemented solver, not a claim that human solving is impossible.

The app excludes structures from saved classic games before drawing candidates. It chooses an unseen candidate's clue count and searches the unseen candidates with that same count, without adding clues. The final output also passes the shared history filter. Exhaustion does not permit an easier puzzle or a repeat to be returned with an Impossible label.

## Source and attribution

Candidates come from the Enjoy Sudoku Players Forum hardest-puzzle collection, distributed in Tom Dillon's [Tdoku benchmark data](https://github.com/t-dillon/tdoku/blob/af426180dc53aef89b82868e7b3fdfcf42165654/benchmarks/README.md). The selected source is `data/puzzles5_forum_hardest_1905_11+` inside `data.zip` at commit `af426180dc53aef89b82868e7b3fdfcf42165654`. Its external ratings are only a way to find candidates; the app grades them independently.

- Source archive Git blob SHA-1: `2ae6e4f8d021d2198069814c7db18bf11fcd9591`.
- Bundled bank SHA-256: `67b40fabf859c16ada79013f54702b6153578517c69f3b88c6744ad2c3f437ad`.
- Tdoku's BSD 2-Clause notice is included in [`public/licenses/tdoku.txt`](../../../public/licenses/tdoku.txt) and ships with the app.
- Credit for the original puzzle collection belongs to its contributors in the [Enjoy Sudoku Players Forum](http://forum.enjoysudoku.com/the-hardest-sudokus-new-thread-t6539-600.html#p277835).

## Rebuild and certify

Build the certifier:

```sh
cargo build --release -p sudoku-app-engine --features wasm-api --example certify_bank
```

Extract the named source file, keep its 81-character rows, replace `.` with `0`, and shuffle with Python's `random.Random(20261117)`. Write one candidate per line to `candidates.txt`. Then run:

```sh
python3 scripts/build-impossible-bank.py candidates.txt certification.jsonl --count 768 --jobs 6 --seconds 20
```

The tool resumes its evidence file, checks actual solutions, canonicalizes candidates, and retains rejection and timeout records. A timeout never qualifies a puzzle. The time limit bounds offline work; it is not a difficulty test. Different machine speeds can affect which candidates finish within that limit.

Select the first 768 distinct accepted canonical strings in evidence order, then sort them before writing `impossible.txt`. Keep the certification evidence with the quality audit. Re-run the normal generator audit and native/browser parity checks after changing the bank or solver.

This pool is finite. Distinct means different under Sudoku symmetries, not necessarily different solving themes or unrelated construction. It greatly increases structural variety over the three practice fixtures, but it does not create an unlimited supply of new structures. Removing games from saved history also removes their duplicate protection.
