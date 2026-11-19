# Renban New Puzzle preparation

This research uses the engine from Modular preparation head `20c6227`. Its Darwin Wasm SHA-256 is `c0197bc5572a71059465d27cda4647ae131dd3c30a8204bbcda40706aa7e6927`.
Renban remains a 40-point Medium technique under scoring version 8.
The app already supports Renban import, play and help. New Puzzle integration remains pending in [189](https://github.com/coder13/sudoku-app/issues/189).

## Complete source controls

The pure templates retain every Renban cell set and the independently checked completion. Original givens remain in their source fixtures.
The mixed Pinwheel source retains all Killer cages. It does not supply a stripped pure template.
BSms retains its original partial human path in [158](https://github.com/coder13/sudoku-app/issues/158).

| Control | Original givens | Complete line lengths |
| --- | ---: | --- |
| Clover | 16 | Twelve lines of length 3 |
| Coach Jh4o | 11 | 9, 8, 9, 7, 9, 7 |
| Coach KUUo | 25 | 9, 2 |
| Coach BSms | 8 | Seven lines of length 4 and two of length 3 |

## Calibration and candidate recipes

Each probe uses seeds 1–100, one attempt, the pinned full app technique order and 20,000 nodes per exact search.
Every accepted puzzle is independently unique, matches its completion and has multiple solutions without Renban.
Every accepted path solves at Medium and uses the named Renban technique.
Finite yield does not promise success for every seed or played history.

| Template and target givens | Clover | Jh4o | KUUo | BSms |
| --- | ---: | ---: | ---: | ---: |
| Checked completion, 14–20 | 94 | 74 | 4 | 92 |
| Checked completion, 14–17 | 91 | 30 | 0 | 75 |
| Blank, 0–30 | 30 | 32 | 87 | 46 |

Thirty candidates use Clover, Jh4o and BSms geometry. Each geometry supplies five seventeen-given and five twenty-given recipes.
KUUo remains a complete source control because its sparse completion-based yield is low.
Every selected candidate offers several hints and a complete trace matching its generation rating.
Independent assignment enumeration checks 380 Renban proofs. Independent completions support all 3,497 actions.
The selection filter conservatively rejects arbitrary digit-pattern matches. It is not a complete Renban identity algorithm.

## Reproduced identity gaps

Thirty deterministic exclusion probes retain a full witness for each equivalent history. Seventeen return the excluded original puzzle.
Thirteen existing controls already exclude it. Three KUUo controls reach their bounded search limit after exclusion.
Public path order and drawing segments must remain intact during a private identity repair.

| Source | Reproduced failures |
| --- | --- |
| Clover | Reversed line order/cells, digit complement |
| Jh4o | Reversed lines, sorted cell sets, complement, central-band swap, nine-cell Extra House bridge, nine-cell sum-45 Killer bridge |
| KUUo | Reversed lines, sorted cell sets, complement, nine-cell Extra House bridge, nine-cell sum-45 Killer bridge, two-cell positive white-dot bridge |
| BSms | Reversed lines, sorted cell sets, complement |

Renban constrains a complete cell set to distinct consecutive digits. It does not constrain only consecutive drawing windows.
Nine-cell Renban, a nine-cell Extra House and a nine-cell distinct Killer cage of sum 45 express the same relation.
Two-cell Renban expresses the positive white-dot relation. Negative-dot flags and other companion rules remain separate constraints.

## Valid digit renamings

Independent enumeration tests every one of the 362,880 digit bijections against every allowed interval for each line length.
It performs 6,461,888 interval checks. Bijection and preservation of every positive set establish preservation in both directions.
The count for each source intersects the valid mappings for every complete line length.

| Renban length | Valid bijections |
| --- | ---: |
| 1 | 362,880 |
| 2–5 | 2 |
| 6 | 12 |
| 7 | 240 |
| 8 | 10,080 |
| 9 | 362,880 |

Clover, KUUo and BSms allow identity and complement. Jh4o allows 240 mappings because its central digits can permute freely.
A complement-only fix misses those documented Jh4o histories. Mixed numeric constraints can further restrict these mappings.
Do not apply an unrestricted digit renaming to a mixed source without proving that every companion permits it.

## Remaining integration

Agent A owns this 9×9 work under issue 189. Private history normalization needs independent equivalent and near-miss controls before app integration.
Then add recipes, visible previews, navigation and complete hint/solution/storage flows.
Measure validation, candidates, hints, ratings, exact search, generation, history costs, memory and package size against the released baseline.
Keep incomplete original human paths explicit. Require exact-head CI, ready deployments, downloaded-engine checks and fetched-main source equality before release.

Raw fixtures, scripts, calibration results and archived replies remain under `/tmp/sudoku-renban-generation-research`.
The source fixtures remain in `tests/fixtures/renban-clover.json` and `tests/fixtures/renban-coach.json`.
