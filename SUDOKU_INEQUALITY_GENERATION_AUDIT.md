# Inequality New Puzzle integration

Agent A implements Easy/Medium Inequality generation under [issue 189](https://github.com/coder13/sudoku-app/issues/189).
The measured base is main `ea81360`. The current-main integration starts at `b9ffe95` and preserves the released 6×6, solving-settings and shared Play changes.
Measurements below describe the isolated Inequality change at the stated base. Combined-current-main CI remains a release gate. This is not a release record.
Local validation and matched measurements are complete. Exact-head CI and release gates remain pending.

## Generation and source controls

The engine samples a fresh completed grid and derives each sign from its two digits.
Recipes contain comparison positions, seed and bounds. They do not contain a fixed completion.
The existing technique stays eight-point Easy under scoring version 8.

One layout uses the seven comparison positions from CodeNameVerity's Palindrome 14, Coach FzzD.
These are new pure-rule constructions. The complete published mixed puzzle stays in `inequality-palindrome14.json`, with all three Palindromes and five white dots.
Its original human path remains honestly partial at 98 points after nine steps.
Two additional layouts are constructed: 27 distributed comparisons and 27 connected comparisons with both horizontal and vertical edges.

One-attempt seeds 1–100 use the actual app order and 20,000 nodes per exact check.
Easy targets 0–30 givens. Medium targets 18–30 givens.
Every accepted result is independently unique, needs inequalities and has the requested complete logical difficulty.
These are yield and independent-verification runs, not controlled performance comparisons.

| Comparison layout | Signs | Easy accepted | Medium accepted |
| --- | ---: | ---: | ---: |
| FzzD positions | 7 | 86/100 | 43/100 |
| Distributed | 27 | 96/100 | 21/100 |
| Connected | 27 | 100/100 | 30/100 |

Every accepted seed in each row/level has a distinct completion in that sample.
Sixty selected recipes use ten per layout per level and sixty distinct completions across the complete selection.
Their traces retain matching scores, status, hardest technique and action counts.
Generation records the enabled difficulty prefix. The actual app trace records the complete app order.
All 568 direct inequality proofs pass independent enumeration of the permitted digit pairs.
All 4,408 trace actions agree with independent completions, and every selected puzzle offers several opening hints.

Fresh search retains the existing 20,000-node allowance. Easy allows one fresh attempt and Medium allows six.
A bounded actual-app probe of one hundred Medium requests improves distinct completions from 41 to 93 with that change.
Both budgets return one hundred distinct, independently unique rule-dependent puzzles with multiple hints and no search limits.
Checked fallbacks and bounded twelve-attempt recovery remain available after fresh search.
Easy seed 7 and Medium seed 17 reproduce fresh misses and reach their first checked fallback.
The chooser offers only Easy and Medium. Unsupported saved levels resolve through the existing difficulty selection.
Shared sign rendering, choice/difficulty stories and next-puzzle actions use the existing app controls.

## Played-puzzle identity

Fifteen generated controls retain 45 complete archived prior definitions and witnesses.
Thirty-five previously returned the original puzzle: fifteen complemented grids with reversed signs, fifteen equivalent Thermometer definitions and five redundant transitive comparison lists.
Exact/reordered duplicate controls already worked.
All 45 now exclude the original or report an honest search limit at the same budget.

Private keys treat Thermometers and inequalities as the same directed strict-order relations.
They compute a transitive reduction before square transforms and compare both complemented orientations when companions preserve free digit renaming.
Cyclic orders retain their original contradiction. Public drawing paths, source rules, proof indices and rating costs stay intact.
Numeric companions retain their digits and parameters. Sum, ratio and Arrow witnesses reject an unsafe complemented definition.
This is a conservative equivalence normalization, not a general proof that arbitrary Sudoku definitions differ.

Independent native tests enumerate all 64 forward comparison graphs on four cells against all 9^4 digit assignments.
The resulting 40 truth classes match private identity in both directions, including rotations, reflections and valid complemented signs.
Separate tests retain complete Thermometer paths in public definitions, preserve numeric companions and distinguish reversed signs without complemented givens.
The full native suite passes 399 tests, including seven Cargo examples.

## App validation and remaining gates

The six focused Wasm contracts pass every recipe, sixty actual successive puzzles and all 45 archived exclusions.
Every actual puzzle has independent uniqueness, rule dependence, several sound hints and complete replay through game state.
Actual imported Thermometers and transformed/complemented signs are excluded across display labels.
The app's existing cross-family history handoff remains in use.

Actual storage retains complete rules, rating, entered digits and undo/redo.
The UUID sharing round trip uses the production Worker with isolated SQLite and the actual app preview service.
It retains the full definition and exact solution without carrying the sender's progress.
Seven focused component/import contracts cover the chooser, supported levels, shared sign preview, next-puzzle behavior and the complete mixed source.
Strict contract types and the 147-component catalog pass.
The full app/Wasm runs pass 707/520 contracts before the final preview crop and Medium budget adjustment.
Nine focused component/import contracts and six focused Wasm contracts pass after those final adjustments.

A one-hundred-request probe per level returns one hundred distinct puzzles without search limits under the initial one-attempt policy.
Its Easy run has 89 distinct completions and 401 direct opening proofs; its Medium run has 41 completions and 697 direct proofs.
The actual-app budget comparison retains independent uniqueness, rule dependence and several hints, and raises Medium completion diversity to 93 with six fresh attempts.
This is a finite sample. Distinct puzzles and distinct completed grids are separate measurements.

All 1,627 complete response pairs match the released engine, omitting only transport IDs.
The corpus contains 26 source controls in starting, placed and explicit-removal states, all 735 preceding recipes and 320 one-attempt generation probes.
The latter produce 195 successes and 125 honest search limits at 20,000 nodes per exact check.
Both engines retain 6,291,456 bytes of Wasm linear memory after that corpus. This is capacity, not live allocation or process memory.

The final production build prerenders 192 routes and passes five actual-build offline contracts.
Static exports at light/dark, 290/540-pixel frames include the actual 38-pixel preview geometry and CSS.
That review exposed unreadable signs. The final icon zooms the existing sign renderer around the valid 1 < 3 example.
Full-grid callers retain the default 9×9 coordinate view. These exports do not establish browser interaction or full-page layout behavior.
The user authorized the built-in browser, but its control bridge currently reports that the trusted browser RPC service is not configured.
Actual screenshot approval and broader existing-variant usability remain in [281](https://github.com/coder13/sudoku-app/issues/281).

Raw calibration, selected outputs, archived controls and logs remain under `/tmp/sudoku-inequality-generation-research`.

## Controlled caller measurements

Darwin arm64 and Node v26.13.0 use the checked app Wasm, with five warmups and forty samples per call.
Assertions run outside timing. No audit-owned compiler, suite or other runtime benchmark runs alongside.
The host is not dedicated. The in-process adapter excludes worker startup, transfers, browser layout and paint.
Ordinary hints do not measure exhaustive all-technique scans.

| Actual app operation | Easy median/p95 ms | Medium median/p95 ms |
| --- | ---: | ---: |
| preview | 0.229 / 0.612 | 0.257 / 0.276 |
| candidates | 0.018 / 0.022 | 0.014 / 0.018 |
| ordinary hints | 0.238 / 0.785 | 0.116 / 0.200 |
| rating | 0.117 / 0.164 | 0.134 / 0.138 |
| exact solve | 0.030 / 0.034 | 0.050 / 0.051 |
| walkthrough | 0.892 / 1.082 | 0.699 / 1.175 |
| actual New Puzzle | 0.896 / 2.369 | 5.370 / 16.434 |
| fresh miss and checked fallback | 2.683 / 2.793 | 23.713 / 23.854 |
| thirty played puzzles | 4.740 / 4.872 | 8.474 / 8.604 |
| three hundred mixed played puzzles | 21.839 / 22.118 | 16.905 / 17.465 |

Forty-five empty-history calls produce 44 easy identities, 42 medium identities.
Saved-history distinctness is checked separately. The larger history contains thirty Inequality puzzles and 270 checked puzzles from nine other family/preset groups.
The six-attempt Medium policy changes which puzzles are selected, so comparisons with the earlier policy are not constant-output engine speedups.

Paired native history controls alternate call order over five warmups and forty samples.
Every complete before/after response matches, including unsuccessful bounded searches.
Both sides use the same final generation request, including its attempt budget.

| Fixed control | History | Outcome | Before median/p95 ms | After median/p95 ms |
| --- | ---: | --- | ---: | ---: |
| inequality easy | 30 | search-limit | 2.832 / 2.935 | 3.108 / 3.258 |
| inequality medium | 30 | success | 8.079 / 8.422 | 8.408 / 8.949 |
| thermometer easy | 8 | success | 0.933 / 1.037 | 0.993 / 1.100 |
| thermometer medium | 8 | search-limit | 4.159 / 4.225 | 4.236 / 4.342 |
| renban medium | 30 | success | 4.542 / 4.621 | 4.553 / 4.649 |
| modular medium | 30 | success | 3.716 / 3.806 | 3.721 / 3.809 |
| entropic medium | 30 | success | 3.638 / 3.710 | 3.650 / 3.712 |
| global-entropy easy | 30 | success | 2.309 / 2.402 | 2.303 / 2.401 |
| global-entropy medium | 30 | success | 3.988 / 4.129 | 4.063 / 4.180 |
| palindrome easy | 30 | success | 1.253 / 1.294 | 1.233 / 1.293 |
| palindrome medium | 30 | success | 1.878 / 1.939 | 1.856 / 1.891 |
| clone easy | 3 | success | 0.646 / 0.665 | 0.628 / 0.661 |
| whispers medium gap 5 | 30 | success | 2.804 / 2.858 | 2.798 / 2.870 |
| whispers medium gap 4 | 30 | success | 4.683 / 5.001 | 4.690 / 4.946 |

Both instances retain 1703936 bytes after this smaller history corpus.
Its memory scope differs from the 26-source comparison above.

The unchanged complete FzzD source remains a separate slow-import control.
Its preview measures 974.562/1019.264 ms using two warmups and five samples.
Other callers use five warmups and twenty samples: candidates 0.034/0.048, seven opening hints 6.472/8.347, partial walkthrough 6.826/8.707, input with all notes 0.050/0.078 and grid SSR 2.025/3.659 ms.
These are measurements at the stated base. Import-preview performance work is tracked separately in [192](https://github.com/coder13/sudoku-app/issues/192).

## Package and release gates

The local Wasm is 3,681,090 raw / 980,957 default-Node-gzip bytes, SHA-256 `14e2ef7e3514f3e718a433e84d196e6b2c7954de28ccc46223f49ea13e386bd4`.
The retained baseline is 3,679,331 / 977,832 bytes, SHA-256 `6c48528f96e596067aba4838da0d6df73e43fff4ef4d82f394525dab9f89042a`.
Its Rust/Cargo/build inputs are proven byte-identical to the measured base `ea81360`; both artifacts use the same SDK and profile.
The observed delta is +1,759 raw / +3,125 gzip bytes. Build-path and code-layout effects can influence these totals.

Matched client assets total 6,479,492 raw / 2,119,296 gzip JavaScript bytes and 321,909 / 46,248 CSS bytes.
The deltas are +14,479 / +532 JavaScript and +165 / +23 CSS bytes.
Totals sum default Node gzip per client asset, excluding HTML, service workers and manifests.
All five generated metadata JSON files and both dependency locks match.
Exact-head CI must still check capabilities, profiles, complete app/Wasm contracts and strict Cargo documentation before merge.
Production deployment must start for the merge commit. The next priority is existing-variant quality under issue 281.
