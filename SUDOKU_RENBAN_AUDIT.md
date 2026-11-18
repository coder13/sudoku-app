# Renban source and integration audit

Track this family in [issue 55](https://github.com/coder13/sudoku-app/issues/55). The isolated integration starts from main `69289dd`. Main already contains Renban exact solving, logical support, forty-point Medium scoring, three practice positions and template generation. This pass connects the app and preserves complete drawing geometry.

## Published fixtures

[Clover's Renban Sudoku](https://www.gmpuzzles.com/blog/2025/09/renban-sudoku-by-clover/), published on 2025-09-14, contains sixteen givens and twelve three-cell lines. The original puzzle and solution PDFs were rendered and inspected. The fixture preserves the printed completion. Independent digit-array search proves uniqueness in one reference call. Removing Renban gives two completions in 28 calls.

[Clover's Renban Killer Sudoku, Pinwheel](https://www.gmpuzzles.com/blog/2025/12/renban-killer-sudoku-by-clover/), published on 2025-12-19, contains fifteen givens, twelve lines and four 2×2 cages totaling ten each. Its puzzle and solution PDFs were rendered and inspected. Independent search proves uniqueness in one reference call. Removing Renban gives two completions in nine calls. Removing the cages still leaves a unique completion. Structural assertions must retain every cage even though completion-only checks cannot detect their loss.

The fixtures store the PDF URLs and SHA-256 hashes. These independent reference calls differ from native exact-search nodes. They are correctness evidence, not paired performance measurements.

## Original Coach exports

`tests/fixtures/renban-coach.json` preserves six unmodified source codes and their published completions. Three are complete supported 9×9 sources:

| Source | Author | Givens | Renban lines | Independent calls | Without Renban |
| --- | --- | --- | --- | --- | --- |
| [Jh4o, Renban](https://sudoku.coach/en/s/Jh4o) | chirag.urb | 11 | 6 | 37 | Two completions |
| [KUUo, RENBAN 1](https://sudoku.coach/en/s/KUUo) | Tofi | 25 | 2 | 31 | Two completions |
| [BSms, Renbann9](https://sudoku.coach/en/s/BSms) | funnyamliy | 8 | 9 | 45,690 | Two completions |

All three original diagrams were inspected. The source fixture records their hashes and publication dates. No given, line or companion is removed to obtain a passing import.

The remaining originals expose broader gaps. [Ksy3](https://sudoku.coach/en/s/Ksy3) also contains Entropic Line, Palindrome, general totals and a ratio dot. Its full definition remains explicitly unsupported until its Entropic companion is ready. [9uMo](https://sudoku.coach/en/s/9uMo) uses a 6×6 grid and general-difference markers. [5NW](https://sudoku.coach/en/s/5NW) uses legacy SCv4 interchange and a Consecutive Line companion. These originals remain preserved and rejected for those specific gaps. They are not partial imports.

## Compiler and drawing semantics

The primary [Coach compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js) uses `jX1jq.jX61` for Renban. It calls the same `jX25b` connected-component iterator as Palindrome. The iterator traverses shared cells with `jX2ih` and deduplicates logical cells in insertion order with `jX3l9` and `jX2ia`. Separate constraint layers stay separate even when they overlap.

One connected component becomes one non-repeating consecutive set. It does not become one constraint per visible path. The shared app helper now handles both Renban and Palindrome. Optional native `segments` retain original branches, cycles and revisits. Their union must equal the distinct logical `cells` set. They do not add digit occurrences or invent a connecting edge.

```json
{"type":"renban","cells":[0,10,20,40],"segments":[[0,10,20],[10,40]]}
```

The native contract accepts one through nine distinct cells. A one-cell set is unrestricted and produces no Renban deduction. It cannot satisfy a required-family generation target. Omitted `segments` preserves the old wire representation. The existing scoring version 8, costs and technique order stay unchanged.

Renban cells are peers even when they share no ordinary house. App input removes repeated digits and incompatible numerical partners from both Pencil modes. Walkthrough masks remove placed peer digits. Numerical range deductions remain explained logical steps.

The renderer draws original paths, gives each independent clue a numbered accessible label, and keeps overlapping Renban segments in separate lanes. Renban stays visible beneath Whispers and Palindrome. Foreground dots and signs retain their layers. A one-cell clue has a visible marker and an unrestricted-set label.

## Logical profiles and coverage

| Puzzle | Native points/steps | Native status | App points/steps | App status |
| --- | --- | --- | --- | --- |
| Clover Renban | 940 / 77 | Solved Medium | 1,260 / 77 | Solved Medium |
| Clover Pinwheel | 954 / 75 | Solved Medium | 1,184 / 75 | Solved Medium |
| Jh4o | 484 / 16 | Stalled | 15,870 / 122 | Solved Impossible |
| KUUo | 308 / 8 | Stalled | 2,744 / 69 | Solved Impossible |
| BSms | 54 / 2 | Stalled | 54 / 2 | Stalled |

Tests replay every action against the independent published completion. Every Renban proof also receives a separate digit-assignment check. Candidate domains, empty profiles, ordered replay, full/partial walkthroughs, hints, pages, Finder, checked practice answers and actual storage reload are covered. Exact solving enforces Renban when its logical technique is disabled.

Generation checks seeds 17, 43 and 227 with thirty givens, twelve fixed clues, preserved geometry and required Renban dependence. A custom profile prefers Renban first. Repeating its exact score target retains the puzzle. An incompatible zero-point target rejects explicitly. New puzzle presets remain conditional on separate difficulty calibration.

The existing exhaustive 65,536-selection regression stays intact. New coverage adds Renban alone, each of seventeen companion families, every companion pair and the full companion inventory. Of these 155 fixed-clue cases, 153 are compatible and two deliberately contradict their givens. This bounds future test growth while retaining every legacy case. Published sparse fixtures establish Renban dependence separately. These samples do not establish arbitrary clue arrangements as feasible.

Native checks pass 337 tests, including all 262,144 two-cell candidate-domain pairs and independent three-cell and long-set assignments. Sixteen feature combinations, four Wasm profiles and strict full/reduced Cargo documentation pass. Full local checks also pass 466 app tests, 281 Wasm contracts, TypeScript and the 160-route production/offline build. The final foreground-label repair passes eighteen retained line-component contracts. All 7,342 complete comparison responses match current main without normalization: 7,194 variant responses on 47 corpus positions and 354 positive practice positions, plus 148 Classic responses. All 118 detector lists, ratings, full traces and hint pages remain covered.

Static review uses actual React clue paths and CSS at 900/360 pixels in light/dark themes. Grid lines, givens and cage captions are added for comparison. The review covers both published PDFs, three Coach diagrams, branch geometry and independent Renban overlaps with Palindrome, Whispers and dots. The Whispers minimum label now has a separate foreground layer, an explicit contrast outline and a leader when markers share its edge. It stays readable above other lines. This does not replace live viewport interaction review.

The [paired measurements](tests/fixtures/README.md#renban-app-integration) preserve every source response, trace and all 120 generation outcomes. Renban succeeds on nineteen of twenty seeds. Seed 10 reaches the same budget in both builds. App Wasm saves 3,552 gzip bytes, while variant-solver adds 6,301 gzip bytes. Initial XV timing differences do not repeat in a focused control.

All checks passed on reviewed head `673523f` in [run 44348686818](https://github.com/coder13/sudoku-app/actions/runs/44348686818). [PR 157](https://github.com/coder13/sudoku-app/pull/157) reached main at `7ce7fcc`. Both commits are verified ancestors of remote main, and issue 55 is closed.

The passed deployment preview serves the Renban lesson and its clue diagrams. Direct checks of its deployed Wasm prove both published completions. They also retain the complete native traces at 940/77 and 954/75 points/steps. The deployed build has 3,358,134 raw bytes and SHA-256 `60152ee3a3a4cc8771f0762b020df818c2d225911c9a4f8b38a99d25f447eab7`. Local benchmark hashes and package measurements remain those in the fixture report. These HTTP and direct-Wasm checks do not replace live viewport review.

[Issue 158](https://github.com/coder13/sudoku-app/issues/158) tracks BSms human solve coverage. Browser interaction, calibrated app presets, unsupported companion rules and remaining worker/performance costs stay open.
