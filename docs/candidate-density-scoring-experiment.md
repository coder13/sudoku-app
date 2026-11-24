# Candidate-density and Unique Rectangle scoring experiment

This is a local calibration experiment in the `core-technique-exploration` worktree. The UR1 cost change is recorded under classic scoring version **15** and structured variant scoring version **24** (version **25** when Group Order Elimination is used). It does not change the puzzle's difficulty tier: the tier still follows the hardest technique used in the selected solver path. The input proposal is `/Users/cailyn/projects/sudoku-app/docs/candidate-density-scoring-exploration.md`.

## Experiment setup

The density proposal defines the candidate count before each deduction as the total legal candidates on the current grid, including established candidate removals. This experiment applies the proposed square-root multiplier to each existing evidence-adjusted step cost:

\[
m(C_i)=\operatorname{clamp}\left(\sqrt{C_i/C_{ref}}, 0.5, 2.0\right)
\]

The absolute-density reference is the median pre-step candidate count in the sample, so a median step retains its existing cost. The relative-density comparison instead divides by each puzzle's opening candidate count. Both use the same exponent and clamp.

The run re-solved all 160 puzzles in the generated calibration set: 20 each at Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme, and Impossible. This is a balanced, deterministic generated-puzzle cohort, not a random sample or a human benchmark. The harness verified every puzzle still solved at its requested tier. Candidate counts were recomputed from each replayed pre-step snapshot, including established removals.

## Candidate-density results

The 160 traces contain 11,909 deductions. Their pre-step candidate counts have a median of **88** (minimum 1, p90 184, maximum 313). With `C_ref = 88`, \(\alpha=0.5\), and a 0.5–2.0 clamp, the actual absolute multiplier range is **0.500–1.886**; its median is 1.000 and p90 is 1.446. The 2.0 cap did not bind in this cohort.

| Requested tier | n | Current median / p90 | Absolute density median / p90 | Relative density median / p90 | Median absolute change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Medium | 20 | 821 / 956 | 841 / 1,022 | 586 / 669 | +3.5% |
| Tricky | 20 | 1,010 / 1,210 | 987 / 1,340 | 705 / 906 | −1.9% |
| Hard | 20 | 1,127 / 1,324 | 1,042 / 1,277 | 709 / 887 | −3.8% |
| Very Hard | 20 | 2,241 / 3,414 | 2,145 / 3,941 | 1,495 / 2,581 | +2.9% |
| Expert | 20 | 3,280 / 4,893 | 3,716 / 5,206 | 2,383 / 3,495 | +5.5% |
| Master | 20 | 8,271 / 13,750 | 10,334 / 17,519 | 6,578 / 11,233 | +21.5% |
| Extreme | 20 | 10,018 / 17,464 | 12,527 / 21,506 | 8,335 / 14,359 | +23.5% |
| Impossible | 20 | 107,469 / 138,343 | 164,957 / 213,414 | 102,180 / 131,666 | +51.9% |

Spearman correlation between the requested tier order and point totals was **0.945** for the current model, **0.933** for absolute density, and **0.936** for within-puzzle relative density. These are comparisons against requested generator tiers, not player judgments or solve-time measurements. Density weighting moves totals substantially—especially at the top end—but does not improve ordering against requested tiers in this cohort.

The relative formula lowers scores across these groups because steps usually occur at a smaller density than the opening position. It measures progress within each puzzle, while the absolute formula compares the size of the live search space across puzzles. Neither has yet shown that it captures human-perceived difficulty better.

## Unique Rectangle subtype adjustment

SudokuWiki gives Type 1 a base weight of 20 and Types 2–5 a base weight of 50. To test that relative distinction on our scale, the worktree now gives direct **Unique Rectangle 1** a 40-point reference cost and leaves UR2–6 at 100. The existing corner-candidate adjustment remains: sum the four corner candidate counts, scale against a nine-candidate reference, and apply the existing half-cost floor. This separates the pattern-type baseline from the corner-candidate evidence adjustment.

The cohort contains 67 direct rectangle deductions:

| Engine technique | Count | Mean corner candidates | New total | Previous total |
| --- | ---: | ---: | ---: | ---: |
| Hidden Rectangle | 48 | 12.3 | 6,538 | 6,538 |
| Unique Rectangle 1 | 4 | 9.8 | 172 | 433 |
| Unique Rectangle 2 | 1 | 10.0 | 111 | 111 |
| Unique Rectangle 3 | 1 | 11.0 | 122 | 122 |
| Unique Rectangle 4 | 7 | 11.9 | 920 | 920 |
| Unique Rectangle 6 | 6 | 10.2 | 677 | 677 |

No UR5 occurred in this cohort. UR6 has no direct counterpart in the cited SudokuWiki table, so it stays at the existing base provisionally. Type numbering and proof definitions still need a full mapping before treating this as calibrated. The unchanged candidate-count adjustment continues to represent candidate clutter; the subtype base represents the deduction family.

## Interpretation and limits

- The UR1 experiment has a clear, local effect: across four UR1 steps, its total fell from 433 to 172 points. Other observed UR types and Hidden Rectangles did not change.
- Global density weighting raises totals in the median Master, Extreme, and Impossible puzzles, but does not consistently increase lower-tier totals. It slightly weakens rank agreement with requested generator tiers.
- We have no human solve-time or player-rated difficulty labels here. A tier-correlation result cannot determine which model better reflects how hard a puzzle feels.
- The cohort is deterministic and generated; 160 puzzles do not constitute independent human benchmarks.
- The density calculation is currently an analysis harness, not part of the solver's persisted score. The local engine scoring change in this experiment is the UR1 base adjustment.

## Reproduction

From the worktree root:

```sh
cargo run -p sudoku-app-engine --example candidate_density_experiment --features cli
```

The harness reads [`scoring-calibration-160-puzzles.md`](scoring-calibration-160-puzzles.md), re-solves all 160 puzzles using the current local engine, verifies their tiers, and reports score ranges, technique coverage, density variants, and UR cost totals.
