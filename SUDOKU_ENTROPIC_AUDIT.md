# Entropic Lines source and integration audit

Track this family in [issue 58](https://github.com/coder13/sudoku-app/issues/58). The isolated integration starts from main `679311f` and incorporates photo-import PR 155 from main `d4235f4`. The research branch contains Entropic support, three practice positions and a 27-point Medium cost. Main needs the native rule, solver, hints, teaching and full app integration together.

## Primary rule contract

[Clover's Numeric Keypad](https://www.gmpuzzles.com/blog/2026/01/entropic-lines-sudoku-by-clover/), published on 2026-01-06, provides an inspected puzzle and solution PDF pair. Its sixteen givens and eight lines form a repeating cycle of low (1–3), medium (4–6) and high (7–9) digits. Each three successive positions use all three groups. Digits can repeat three positions later if other rules allow them.

Independent digit-array counting finds its printed completion in one reference call. Removing the lines leaves two completions in 21 calls.

The [primary Coach compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js) uses `jX1r7.jX61` for Entropic Lines. It maps each source segment to a separate `SudokuConstraint.Entropic`. It does not join touching segments into the connected components used for Renban and Palindrome. Its handler checks sliding triples with a pairwise different-group relation.

For fewer than three positions, it applies the same relation to the whole path. A two-cell path therefore uses different groups. One position is unrestricted.

Closed paths retain the repeated first reference. Revisits retain their original positions. The app does not remove references or silently add a bridge. Separate paths remain independent even when they touch or overlap.

## Complete source corpus

Every original Coach export remains unchanged in `entropic-coach.json`. Independent direct digit relations establish each completion. The counter checks each local pair in the sliding windows rather than copying the engine's phase algorithm.

| Source | Author | Givens | Lines | Independent calls | Without Entropic |
| --- | --- | --- | --- | --- | --- |
| [EoGB, Entropic Snake](https://sudoku.coach/en/s/EoGB) | adboe | 14 | One 51-cell path | 9 | Two completions |
| [BSEJ, Entropic Web](https://sudoku.coach/en/s/BSEJ) | joe | 7 | Eight touching/independent paths | 17 | Two completions |
| [Hyk5, Entropic Loop](https://sudoku.coach/en/s/Hyk5) | Raumplaner | 0 | One closed 36-cell loop, 37 references | 98,928 | Two completions |
| [Hafj, L25 entropic](https://sudoku.coach/en/s/Hafj) | cocolo | 0 | Four paths | 1,797 | Two completions |
| [Ksy3, palindren? renbalindrome? renbananer?](https://sudoku.coach/en/s/Ksy3) | carrion | 0 | One 15-cell path | 1 | Still unique |

Hyk5 retains seven black dots and four white dots. Hafj retains ten V/X marks and three white dots. Ksy3 retains seven Renban sets, four Palindromes, nineteen general sums and a black dot. Its Entropic clue is redundant for uniqueness. Structural equality preserves that clue even though completion equality cannot expose its loss. The earlier Renban corpus keeps its historical release boundary and now points to the full Entropic import.

LEjN, Entropic Spiral, still needs Global Entropy. 7nms, Entropic Order, needs Global Entropy and additional source content. Both complete exports remain preserved and reject explicitly. The port does not remove unsupported companions to manufacture an importable source.

## Native and app design

The native wire rule uses the original ordered `cells` walk. The compiler maps it onto distinct physical cells and their repeating phases. Every support request checks at most six group orders. A cell revisited in different phases has no valid assignment. The definition remains structurally valid and reports a mathematical conflict or unsolvable position. One-cell paths remain valid and unrestricted, and cannot satisfy required-family generation dependence.

Proofs retain the original rule index, distinct cells in first-visit order and their input domains. The independent proof checker enumerates digit groups under every original sliding-window relation. It rejects a deliberately incorrect removal of a supported candidate. Native unit checks exhaust all 262,144 two-cell domain pairs. They also cover three-cell group domains, short paths, repeated digits, valid/invalid closures and a 301-reference walk.

The inherited 27-point Medium cost passes the existing independent proof-effort model. Costs, tiers and default relative order for existing techniques stay unchanged under scoring version 8. The catalog adds only `entropic`. Empty logical profiles still enforce every rule in exact analysis and solving. Three checked practice positions support correct/wrong answer checks, fresh drills and a new Learn article.

The app preserves paths through import, transformations, sharing, actual storage reload and history. Both Pencil modes remove incompatible groups after input. Walkthrough masks remove placed peer digits. Full group deductions remain explained steps. Accessible labels number independent paths and distinguish one/two-cell rules. Shared colored edges use separate lanes, with Palindrome, Whispers, dots and sums retained above the appropriate layers.

## Complete and partial human paths

| Source | Native points/steps | Native status | App points/steps | App status |
| --- | --- | --- | --- | --- |
| Clover | 626 / 73 | Solved Medium | 1,036 / 73 | Solved Medium |
| EoGB | 452 / 69 | Solved Medium | 982 / 69 | Solved Medium |
| BSEJ | 89 / 5 | Stalled | 1,573 / 92 | Solved Medium |
| Hyk5 | 180 / 9 | Stalled | 1,680 / 12 | Stalled |
| Hafj | 107 / 5 | Stalled | 107 / 5 | Stalled |
| Ksy3 | 2,340 / 159 | Solved Medium | 2,680 / 159 | Solved Medium |

Tests replay every action against the independent completion. Positive Entropic proofs receive the separate sliding-window check. Partial paths remain explicitly partial in app walkthroughs. [Issue 162](https://github.com/coder13/sudoku-app/issues/162) tracks the Hyk5/Hafj reasoning gap. Slow Hyk5 rating remains in the broader performance audit. Exact search already verifies their unique completions.

## Integration gates

Native validation passes 344 tests, sixteen feature combinations, four Wasm profiles and strict full/reduced Cargo documentation. After integration with photo import, the app passes TypeScript, 485 tests, all 292 Wasm contracts and twelve focused line-component checks. The new combination extension checks each of eighteen companions, every companion pair and the full inventory. It has 171 compatible cases and two intentional contradictions. These bounded witnesses do not establish arbitrary clue layouts as feasible. The legacy 65,536-selection regression remains intact.

Static review uses actual React clue paths and CSS, with comparison grid lines and givens. Twenty-eight exports cover the six complete source diagrams and a valid mixed-clue overlap at 900/360 pixels in light/dark themes. The closed loop, long path, touching paths and full Ksy3 composition remain visible. Live viewport interaction review stays open.

Generation verifies thirty givens, eight fixed clues, required-family dependence, preferred first technique and exact score targets on seeds 17, 43 and 227. One-cell dependence and incompatible zero-point targets reject explicitly. New puzzle presets remain conditional on separate difficulty calibration.

All 8,167 retained complete responses match without response normalization. This includes 8,019 variant responses across 53 corpus positions and 354 positive practice positions, plus 148 Classic responses. All 118 retained detector lists, scores, traces and hint pages agree. The only catalog addition is `entropic`. The production/offline build passes with 161 routes and retains the measured Wasm artifact.

The [final measurements](tests/fixtures/README.md#entropic-lines-native-and-app-integration) preserve all 120 retained generation outcomes. New Entropic generation succeeds on twenty of twenty seeds. App Wasm saves 2,879 gzip bytes and variant-solver saves 2,462 gzip bytes. Seventeen client JavaScript assets add 1,250 gzip bytes against current main with photo import. The final source run records Hyk5 app rating at 895.314/899.913 ms median/p95 and BSEJ ordinary hints at 121.005/121.980 ms.

All checks passed on reviewed head `49d54c1` in [run 44361287093](https://github.com/coder13/sudoku-app/actions/runs/44361287093). [PR 163](https://github.com/coder13/sudoku-app/pull/163) reached main at `dded30a`. The reviewed commit is a verified ancestor of remote main, and issue 58 is closed. No pre-port main engine supports the new source family, so source timings are absolute measurements. Retained puzzles receive paired comparisons under explicit legacy profiles.


The passed deployment serves the new Learn article and its Entropic diagrams. Direct checks of its deployed Wasm preserve Clover and Ksy3 uniqueness, printed completions and complete native traces. The deployed artifact has 3,402,659 raw bytes and SHA-256 `af2d32ac241bb9ee3b932199dec7adec123c487f0845cab1fc9361ae01580b12`. The local paired benchmark controls retain their separately recorded hashes. HTTP and direct-Wasm checks do not replace live viewport interaction review.
