# Puzzle quality audit: 599 puzzles at each level

Date: November 17, 2026. Engine source: `3ed5dbd3d04a06239d8928e9679e970db29da741`, on PR #27.

The sample contains **5,990 generated classic puzzles**, with **599 at each of the ten levels**. This audit evaluates the proposed ladder on this branch. It does not evaluate the current main branch or Sudoku variants.

**The ladder mostly separates techniques well. The current quality rules need more work before they can promise consistent puzzles.**

The main findings are:

- All 5,990 puzzles have exactly one solution. All 410,631 recorded deductions replay correctly and agree with those solutions.
- All puzzles pass the current generation contract. However, **15 puzzles have a proved solve path in a lower tier**.
- **Medium is too thin for the default mode.** Its median path has three non-single deductions. Some examples finish their interesting work almost immediately.
- **Master is the strongest current advanced mode for the requested style of solving.** Its sample has substantial technique variety and no forcing proofs.
- **Impossible needs a larger puzzle supply.** Its 599 different grid strings represent only six structures. Three structures account for 588 puzzles, or 98.2%.

These are product judgments from automated checks and a review of 30 selected solve sequences. They are not human playtest scores.

## Ratings by level

“Non-single deductions” means recorded moves other than Full House and Naked or Hidden Singles. One deduction can remove several candidates. These counts describe the path, not a new difficulty score or user setting.

| Level | Mode quality | Median non-single deductions | Middle 80% of paths | Assessment |
| --- | --- | ---: | ---: | --- |
| Beginner | Good | 0 | 0 | All use the intended scanning techniques. There are 2 to 15 opening choices, with a median of 8. |
| Easy | Good | 0 | 0 | All use singles. The median path uses two Easy-tier singles beyond the Beginner techniques. |
| Medium | Needs work | 3 | 2–6 | Too many paths meet only the two-deduction floor. Pointing dominates the sample. |
| Tricky | Mixed | 4 | 2–9 | A clear step above subsets, but Skyscrapers dominate. Most paths use one Tricky-tier move. |
| Hard | Good, with rating fixes | 6 | 3–11 | Wings appear in 493 paths, or 82.3%. Two puzzles have lower-tier solutions. |
| Very Hard | Mixed | 9 | 5–16 | Useful chain and coloring practice, but 3D Medusa dominates. Eight puzzles have lower-tier solutions. |
| Expert | Good | 15 | 8–24 | A substantial sequence of deductions and AICs. No lower-tier route appeared in the extra checks. |
| Master | Strong | 23 | 14–35 | Grouped chains and ALS techniques combine well with earlier skills. All 599 structures are different. |
| Extreme | Mixed | 29 | 16–43 | Substantial solves, but forcing techniques dominate. Five puzzles have Master-level routes. |
| Impossible | Not ready as a varied mode | 57 | 47–68 | Very difficult paths, but only six underlying structures and one observed top-tier technique. |

The middle 80% runs from the 10th to the 90th percentile. A larger count does not automatically mean a better puzzle. Beginner and Easy intentionally use only singles.

## Rating consistency

The generator currently accepts a puzzle when its requested profile solves it and its canonical lower-tier profile stalls. That is useful evidence, but one ordering misses some easier routes.

The audit tried two more lower-tier profiles for every puzzle above Beginner. Both preserve the order of difficulty tiers. One reverses technique order within each tier. The other rotates it by half its length.

This produced **10,782 additional solve attempts**. Fifteen puzzles completed with lower-tier techniques:

| Requested level | Lower tier found | Puzzles | Share of that level | Audit indices |
| --- | --- | ---: | ---: | --- |
| Hard | Tricky | 2 | 0.33% | 87, 102 |
| Very Hard | Hard | 8 | 1.34% | 130, 188, 230, 256, 290, 326, 339, 567 |
| Extreme | Master | 5 | 0.83% | 8, 27, 95, 277, 293 |

Every successful alternate trace also passed the independent action replay. There were no additional lower-tier counterexamples from equivalent structures in the sample.

For example, Hard index 87, seed `1362300544`, uses a W-Wing in the canonical path. Another ordering completes it with Claiming, Empty Rectangles, and singles. Its grid is:

```text
600100037009040006000086024002000000400600000730000100800307040070020600203000000
```

Very Hard index 130, seed `2389984014`, uses 3D Medusa in the canonical path. Another ordering completes it using only Hard and earlier techniques:

```text
580000000000000098700069000100095000400000530870100000000004020900001006340000087
```

These are demonstrated rating errors under the intended “requires this tier” rule. Zero findings at another tier do not prove that no easier route exists. These checks explore two extra greedy orders, not every possible deduction sequence or every human technique.

## Medium needs the most attention

Among the 599 Medium puzzles:

- **213, or 35.6%, use exactly two non-single deductions.**
- **522, or 87.1%, finish with at least 30 consecutive singles.**
- **43, or 7.2%, use just two non-single deductions and leave at least 80% of their original empty cells for the final singles run.**
- Pointing appears in 553 paths, or 92.3%. Hidden Pairs appear in 10 and Hidden Triples in one.

The third finding is the clearest warning. It combines a small amount of elimination work with a long finish. The 80% threshold is an audit flag, not a validated production rule.

Medium index 388, seed `1501858265`, has 24 givens. Its entire path is:

1. Locked Triple.
2. One single.
3. Pointing.
4. Fifty-six singles.

This puzzle passes the current quality floor. It closely matches the short-lived experience that the quality rules were meant to prevent.

A more typical path, index 351, has 11 opening singles, three Pointing deductions, and 42 closing singles. A richer example, index 596, uses 12 non-single deductions across five technique types.

Long singles finishes also occur in good advanced puzzles. They can provide a satisfying finish after a difficult discovery. A blanket ban on long finishes would discard useful puzzles. The stronger concern is a thin middle combined with little variety or progress between discoveries.

## Technique coverage

The table counts puzzles whose recorded path uses a technique. A puzzle can use several listed techniques, so percentages can overlap.

| Level | Most common top-tier techniques in recorded paths |
| --- | --- |
| Medium | Pointing 553; Claiming 171; Locked Pair 159; Naked Pair 108 |
| Tricky | Skyscraper 536; X-Wing 93; Two-String Kite 53; Empty Rectangle 24; Swordfish 14 |
| Hard | W-Wing 359; XY-Wing 169; BUG+1 75; Unique Rectangle 1 52; XYZ-Wing 40 |
| Very Hard | 3D Medusa 458; XY-Chain 163; Finned Swordfish 58; WXYZ-Wing 49 |
| Expert | AIC 599; neither Nice Loop detector appears in these canonical traces |
| Master | Grouped AIC 495; ALS-XZ 157; ALS-XY-Wing 152; Grouped Discontinuous Nice Loop 114; ALS Chain 88 |
| Extreme | Forcing Chain 536; Forcing Net 160; Multi-Sector Locked Sets 28 |
| Impossible | Nested Forcing Net 599; no Pattern Overlay variant appears |

Skyscrapers appear in 89.5% of Tricky paths. 3D Medusa appears in 76.5% of Very Hard paths. These modes can feel narrower than their technique lists suggest.

Master has the best advanced mix in this sample. Sue de Coq and Death Blossom each appear in 15 paths. Its canonical paths use ten different Master-tier technique types across the sample.

All 599 Master paths avoid forcing-branch evidence. This supports Master as the current ceiling for structured, non-forcing play. It does not remove the mapping caveats around uniqueness techniques or Aligned Pair Exclusion.

These counts are influenced by solver priority and overlapping techniques. AIC can take a move that another detector describes as a loop. An unused technique is not necessarily absent from the puzzle. Curriculum order must still follow prerequisites. Rare techniques need their own practice examples and curated puzzles.

## Puzzle variety and generation

The audit compares grids after normalizing digit names, row and column permutations within Sudoku rules, and transposition. Equivalent grids count as one structure.

| Level | Different grid strings | Different structures | Generation source |
| --- | ---: | ---: | --- |
| Beginner through Master, each | 599 | 599 | 599 fresh puzzles |
| Extreme | 599 | 580 | 557 fresh puzzles; 42 pool fallbacks |
| Impossible | 599 | 6 | 599 practice-fixture transformations |

Impossible's six structure families have **263, 177, 148, 5, 5, and 1** members. The largest family alone accounts for 43.9% of that mode's sample. Different digits and cell positions conceal repetition without creating a new logical puzzle.

Two Extreme generation calls exhausted their full budgets. Two later seeds completed the sample. All failures remain in the raw evidence. The audit made 5,992 generation calls to obtain 5,990 puzzles. It did not silently replace difficult calls with another generation route or a lower search limit.

Native generation times are below. They exclude the audit's additional trace analysis and independent checks. Six generation processes shared this machine. These are diagnostics, not browser or phone latency measurements.

| Level | Median generation time | 95th percentile |
| --- | ---: | ---: |
| Beginner | 0.5 ms | 6.4 ms |
| Easy | 0.9 ms | 6.1 ms |
| Medium | 17.3 ms | 79.8 ms |
| Tricky | 29.6 ms | 137.1 ms |
| Hard | 18.4 ms | 88.0 ms |
| Very Hard | 20.2 ms | 93.6 ms |
| Expert | 45.5 ms | 212.5 ms |
| Master | 191.1 ms | 802.2 ms |
| Extreme | 1,287.0 ms | 4,034.3 ms |
| Impossible | 2,308.8 ms | 5,709.6 ms |

The complete generation run took about 12.4 minutes. Auditing and report preparation were separate.

## Complexity within a technique

Technique names alone leave a wide range of proof sizes inside each mode:

- Expert's longest AIC in each path ranges from 5 to 25 links, with a median of 9.
- Very Hard's largest top-tier link structure ranges up to 66 links. This includes coloring graphs, so it is not directly comparable to one AIC.
- Extreme's largest top-tier forcing proof ranges up to 90 recorded inferences.
- Impossible's largest Nested Forcing Net proof has 66 to 159 recorded inferences, with a median of 115. These proofs have two assumption levels.

These measurements help explain variation within a tier. They are not calibrated human difficulty scores. A short grouped chain can still be harder to find than a longer ordinary chain.

## Recommended changes, in order

1. **Strengthen the lower-tier check.** Try several technique orders before accepting a puzzle. Reject or regrade every puzzle with a known lower-tier solve. Use bounded alternate-path search for stronger certification when practical. Preserve an inconclusive result when a search reaches its limit.
2. **Improve the Medium quality floor.** Reject the clearest two-deduction collapse cases. Compare richer candidates using useful progress and technique variety. Test proposed thresholds against this saved sample and another 599-puzzle run before fixing them in production.
3. **Expand and deduplicate Impossible.** Add independently verified hard puzzles. Track canonical structures across a player's history. Do not count digit relabeling or board transformations as fresh puzzle variety.
4. **Broaden the generated technique mix.** Add targeted candidate searches and curated sources for underrepresented families. Recheck the full difficulty contract after selecting each candidate. Avoid forcing artificial diversity between two names for the same deduction.
5. **Add internal proof-size checks.** Track chain length, grouped nodes, and forcing depth within each tier. Use these to find outliers and select better puzzles. Keep one quality bar per mode and no additional user controls.

The audit does not change production generation rules. It supplies a baseline, concrete counterexamples, and reproducible checks for the next change.

## Method and limits

- The native harness mirrors `generateClassic(difficulty, seed)` without personal technique progress. Auto personalization and variants are outside this sample.
- It uses the same profiles, clue ranges, attempt budgets, Impossible fixtures, and final pool fallback as the app.
- Each level receives a deterministic sequence derived from `0x59902026`, its tier index, and its sample index. The first 599 successful calls form the sample. Failed calls remain recorded.
- Every puzzle has a full canonical trace, lower-tier result, generation route, timing, canonical structure, and per-step progress record.
- A separate Python exact solver counts solutions. All 5,990 checks finish with exactly one solution. The largest search uses 99,821 nodes, below the two-million-node audit limit.
- Independent replay checks candidate availability, legal placements, the final solution, and agreement of each action with the solution. It does not independently reconstruct every link in every explanation.
- There are 410,631 recorded deductions, including 90,543 non-single deductions.
- Two extra lower-tier orders cover all 5,391 puzzles above Beginner. No lower tier exists for Beginner.
- The native harness and the actual TypeScript/Wasm `generateClassic` function produce identical grids and ratings for 21 selected cases across all ten levels. This includes a pool fallback.
- Thirty selected solve sequences were inspected, three per tier. They cover thin, typical, and varied paths, with opening-choice examples for Beginner and singles examples for Easy. These were trace reviews, not timed human solves.
- The sample does not establish enjoyment, discoverability, or a universal minimal technique rating. Repeated Impossible structures also prevent treating its 599 outputs as 599 independent puzzle designs.

## Reproduce the audit

```sh
npm run build:wasm
cargo build --release -p sudoku-app-engine --features wasm-api --example quality_audit --example quality_recheck
python3 scripts/audit-puzzle-quality.py --count 599 --jobs 6 --output /tmp/sudoku-quality-audit
python3 scripts/recheck-puzzle-quality.py /tmp/sudoku-quality-audit --jobs 6
python3 scripts/summarize-puzzle-quality.py /tmp/sudoku-quality-audit --verify
node --experimental-strip-types scripts/check-quality-audit-parity.mts /tmp/sudoku-quality-audit
```

Run these commands at the audited source revision with the audit tools from this PR. All runs use the same seed sequence. The generation and alternate-order scripts resume completed records. Timing results depend on the machine and concurrent processes.

The delivered data contains:

- `puzzle-quality.csv`: one row per puzzle, including its grid, seed, path metrics, and review flags.
- Ten tier JSONL files: every generation call, complete move evidence, and progress records.
- `alternate-orders.jsonl`: all extra checks and the full successful lower-tier traces.
- `independent-checks.jsonl`: independent solution counts and solutions.
- `summary.json` and `metrics.json`: aggregate and per-puzzle results.
- `reviewed-examples.json`: the 30 inspected sequences.
- `manifest.json`: source revision, methodology, validation counts, and file hashes.

CSV review flags identify concrete rating errors, repeated structures, and unusually thin paths. “No major flag” only means that none of those checks triggered. It is not a claim that a human will enjoy the puzzle. Grid strings need text columns when imported into a spreadsheet.
