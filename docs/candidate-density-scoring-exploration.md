# Candidate-density weighting: a mathematical sketch

## The idea

Our current classic score adds a cost for each deduction:

\[
S_{current}=\sum_{i=1}^{n} b_i
\]

Here, \(b_i\) is the catalog cost of the technique used on step \(i\). The puzzle's difficulty label comes from its hardest technique tier, not from this point total.

A candidate-density adjustment would make the same technique cost more when the grid has more candidates left to search. For example, an X-Wing on a crowded board could score more than an X-Wing near the end of a solve.

## Define the density for a step

Let \(C_i\) be the number of legal candidates on the board immediately **before** deduction \(i\):

\[
C_i=\sum_{c\in\text{empty cells}}\#\{d:d\text{ is a candidate for }c\}
\]

This is a board-wide count. It does not count how many candidates the deduction removes. Using the before-step position measures the search space the solver faced when it had to find the pattern.

To keep the current point scale recognizable, choose a reference density \(C_{ref}\). At that density, the multiplier is 1. For an initial exploration, suppose \(C_{ref}=120\). That is an example value, not a measured recommendation; a real value should come from a balanced sample of solve traces.

## A tunable multiplier

One compact model is:

\[
m(C_i)=\operatorname{clamp}\left(\left(\frac{C_i}{C_{ref}}\right)^\alpha,\;0.5,\;2.0\right)
\]

Then charge each step:

\[
s_i=b_i\,m(C_i),\qquad S_{density}=\sum_{i=1}^{n}s_i
\]

The exponent \(\alpha\) controls how strongly density changes the score:

- \(\alpha=0\): no density adjustment; this is the current model.
- \(\alpha=0.5\): square-root weighting; a moderate adjustment.
- \(\alpha=1\): linear weighting; a stronger adjustment.

The clamp limits each step to half or double its current cost. This prevents a very sparse or crowded state from dominating the whole puzzle score. The bounds and exponent are tuning choices, not facts about Sudoku.

## Worked example

Assume an X-Wing has a current base cost of 140 and use \(C_{ref}=120\). With square-root weighting, its step cost would be:

| Candidates before the move \(C_i\) | Multiplier \(\sqrt{C_i/120}\) | Weighted X-Wing cost |
| ---: | ---: | ---: |
| 240 | 1.414 | 198 |
| 120 | 1.000 | 140 |
| 60 | 0.707 | 99 |

The pattern and its proof are unchanged. Only the estimate of how much search surrounded it changes. With linear weighting, those costs would instead be 280, 140, and 70. That difference shows why \(\alpha\) needs calibration.

For a three-step example with the same 140-point technique at densities 240, 120, and 60, the current score is 420. Square-root weighting gives about 437; linear weighting gives 490. The formula can therefore raise an early-heavy solve's total while reducing the contribution of late deductions.

## Absolute versus relative density

The formula above uses **absolute density**. It compares a step to one shared reference across puzzles. A puzzle that starts with more candidates may earn more points even if the solve follows the same sequence of techniques.

An alternative is to use each puzzle's starting density \(C_0\):

\[
m_{relative}(C_i)=\left(\frac{C_i}{C_0}\right)^\alpha
\]

This makes every puzzle start at a multiplier of 1 and only rewards how early a deduction happens within that puzzle. It is better if the desired signal is solve progress; absolute density is better if the desired signal is the size of the board-wide search space. SudokuWiki's current method uses board-wide candidate density at each step, then sums weighted technique points and converts the result with a logarithm. Its technique weights and final grade are different from ours, so its point values cannot be copied directly. See [SudokuWiki's grading description](https://www.sudokuwiki.org/Print_Grading_Puzzles).

## How this would combine with technique evidence

If a technique already has a proof-sensitive cost \(e_i\), such as a cost based on chain length or Medusa network size, density can multiply that cost:

\[
s_i=e_i\,m(C_i)
\]

That preserves the distinction between two questions:

1. How involved was this particular proof?
2. How much candidate search space surrounded the proof?

There is some risk of counting related work twice. A crowded board may also produce larger chains, coloring networks, or Unique Rectangle corner sets. We should compare scores with and without the global multiplier to see whether it adds useful signal beyond those local evidence measures.

## A sensible calibration path

For an experiment, I would start with absolute density, \(\alpha=0.5\), and the 0.5–2.0 clamp. I would set \(C_{ref}\) to the median pre-deduction candidate count in a balanced set of solve traces, so a typical step keeps roughly its current cost. Then compare:

- score changes by puzzle tier and clue count;
- whether puzzles with the same hardest technique separate more plausibly;
- whether score rank correlates better with human solve time or player difficulty judgments;
- whether the multiplier overweights early steps or overlaps with proof-size costs.

This would change numeric points only. It would not change a puzzle's technique-based tier unless we later choose and calibrate a separate rule for that.
