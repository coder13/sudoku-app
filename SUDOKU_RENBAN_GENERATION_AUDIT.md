# Renban New Puzzle integration

Agent A implements Medium Renban generation under [issue 189](https://github.com/coder13/sudoku-app/issues/189).
The current base is main `3429f0b`. It includes Kakuro, pause-setting synchronization and the issue-labeling skill.
Performance, package and exact-head release checks remain pending. This document does not claim a release.

## Sources and generation

Each Renban set contains distinct consecutive digits in any order. Independent sets stay independent, including when their drawings touch or overlap.
Public drawing paths and original proof indices remain intact. Exact enforcement does not depend on the enabled human technique.
The existing technique remains 40-point Medium under scoring version 8.

Complete Clover, Jh4o, KUUo and BSms fixtures retain their original givens, rules and independently checked completions.
The mixed Pinwheel source retains all four Killer cages. BSms's original human path remains partial in issue 158.
The new recipes derive fresh givens from complete pure-source geometries. They do not replace the original published fixtures.

[Preparation](SUDOKU_RENBAN_GENERATION_RESEARCH.md) records one-attempt seeds 1–100, explicit ranges and 20,000-node checks.
Thirty recipes use Clover, Jh4o and BSms, with five seventeen-given and five twenty-given choices per geometry.
KUUo remains a complete control because its sparse completion-based yield is low.
The recipes use three full completion templates. [Issue 262](https://github.com/coder13/sudoku-app/issues/262) tracks broader completion diversity separately from different givens.
Every selected recipe is independently unique, needs Renban, offers several hints and completes a Medium app-order path.
Preparation checks 380 direct Renban proofs and 3,497 actions against independent completions.

The chooser uses the existing shared controls, difficulty handling and Renban renderer.
Its preview shows two complete Clover sets. Stories retain the existing Kakuro navigation example and add Renban choice/difficulty examples.
Only calibrated Medium is offered. Unsupported saved levels resolve to Medium.
Completed pure Renban puzzles offer another puzzle. Complete mixed originals retain every companion and the existing mixed-puzzle navigation.

Fresh search keeps the existing 20,000-node allowance and deterministic checked fallbacks.
Seed 11 reproduces a fresh miss and reaches its checked Jh4o fallback.
The generic twelve-attempt retry remains available after the checked pool is exhausted.
The current sixty-request probe does not independently establish that this last retry branch was reached.

## Private duplicate detection

The archived thirty exclusion probes contain seventeen failures. All thirty now exclude the original result or return an honest search limit.
Three original KUUo controls already reached their limit after exclusion.
The fixture retains complete prior definitions and independently valid completions for every probe.

The private key uses complete unordered Renban cell sets. It removes unrestricted singleton sets and coalesces duplicate rules.
It never replaces a long Renban with drawing windows or joins touching sets.
Nine-cell Renban becomes a private Extra House. Non-covering nine-cell distinct Killer cages with total 45 use the same representation.
Positive white dots become two-cell Renbans only when no Kropki negative flag is active anywhere in the puzzle.
Other black-dot constraints remain present.

That negative-flag guard is necessary. A white marker exempts its edge from negative black dots, while an independent Renban does not.
A native numerical witness permits 1/2 on the marked edge and rejects it on the unmarked Renban edge.
The keys keep those puzzles distinct. Full covering-cage normalization remains conservative.

Independent enumeration checks all 362,880 digit bijections against literal allowed intervals.
For lengths 2–5, only identity and complement survive. Lengths 6, 7 and 8 allow 12, 240 and 10,080 mappings.
Native tests compare every accepted mapping under every square transform and retain invalid-mapping controls.
Mixed numeric companions conservatively disable digit renaming. Nine-cell sets use the existing digit-invariant house behavior.

For length k in 6–8, all allowed intervals contain the central band from 10−k through k.
The private key names those freely permutable digits by first appearance and compares both complement orientations.
The test oracle derives permitted mappings from interval images rather than this formula.
Jh4o's complete length inventory permits 240 mappings. A complement-only repair does not cover its aliases.

The app now passes complete variant-game history to native generation across display labels.
Previously it filtered by the current variant family. Equivalent mixed imports with nine-cell Extra Houses therefore bypassed the native exclusion check.
The actual New Puzzle caller now excludes that mixed import as well as reordered, reflected and digit-renamed pure sources.
This change preserves the full historical rule definitions.

## Validation and remaining gates

The first source commit `ab44421` passes 386 native tests, including seven Cargo examples, and the reduced variants all-target check.
Its fresh Wasm passes 505 contracts. All 673 app tests, strict new-contract types and the earlier 131-component catalog pass.
Every one of the thirty recipes and sixty successive actual puzzles retains independent uniqueness, Renban dependence and multiple sound hints.
Generated solutions replay through the actual game state with independently enumerated Renban premises.
Actual persistence, progress, undo/redo, exact solution access and sharing preserve the complete puzzle.

The integration commit `7a5eeb2` applies that source to current main and preserves both Kakuro and Renban stories.
Its Rust source, Cargo inputs, build script and dependency locks are byte-identical to the tested source commit.
App types and the updated 137-component catalog pass. All 682 combined-main app tests and 505 Wasm contracts pass.
The earlier worktree stays preserved with its separate AGENTS.md edit.

A longer actual-app probe completes one hundred successive requests without repeats or search limits.
Every result is independently unique and Renban-dependent, with several sound hints.
It directly checks 770 app-delivered Renban proofs after unwrapping their retained native evidence and confirming the complete source puzzle.
The sixty-request regression separately replays every generated solution through actual game state.

Complete comparison preserves 1,535 native response pairs, omitting only transport IDs.
Twenty-five source controls cover starting, placed and explicit-removal positions, plus initial exact checks.
All 705 preceding recipe requests and complete responses match.
All 280 further one-attempt generation probes match, with 169 successes and 111 honest search limits at 20,000 nodes per exact check.
Both engines retain 6,291,456 bytes of linear memory after this corpus. This is capacity, not live allocation or process memory.

## Controlled measurements

Darwin arm64, Node v26.13.0 and the same installed stable Rust profile produce both measured artifacts.
Each timing has five warmups and forty samples. Paired native calls alternate execution order.
Independent assertions run outside timing. No audit-owned compiler, suite or other runtime benchmark runs alongside.
The host is not dedicated. The in-process adapter excludes worker startup, transfers, browser layout and paint.
Ordinary hints do not measure exhaustive all-technique scans.

| Actual app caller | Median ms | p95 ms |
| --- | ---: | ---: |
| published Clover preview | 0.534 | 0.691 |
| published candidates | 0.029 | 0.033 |
| published ordinary hints | 0.174 | 0.250 |
| published app rating | 0.177 | 0.190 |
| published exact solve | 0.133 | 0.140 |
| published walkthrough | 1.093 | 1.458 |
| actual Medium New Puzzle | 4.235 | 14.524 |
| fresh miss and checked fallback | 13.410 | 13.513 |
| thirty played Renban puzzles | 4.409 | 4.505 |
| three hundred mixed played puzzles | 12.829 | 12.983 |

Forty-five empty-history requests produce forty-one logical identities in that sample.
The hundred-request saved-history probe verifies distinct results separately.
The larger timing input keeps thirty Renban puzzles plus 270 checked puzzles from other families.
Complete cross-family history costs about 8.4 ms more than that thirty-puzzle input in this run.
This finite sample does not establish every seed, history or latency bound.

| Fixed native history control | Prior definitions | Before median/p95 ms | After median/p95 ms |
| --- | ---: | ---: | ---: |
| Renban Medium, seed 99 | 30 | 4.475 / 4.635 | 4.542 / 4.770 |
| Modular Medium, seed 99 | 30 | 3.607 / 3.745 | 3.615 / 3.740 |
| Entropic Medium, seed 99 | 30 | 3.580 / 3.660 | 3.589 / 3.687 |
| Global Entropy Easy, seed 99 | 30 | 2.269 / 2.335 | 2.268 / 2.319 |
| Global Entropy Medium, seed 99 | 30 | 4.046 / 4.108 | 4.020 / 4.143 |
| Palindrome Easy, seed 99 | 30 | 1.244 / 1.324 | 1.233 / 1.295 |
| Palindrome Medium, seed 102 | 30 | 1.851 / 1.901 | 1.844 / 1.952 |
| Clone Easy, seed 99 | 3 | 0.639 / 0.670 | 0.635 / 0.679 |
| German Whispers, seed 99 | 30 | 2.798 / 2.867 | 2.801 / 2.967 |
| Dutch Whispers, seed 99 | 30 | 4.625 / 4.718 | 4.634 / 4.764 |

Every full response matches in those fixed controls, including all warm and measured calls.
Correct Renban identity adds about 0.067 ms at thirty prior definitions. Other medians and tails vary.
Both native instances retain 1,638,400 bytes after the history corpus.
That smaller corpus has a different memory scope from the twenty-five-source comparison above.

The production build prerenders 181 routes and passes four actual-build offline contracts, including every Kakuro board.
Static light/dark previews use actual SVG and CSS at 290 and 540 pixels. The 290-pixel exports are visually inspected.
Actual route renders preserve the choice and difficulty screens. These checks do not prove browser interaction or paint behavior.

## Package and release gates

The local artifact is 3,421,223 raw / 897,346 default-Node-gzip bytes, SHA-256 `ec01ce612480cce382a0ad7a8f8a215e40b3baf0b67a79fd4ec4d60aa86f516e`.
The Modular baseline is 3,417,504 / 895,333 bytes, SHA-256 `c0197bc5572a71059465d27cda4647ae131dd3c30a8204bbcda40706aa7e6927`.
The observed delta is +3,719 raw / +2,013 gzip bytes. Build-path effects can influence these totals.

At base `3429f0b`, matched client assets total 6,420,073 raw / 2,105,189 gzip JavaScript bytes and 319,471 / 45,599 CSS bytes.
The same-main baseline gives +8,662 raw / +470 gzip JavaScript bytes and unchanged CSS.
Totals sum default Node gzip per asset, excluding HTML, service workers and manifests.
All five generated metadata JSON files and both dependency locks match.
Newer main integrations require refreshed builds and measurements before release.
Exact-head capability/profile/docs/deployment gates remain pending.
Retain partial original paths and remaining source-format gaps. Generation of these checked puzzles does not close the broader engine goal.

Raw calibration, fixtures, archived replies, logs and comparison scripts remain under `/tmp/sudoku-renban-generation-research`.
