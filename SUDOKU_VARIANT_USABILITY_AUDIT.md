# Existing 9×9 variant usability review

Agent A owns [issue 281](https://github.com/coder13/sudoku-app/issues/281). This review covers existing 9×9 puzzles, including combined rules. Further variant additions stay in the backlog. Agent D handles performance work independently on another machine; this review does not change its protocol or import-preview work.

## Inventory

The named inventory comes from `PUZZLE_VARIANTS` in [variants.ts](src/sudoku/variants.ts): 28 variants plus Classic. These represent all 27 native rule types and Jigsaw layouts. A named variant, a native rule type and a combination of rules are different counts.

New Puzzle has 25 released variants plus Classic at review base `49b016b`, including Inequality through [PR 306](https://github.com/coder13/sudoku-app/pull/306). The XV and Two-cell sums drafts add Easy and Medium generation, and the Quadruple draft adds Medium. Their chooser and difficulty previews need live viewport review. [Issue 189](https://github.com/coder13/sudoku-app/issues/189)

The table records available construction paths and review targets. It does not mark browser rendering, interactions or screenshot approval as passed.

| Existing puzzle | New Puzzle | Main visual and rule checks |
| --- | --- | --- |
| Classic | Yes | Digits, candidates, highlighted deductions and controls |
| Killer | Yes | Cage borders, totals, candidates and complete/partial cage coverage |
| Windoku | Yes | Four extra houses, shading and house explanations |
| Diagonal | Yes | Each diagonal separately and both together |
| Jigsaw | Yes | Actual region boundaries, region clues and region-based deductions |
| Anti-Knight | Yes | Rule discovery, related cells and conflicts across boxes |
| Anti-King | Yes | Corner neighbors and conflicts across region boundaries |
| Non-Consecutive | Yes | Unmarked edges, declared exceptions and candidate cleanup |
| Whispers | Yes, German/Dutch | Minimum differences, independent touching paths and overlap lanes |
| Global Entropy | Yes | Every 2×2 area, including across region boundaries |
| Entropic Lines | Yes | Group colors, repeated positions and separate touching paths |
| Modular Lines | Yes | Remainder groups and distinction from Entropic Lines |
| Renban | Yes | Complete sets, branches, overlaps and authored drawing segments |
| Inequality | Yes | Direction, distant endpoints, comparison connectors and preview legibility |
| Palindrome | Yes | Matching positions, free center and split source paths |
| Odd/Even | Yes | Circle/square distinction, candidates and accessible cell descriptions |
| Between Lines | Yes | Endpoint circles, skipped cells and independent touching paths |
| Region Sum Lines | Yes | Region visits, explicit grouping, closed paths and skipped cells |
| Little Killer | Yes | All diagonal directions, outside totals and legal repeated digits |
| Sandwich | Yes | Outside totals, direction and zero clues |
| X-Sums | Yes | Outside direction, starting digit and complete counted prefix |
| Skyscrapers | Yes | Visibility direction and distinction from outside sums |
| Clone | Yes | Matching letters, disconnected copies and candidate insets |
| Thermometer | Yes | Bulb, increasing direction and overlapping comparisons |
| Arrow | Yes | Circle, arrowhead, sum path and candidates |
| Kropki | Yes | White/black dots and each negative rule |
| XV | Easy and Medium draft | V/X distinction and each negative rule |
| Two-cell sums | Easy and Medium draft | Roman totals, shared markers and distinction from XV |
| Quadruple | Medium draft | Repeated digits, cage-caption spacing and corner placement |

Ruleset review also covers Disjoint Groups through typed extra houses, custom extra houses, single diagonals, positive/negative Kropki and XV, Non-Consecutive exceptions, Whispers parameters, Region Sum grouping modes, Jigsaw companions and complete mixed definitions. German and Dutch Whispers are separate generation presets in [variant-rulesets.ts](src/sudoku/variant-rulesets.ts). These are existing rule configurations, not additional named variants.

## Existing automated evidence

[puzzle-help-wasm.mts](tests/puzzle-help-wasm.mts) exercises the first recipe at each offered variant difficulty: starting/progressed positions, invalid candidates, complete generated walkthroughs, sound actions, selected-technique results and Finder target counts. It also checks disabled ordinary hints, explicit technique inspection, Jigsaw catalog rows, hint collections and the preserved mixed fixtures. XV, Two-cell sums and Quadruple have dedicated Wasm contracts for imports and generation. This is not a check of every possible generated puzzle.

[variant-help-components.test.ts](tests/variant-help-components.test.ts) checks hint, solution and Finder affordances for every named puzzle in standard and advanced workspaces. Its component trees and server-rendered markup do not establish working pointer/keyboard interactions, layout, contrast or readable clue placement in a browser.

[variant-technique-scan.test.ts](tests/variant-technique-scan.test.ts) checks rule-sensitive counts, shared observers, position isolation and cancellation without cancelling foreground or selected help. [variant-hint-validation.test.ts](tests/variant-hint-validation.test.ts) checks incorrect placements and missing required candidates before engine work starts. These contract checks still need live interaction review.

Existing compatibility matrices and independently checked completion witnesses cover many combinations. They do not prove every clue arrangement is feasible, every rule is necessary or every imported puzzle has a complete human walkthrough.

## Published Coach links

The local app opens a 9×9 Coach short link when the resolver can match its publication record to the requested puzzle and the export contains supported rules. The publication title survives save and share. Unsupported author instructions and markings still require source-format work. [Coach interchange](https://github.com/coder13/sudoku-app/issues/7)

The actual published Between the Dots response keeps all twelve Between Lines and eleven black dots, several opening hints, matching Technique Finder counts and a 62-step partial walkthrough. A separate published Renban short link reaches its complete solution. Its short-link and pasted-code walkthroughs match. Diamond Sandwich remains rejected because its author instructions change how clues count digits. [Between the Dots](https://sudoku.coach/en/s/9KxH) · [Renban](https://sudoku.coach/en/s/Jh4o) · [Diamond Sandwich](https://sudoku.coach/en/s/D8HP)

The X sums #3 short link combines the verified publication’s X-Sums declaration with the sixteen numeric labels in its export. The imported rules match the independent transcription, give multiple ranked hints and matching X-Sums Finder counts, and retain a complete Hard walkthrough and title through sharing. Typed companion rules pass through the same importer. Raw codes with untyped text, extra authored rules and ambiguous clue geometry still reject. [X sums #3](https://sudoku.coach/en/s/AsnF) · [Short-link contracts](tests/coach-short-links-wasm.mts)

Entropic 7 / 13 sums keeps all twenty-seven sums and both black dots alongside Global Entropy. The short link verifies that the encoded rules account for the publication’s legend and skips the empty Consecutive Line layer. The same raw code imports with all active rules. Tests replay the complete Medium walkthrough in Play and check the opening sum hints, Technique Finder and sharing. [Entropic 7 / 13 sums](https://sudoku.coach/en/s/HqJ9) · [Short-link contracts](tests/coach-short-links-wasm.mts)

The short link for *That’s 3 in the corner* applies the complete black-dot instruction from its publication while preserving all 24 printed dots and its other rules. Play explains what unmarked edges mean. Import verifies the published exact solution and retains the rule in shared puzzles. The walkthrough reports its 28-step stall. [That’s 3 in the corner](https://sudoku.coach/en/s/K95q)

The legacy decoder reads 9×9 SCv4, SCv5 and SCv6 puzzle records and translates their supported constraints into the same rules as current exports. The 2j53 short link and raw code preserve its givens and Global Entropy. The app verifies the published solution, gives ranked hints and completes the Easy walkthrough. Legacy codes with authored markings, playing annotations or unsupported rules still need import support. [Published puzzle](https://sudoku.coach/en/s/2j53) · [Coach compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js)

The 9×9 SCv7 Current State importer restores placed digits and center and corner candidates in preview and Play. The original givens and rules determine the unique solution and puzzle rating. A different saved position gets a separate attempt, and imported progress has no recorded solve time. Tests cover a mixed-rule import with an incorrect placed digit, both candidate styles, and save and reload. Player colors, other annotations, and fog progress still need coverage. [Coach import](https://github.com/coder13/sudoku-app/issues/7) · [Wasm import contracts](tests/variant-import-wasm.mts)

The Cmdt short link and pasted code keep five extra regions, both diagonals, ten Killer cages, 21 Quadruples, 18 Thermometers, and 16 Whispers paths with a minimum difference of two. The app draws the regions and cage totals in its own style. The short-link importer accepts the source color groups only after checking that each maps to an entire encoded region. Desktop and mobile markup show every clue family. Ranked hints, Thermometer Finder results, and a 169-step Medium walkthrough were checked against the published solution. [Published puzzle](https://sudoku.coach/en/s/Cmdt) · [Short-link contracts](tests/coach-short-links-wasm.mts)

Cmdt shares 31 edges between Whispers and Thermometers. The 9×9 renderer draws a separate stroke for each clue along those edges and stops the Thermometer stroke at the bulb. Two Whispers minimum labels move beside their Quadruple circles and point back to the line. Compact boards use a larger minimum label. The component checks verify all 31 shared edges, both moved labels, and all 16 printed minimums. [Rendering checks](tests/whispers-components.test.ts)

The German Whisper Line Basics lesson preserves 15 paths and all 44 shaded cells. The app derives each cell's minimum distinct linked digit count from the line geometry and Sudoku houses, then draws its own digit guide. Import checks the source colors, legend, and published declaration. The guide survives restart, reload, and sharing. Wasm verifies the published solution, gives ten opening hints, and completes the 124-step Medium walkthrough. Desktop and mobile component checks cover all four legend groups. [Published lesson](https://sudoku.coach/en/s/B5mt)

The 220V short link verifies the original export and author legend before recovering the drawn clues. It follows the cell centers of five blue Region Sum paths and joins the orange strokes into one Entropic path with three visits to the center. The blue line from R5C7 to R2C6 passes through R4C6 and R3C5, with a drawn offset at the adjacent R3C6 corner. Desktop and mobile component checks cover all nine Region Sum lines, four Entropic paths, two Modular paths, and cells shared by multiple lines. Direct enumeration finds the published solution in 42 search nodes. Play offers four opening Region Sum hints and Finder reports 30 distinct actions. The walkthrough now reaches 32 steps and 1,045 points before stalling. The additional deductions use shared houses with Entropic and Modular Lines. The raw code omits the legend required for this reconstruction. [Published puzzle](https://sudoku.coach/en/s/7rs9) · [Short-link contracts](tests/coach-short-links-wasm.mts)

In the 220V regression, the first Region Sum hint removes candidates without placing a digit. Both ranked hints and selected Region Sum proofs omit those removals afterward, and Finder agrees with the distinct targets in the selected proofs. Removing a candidate by hand from a complete set of Pencil candidates also changes the selected results. Undo and redo restore the matching counts and proofs. Worktable now ties pending and revealed hints to the same givens, rule definition and candidate state. [Hint guard tests](tests/variant-hint-validation.test.ts) · [Short-link contracts](tests/coach-short-links-wasm.mts)

9×9 Region Sum paths that end in a cell shared with another Region Sum line now stop slightly short of its center. Each cap and any dashed endpoint dot stay inside the logical cell. The gap also applies to overlapping strokes. Closed paths and continuous joins within one clue keep their full geometry. Tests cover 220V at both layout sizes, including the three distinct Region Sum lines at R2C6. [Rendering checks](tests/region-sum-components.test.ts)

The placed-digit checks now include parity, Thermometers, Arrow sums, Killer totals and Quadruple circles in 9×9 Play. Tests cover both Pencil modes, manual and bulk entry, undo and redo, and every partial four-cell state for four representative Quadruple clue patterns in boxes and Jigsaw regions. The local feedback checks use the placed digits; the full engine continues to compute candidates and solutions. [Play tests](tests/variant-placed-rules.test.ts)

Whispers feedback now follows connected clues through empty cells, including touching German and Dutch lines. Play flags incompatible placements and clears unsupported candidates in either Pencil mode. The local calculation is exact for trees and a single loop. With several loops, it removes candidates only when the connected checks disprove support. Independent enumeration checks 110,000 partial positions. In the local JavaScript benchmark, the median added time for conflict checks was 0.003 ms on Brain Zaps and 0.007 ms on the encoded K95q rules. The median added time for entering a digit stayed below 0.003 ms on both. [Play tests](tests/variant-placed-rules.test.ts)

The Ksy3 short link checks the verified author description against the encoded rules. Each Palindrome has a Renban covering one half, with the center included for the odd-length path. All nineteen colour combinations identify pairs of mirrored cells. Import retains seven Renbans, four Palindromes, nineteen adjacent sums, a black dot, and an Entropic path. The current source page gives ten opening hints, matching Technique Finder targets, and a complete 159-step Medium walkthrough at 2,680 points. Independent enumeration finds the published unique solution, and sharing retains the full rules. Changed instructions, missing Renban halves and unrelated colours are rejected. A comparison of seventeen captured publications raises short-link acceptance from nine to ten, with identical results for the other sixteen. [Published puzzle](https://sudoku.coach/en/s/Ksy3) · [Short-link contracts](tests/coach-short-links-wasm.mts)

Standalone greetings and two verified author notes now pass the short-link check. The current KUUo, EoGB and HCHW publications keep both Renbans, the 51-cell Entropic path, and all 22 Modular and companion clues, respectively. Independent enumeration verifies all three published answers. Each gives ten opening hints, matching Technique Finder results, and a saved and shared definition with every rule. KUUo and EoGB complete 69-step walkthroughs. HCHW now reaches a 128-step stall with 18 correct placements. Play explains how two separate sums reserve digits across rows, columns, and boxes. Technique Finder counts eight removals from the two hints at the archived position. The engine combines Modular Lines with adjacent sums and shared houses, including sums with a partner off the line. The same seventeen captured publications now accept thirteen short links, up from ten. The four remaining captures need Consecutive Lines and legacy colors, outside digit-group order clues, Fog, or Terrain rules. [RENBAN 1](https://sudoku.coach/en/s/KUUo) · [Entropic Snake](https://sudoku.coach/en/s/EoGB) · [Modular VII/XIII 2](https://sudoku.coach/en/s/HCHW) · [HCHW reasoning gap](https://github.com/coder13/sudoku-app/issues/175)

## Play feedback performance

Play indexes pair exclusions once per immutable rule list. Directed clues stay attached to their source cells, and global Kropki, XV, and Non-Consecutive layers still check their edge exemptions together. Digit entry shares each removal mask between center and corner candidates.

Local Node 26.13.0 measurements on macOS arm64 compared the normal Play entry points against `733b7d76`. Times are median/p95 in milliseconds. Each warmed operation uses 160 paired samples. A fresh midgame sample uses a new rule list, with 80 pairs. The benchmark alternates invocation order and checks conflict sets, resulting positions, and move history before timing.

| Fixture and operation | Baseline | Indexed |
| --- | ---: | ---: |
| Classic midgame conflicts | 0.036 / 0.069 | 0.029 / 0.035 |
| B5mt midgame conflicts | 0.575 / 0.639 | 0.051 / 0.085 |
| Cmdt midgame conflicts | 2.017 / 2.234 | 0.253 / 0.351 |
| Cmdt fresh midgame conflicts | 1.821 / 2.036 | 0.226 / 0.283 |
| Cmdt entry with candidates | 0.697 / 0.806 | 0.181 / 0.242 |
| Cmdt entry without candidates | 0.696 / 0.874 | 0.033 / 0.051 |
| Cmdt bulk fill | 6.190 / 7.127 | 2.617 / 2.960 |
| Jigsaw Killer midgame conflicts | 0.104 / 0.116 | 0.066 / 0.073 |

All 472,392 directed pair-and-digit masks match, including split Kropki/XV layers, V/X sums, Clone closure, repeated paths, and reversed rule order. Opening conflict p95 increased by 0.002 ms on Cmdt and 0.001 ms on encoded K95q in this run. The index retains about 3.3 KB per Cmdt-sized rule list in a forced-GC Node sample. Production JavaScript adds 199 gzip bytes, and the Wasm is byte-identical. Browser rendering and input-to-paint timing still need a live trace. [Benchmark](scripts/bench-variant-play.mts) · [Performance tracking](https://github.com/coder13/sudoku-app/issues/88)

Reproduce from this worktree using a baseline checkout, or unpack its source inside `target` so Node can resolve the installed dependencies.

```sh
mkdir -p target/qa/play-feedback-baseline
git archive 733b7d76 src/sudoku | tar -x -C target/qa/play-feedback-baseline
node --expose-gc --experimental-strip-types scripts/bench-variant-play.mts target/qa/play-feedback-baseline
```

## Priority controls

Use complete source definitions, including every companion clue and parameter. Start browser review with these controls, then cover every table row:

1. A generated Jigsaw puzzle in both workspaces, with region hints and Finder selection.
2. `inequality-palindrome14.json`: all signs, Palindromes and white dots; preserve its partial 98-point, nine-step human path.
3. `renban-killer-clover.json` and `renban-coach.json`: set/cage intersections, overlapping clues and the original partial BSms path tracked in [158](https://github.com/coder13/sudoku-app/issues/158).
4. `region-sum-coach.json`: explicit groupings, closed geometry and FaxQ's limited opening hints. Human coverage stays visible alongside [192](https://github.com/coder13/sudoku-app/issues/192).
5. `little-killer-menace.json`: fourteen Renban sets and four outside sums. Its exact solution is separate from its zero-step human stall; joint reasoning is tracked in [202](https://github.com/coder13/sudoku-app/issues/202).
6. `skyscrapers-jigsaw-mixed.json`, `x-sum-jigsaw-mixed.json` and `sandwich-jigsaw-mixed.json`: outside gutters, region boundaries, labels and direction.
7. `xv-quadruple-clover.json`, `adjacent-sum-coach.json` and `clone-mixed.json`: shared marker space, repeated printed digits and candidate insets.

For each control, check starting, correctly progressed and explicit-removal states. Check both Pencil modes, placement cleanup, conflicts, undo/redo, reload and sharing. Compare ordinary hints, selected hints, paged hints and Finder against that same current position. Confirm stale results cannot apply after an edit. A genuine zero-hint state stays visible; exact completion must not become an invented logical explanation.

## Browser review and approval

The user authorized the built-in browser. Its runtime currently fails with `Trusted RPC service is not configured: browser`, including after a preview tab opened. Actual app screenshots have not been captured. Existing exported SVG figures and component markup are diagnostic evidence only.

Pending captures must show the actual app at narrow and desktop sizes, light and dark themes, and increased app/grid text sizes. Review empty/full candidates, overlaps, outside clues, Jigsaw borders, focus, menus, hint stages, selected Finder results and solution navigation. Include enough context to identify the puzzle and state. Share the screenshots for approval before merging broader visual changes.

No browser review or screenshot approval is complete. Preserve the open checklist in [SUDOKU_ENGINE_TODO.md](SUDOKU_ENGINE_TODO.md) as each part is verified.
