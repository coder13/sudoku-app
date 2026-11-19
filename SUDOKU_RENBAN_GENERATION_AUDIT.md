# Renban New Puzzle integration

Agent A implements Medium Renban generation under [issue 189](https://github.com/coder13/sudoku-app/issues/189).
The measured base is main `a400d36`. It includes Mini Sudoku, Algebraic Cages, Kakuro, Calcudoku and UUID sharing.
Local validation and matched measurements pass. Exact-head CI and deployment checks remain pending. This document does not claim a release.

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

The current-main integration passes 395 native tests, including seven Cargo examples, and the reduced variants all-target check.
Its fresh Wasm passes 510 contracts. All 702 app tests, strict new-contract types and the 147-component catalog pass.
Every one of the thirty recipes and sixty successive actual puzzles retains independent uniqueness, Renban dependence and multiple sound hints.
Generated solutions replay through the actual game state with independently enumerated Renban premises.
Actual persistence, progress, undo/redo and exact solution access retain the complete puzzle.
The UUID round trip publishes through the production Worker against isolated SQLite, downloads the definition and prepares it through the actual app import path.
The imported attempt preserves all rules and the checked solution, without carrying the sender's progress. Legacy variant links remain covered.
The earlier source worktree stays preserved with its separate AGENTS.md edit.

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
| published Clover preview | 0.594 | 0.815 |
| published candidates | 0.030 | 0.037 |
| published ordinary hints | 0.195 | 0.534 |
| published app rating | 0.188 | 0.235 |
| published exact solve | 0.144 | 0.173 |
| published walkthrough | 1.237 | 2.082 |
| actual Medium New Puzzle | 4.875 | 16.150 |
| fresh miss and checked fallback | 15.227 | 24.908 |
| thirty played Renban puzzles | 4.812 | 5.115 |
| three hundred mixed played puzzles | 13.582 | 14.245 |

Forty-five empty-history requests produce forty-one logical identities in that sample.
The hundred-request saved-history probe verifies distinct results separately.
The larger timing input keeps thirty Renban puzzles plus 270 checked puzzles from other families.
Complete cross-family history costs about 8.8 ms more than that thirty-puzzle input in this run.
This finite sample does not establish every seed, history or latency bound.

| Fixed native history control | Prior definitions | Before median/p95 ms | After median/p95 ms |
| --- | ---: | ---: | ---: |
| Renban Medium, seed 99 | 30 | 4.719 / 4.935 | 4.804 / 5.088 |
| Modular Medium, seed 99 | 30 | 3.808 / 4.014 | 3.868 / 4.102 |
| Entropic Medium, seed 99 | 30 | 3.726 / 4.165 | 3.748 / 3.977 |
| Global Entropy Easy, seed 99 | 30 | 2.344 / 2.606 | 2.337 / 2.606 |
| Global Entropy Medium, seed 99 | 30 | 4.131 / 5.411 | 4.144 / 4.465 |
| Palindrome Easy, seed 99 | 30 | 1.301 / 1.502 | 1.305 / 1.511 |
| Palindrome Medium, seed 102 | 30 | 1.884 / 2.037 | 1.875 / 1.994 |
| Clone Easy, seed 99 | 3 | 0.649 / 0.730 | 0.639 / 0.722 |
| German Whispers, seed 99 | 30 | 2.839 / 2.999 | 2.840 / 2.959 |
| Dutch Whispers, seed 99 | 30 | 4.825 / 5.021 | 4.818 / 5.195 |

Every full response matches in those fixed controls, including all warm and measured calls.
Correct Renban identity adds about 0.085 ms at thirty prior definitions. Other medians and tails vary.
Both native instances retain 1,638,400 bytes after the history corpus.
That smaller corpus has a different memory scope from the twenty-five-source comparison above.

The production build prerenders 192 routes and passes five actual-build offline contracts, including every Kakuro and Calcudoku board.
Static light/dark previews use actual SVG and CSS at 290 and 540 pixels. The 290-pixel exports are visually inspected.
Actual route renders preserve the choice and difficulty screens. These checks do not prove browser interaction or paint behavior.

## Package and release gates

The fresh local artifact is 3,679,331 raw / 977,832 default-Node-gzip bytes, SHA-256 `6c48528f96e596067aba4838da0d6df73e43fff4ef4d82f394525dab9f89042a`.
The matched current-main baseline is 3,676,486 / 977,127 bytes, SHA-256 `9ee1630e4e5cb79d1272204d4de26c309d26428638d8ca2675f63043badc2576`.
The observed delta is +2,845 raw / +705 gzip bytes. Build-path effects can influence these totals.

At base `a400d36`, matched client assets total 6,464,895 raw / 2,118,690 gzip JavaScript bytes and 321,740 / 46,218 CSS bytes.
The same-main baseline gives +8,662 raw / +370 gzip JavaScript bytes and unchanged CSS.
Totals sum default Node gzip per asset, excluding HTML, service workers and manifests.
All five generated metadata JSON files and both dependency locks match.
Both native artifacts use fresh builds of the same current-main backend and SDK. Earlier `3429f0b` measurements remain archived separately.
Exact-head capability/profile/docs/deployment gates remain pending.
Retain partial original paths and remaining source-format gaps. Generation of these checked puzzles does not close the broader engine goal.

Raw calibration, fixtures, archived replies, logs and comparison scripts remain under `/tmp/sudoku-renban-generation-research`.
