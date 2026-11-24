# Scoring calibration experiment

This is an experimental calibration record. Technique point costs estimate work along a selected solver path; they do not select the puzzle's difficulty label. The label still follows the hardest technique tier. The first generated sample below used scoring version 12. The 160-puzzle version 14 run, including Medusa network size and Unique Rectangle corner candidate counts, is recorded in [scoring-calibration-160-puzzles.md](scoring-calibration-160-puzzles.md). The later UR1 subtype-cost and candidate-density pilot is recorded in [candidate-density-scoring-experiment.md](candidate-density-scoring-experiment.md).

## Scoring changes under study

- Classic chains scale from the technique's reference cost by link count. Inference chains also count grouped candidates.
- 3D Medusa scales with colored candidate-network size, using ten candidate nodes as the reference network.
- Unique Rectangles scale with the total candidate count across their four corners, using the simplest valid nine-candidate rectangle as the reference pattern.
- Forcing proofs use total branch proof size, the longest branch path, and the number of alternatives. Nested proof steps count recursively.
- Fish proofs add cost for extra fins and complex-house structure. Unique Loops scale with loop size.
- Variant proofs use evidence size and candidate-choice counts. This makes shorter thermometers and more constrained Quadruples cheaper than proofs that inspect more cells or have more candidate alternatives.
- Profile order remains curated. Evidence-adjusted point costs do not reorder solver techniques.

The reference costs remain the catalog values. Dynamic classic scores have a floor at half the reference cost; variant scoring uses conservative evidence-specific estimates. These coefficients are experimental and need comparison with human solve times.

## Generated puzzle sample

The run generated 400 seeded 34-clue puzzles, then rated them with every classic technique. It also generated 12 targeted puzzles for each of seven difficulty tiers, using `Technique::DIFFICULTY_ORDER` and up to 150 attempts per seed. All 84 targeted generations succeeded and rated at their requested tier.

| Tier | n | Dynamic points: min / median / p90 / max | Reference-cost points: min / median / p90 / max |
| --- | ---: | ---: | ---: |
| Beginner | 12 | 412 / 448 / 458 / 468 | 412 / 448 / 458 / 468 |
| Easy | 12 | 418 / 462 / 500 / 538 | 418 / 462 / 500 / 538 |
| Medium | 12 | 676 / 780 / 854 / 870 | 676 / 780 / 854 / 870 |
| Tricky | 12 | 722 / 898 / 1,054 / 1,172 | 722 / 898 / 1,054 / 1,172 |
| Hard | 12 | 872 / 1,224 / 1,376 / 1,804 | 872 / 1,224 / 1,374 / 1,804 |
| Very Hard | 12 | 936 / 1,344 / 2,828 / 4,098 | 936 / 1,344 / 1,980 / 2,378 |
| Expert | 12 | 2,613 / 3,120 / 4,699 / 10,057 | 2,168 / 2,642 / 3,398 / 5,476 |

The medians rise across the sampled tiers, while scores overlap between adjacent tiers. This matches the intended separation: points approximate work, while tiers express the hardest technique family. Long chains create most of the added upper-tail work in Very Hard and Expert.

The random 400-puzzle sample was heavily weighted toward easier puzzles: 304 Beginner, 80 Easy, 4 Medium, 6 Tricky, 4 Hard, and 2 Very Hard; none reached Expert. This is a generator sample, not a balanced difficulty benchmark.

## Proof-level spot checks

- A three-link X-Chain scored 195, a five-link X-Chain 325, and a seven-link XY-Chain 455, against a 260 reference cost.
- A 19-link XY-Chain scored 1,235. In the targeted puzzle sample, XY-Chain deductions ranged from 455 to 1,625.
- Forcing examples varied with branch proof size: Forcing Chains ranged from 250 to 700; Nested Forcing Nets from 4,085 to 5,890.
- Variant practice-proof calibration passed with the evidence-based estimator. That includes the candidate-sensitive Quadruple and cell-span-sensitive Thermometer models.

The high tails are deliberate consequences of counting long proofs, but need human-time validation before treating the coefficients as calibrated difficulty measurements.
