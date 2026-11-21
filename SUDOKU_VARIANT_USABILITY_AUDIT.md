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

The 9×9 SCv7 Current State importer restores placed digits, both candidate styles, and player cell and candidate colors in preview and Play. Single colors fill the cell. Multiple colors use adjacent stripes with each shade named in the cell label. The Color controls can replace or erase an imported mark, and undo restores it. This includes color-only progress and Whispers lessons that share a palette between authored guide colors and player colors. The original givens and rules determine the unique solution and puzzle rating. Positions with different colors get separate saved attempts. Imported progress has no recorded solve time. A candidate shade follows its digit as long as the digit remains in either candidate style. A shade imported without a visible candidate appears when that digit is added. Recoloring, erasing, and undo use the existing Color controls. Candidate shades preserve separate attempts and leave solver inputs unchanged. Fog progress remains open. [Coach import](https://github.com/coder13/sudoku-app/issues/7) · [Wasm import contracts](tests/variant-import-wasm.mts)

Raw 9×9 Current State codes also restore Quick Draw lines, edge crosses, and cell circles, squares, and crosses. Preview and Play draw them at their exported positions, and the grid exposes a text description. Clearing imported drawings is undoable and leaves placed digits, candidates, colors, and the verified definition intact. The publication path still checks author instructions and rejects drawings whose role could be an authored clue. [Import and saved attempts](tests/variant-import-wasm.mts) · [Rendering checks](tests/interaction-components.test.ts)

A local Node measurement compares the same placement before and after candidate color import. Across 80 warmed, alternating batches of 100 placements each, the median time was 3.01 to 3.10 microseconds with no colors, and 16.17 to 16.21 microseconds with 81 native candidate colors. Both comparisons produced identical resulting positions. The equivalent case with 81 imported candidate colors took 16.73 microseconds. The test measures Play updates and color cleanup without browser rendering.

The Cmdt short link and pasted code keep five extra regions, both diagonals, ten Killer cages, 21 Quadruples, 18 Thermometers, and 16 Whispers paths with a minimum difference of two. The app draws the regions and cage totals in its own style. The short-link importer accepts the source color groups only after checking that each maps to an entire encoded region. Desktop and mobile markup show every clue family. Ranked hints, Thermometer Finder results, and a 169-step Medium walkthrough were checked against the published solution. [Published puzzle](https://sudoku.coach/en/s/Cmdt) · [Short-link contracts](tests/coach-short-links-wasm.mts)

Cmdt shares 31 edges between Whispers and Thermometers. The 9×9 renderer draws a separate stroke for each clue along those edges and stops the Thermometer stroke at the bulb. Two Whispers minimum labels move beside their Quadruple circles and point back to the line. Compact boards use a larger minimum label. The component checks verify all 31 shared edges, both moved labels, and all 16 printed minimums. [Rendering checks](tests/whispers-components.test.ts)

The German Whisper Line Basics lesson preserves 15 paths and all 44 shaded cells. The app derives each cell's minimum distinct linked digit count from the line geometry and Sudoku houses, then draws its own digit guide. Import checks the source colors, legend, and published declaration. The guide survives restart, reload, and sharing. Wasm verifies the published solution, gives ten opening hints, and completes the 124-step Medium walkthrough. Desktop and mobile component checks cover all four legend groups. [Published lesson](https://sudoku.coach/en/s/B5mt)

The 220V short link verifies the original export and author legend before recovering the drawn clues. It follows the cell centers of five blue Region Sum paths and joins the orange strokes into one Entropic path with three visits to the center. The blue line from R5C7 to R2C6 passes through R4C6 and R3C5, with a drawn offset at the adjacent R3C6 corner. Desktop and mobile component checks cover all nine Region Sum lines, four Entropic paths, two Modular paths, and cells shared by multiple lines. Direct enumeration finds the published solution in 42 search nodes. Play offers four opening Region Sum hints and Finder reports 30 distinct actions. The walkthrough now reaches the published solution in 200 steps and scores 3,815 points (Medium). Three Region Sum with distinct digits proofs account for new candidate removals. Every step agrees with the published grid. The raw code omits the legend required for this reconstruction. [Published puzzle](https://sudoku.coach/en/s/7rs9) · [Short-link contracts](tests/coach-short-links-wasm.mts)

In the 220V regression, the first Region Sum hint removes candidates without placing a digit. Both ranked hints and selected Region Sum proofs omit those removals afterward, and Finder agrees with the distinct targets in the selected proofs. Removing a candidate by hand from a complete set of Pencil candidates also changes the selected results. Undo and redo restore the matching counts and proofs. Worktable now ties pending and revealed hints to the same givens, rule definition and candidate state. [Hint guard tests](tests/variant-hint-validation.test.ts) · [Short-link contracts](tests/coach-short-links-wasm.mts)

On phones, selecting a walkthrough step now opens its explanation card alongside the preview grid. Closing the card keeps the selected step and leaves the editable puzzle and move history intact. [Chromium lifecycle regression](scripts/check-worktable-lifecycle.mjs)

9×9 Region Sum paths that end in a cell shared with another Region Sum line now stop slightly short of its center. Each cap and any dashed endpoint dot stay inside the logical cell. The gap also applies to overlapping strokes. Closed paths and continuous joins within one clue keep their full geometry. Tests cover 220V at both layout sizes, including the three distinct Region Sum lines at R2C6. [Rendering checks](tests/region-sum-components.test.ts)

The placed-digit checks now include parity, Thermometers, Arrow sums, Killer totals and Quadruple circles in 9×9 Play. Tests cover both Pencil modes, manual and bulk entry, undo and redo, and every partial four-cell state for four representative Quadruple clue patterns in boxes and Jigsaw regions. The local feedback checks use the placed digits; the full engine continues to compute candidates and solutions. [Play tests](tests/variant-placed-rules.test.ts)

Whispers feedback now follows connected clues through empty cells, including touching German and Dutch lines. Play flags incompatible placements and clears unsupported candidates in either Pencil mode. The local calculation is exact for trees and a single loop. With several loops, it removes candidates only when the connected checks disprove support. Independent enumeration checks 110,000 partial positions. In the local JavaScript benchmark, the median added time for conflict checks was 0.003 ms on Brain Zaps and 0.007 ms on the encoded K95q rules. The median added time for entering a digit stayed below 0.003 ms on both. [Play tests](tests/variant-placed-rules.test.ts)

The Ksy3 short link checks the verified author description against the encoded rules. Each Palindrome has a Renban covering one half, with the center included for the odd-length path. All nineteen colour combinations identify pairs of mirrored cells. Import retains seven Renbans, four Palindromes, nineteen adjacent sums, a black dot, and an Entropic path. The current source page gives ten opening hints, matching Technique Finder targets, and a complete 159-step Medium walkthrough at 2,680 points. Independent enumeration finds the published unique solution, and sharing retains the full rules. Changed instructions, missing Renban halves and unrelated colours are rejected. A comparison of seventeen captured publications raises short-link acceptance from nine to ten, with identical results for the other sixteen. [Published puzzle](https://sudoku.coach/en/s/Ksy3) · [Short-link contracts](tests/coach-short-links-wasm.mts)

Pasted 9×9 Coach codes, direct play URLs, and short links now check constructor colors against the encoded rules. A color used across an entire extra region is accounted for by the region drawing. A remaining color combination can mark two mirrored cells on a Palindrome with an encoded Renban half. Both uses can overlap on a cell. An unused palette entry makes no claim about the grid. A partial region, a color outside its encoded group, an unmatched pair, and malformed markings report an import error. The mixed test verifies the exact solution, ranked hints, Technique Finder, a full walkthrough, save and sharing. The same 46 captured 9×9 codes retain their acceptance and decoded results, including Cmdt, Ksy3, and the Whispers lesson. [Import tests](tests/coach-short-links-wasm.mts)

Standalone greetings and two verified author notes now pass the short-link check. The current KUUo, EoGB and HCHW publications keep both Renbans, the 51-cell Entropic path, and all 22 Modular and companion clues, respectively. Independent enumeration verifies all three published answers. Each gives ten opening hints, matching Technique Finder results, and a saved and shared definition with every rule. KUUo and EoGB complete 69-step walkthroughs. HCHW now solves from the original givens in 202 app steps. Play and Technique Finder explain the group-line, sum, and house implications, including the box 8 removals and the R2C2 repeat in row 2. The engine combines Modular Lines with adjacent sums and shared houses, including sums with a partner off the line. The seventeen captured publications accepted thirteen short links at that stage, up from ten. Fog support adds the fourteenth. The remaining captures need Consecutive Lines and legacy colors, outside digit-group order clues, or Terrain rules. [RENBAN 1](https://sudoku.coach/en/s/KUUo) · [Entropic Snake](https://sudoku.coach/en/s/EoGB) · [Modular VII/XIII 2](https://sudoku.coach/en/s/HCHW) · [HCHW reasoning gap](https://github.com/coder13/sudoku-app/issues/175)

The published `Fnxt` Fog source starts with R8C1 visible. Coach computes visibility from its initial cells and the current correct placements. A correct placement reveals its cell and up to eight adjacent cells, including diagonals. The archived export's Fog layer has no numeric constraint. The independent counter finds exactly one solution with all companion clues. After a correct 1 in R8C1, the visible X forces 9 in R8C2 and the visible black dot forces 2 in R9C1. Candidates, singles, hints, and Technique Finder use the same engine visibility. Other markers from those source layers remain hidden in the tested view. The 9×9 decoder now keeps the Fog layer from both the pasted code and short link. The app projection keeps visible clue runs and complete cages, limits each marker and parity layer to visible cells, and waits for every marker in a family before applying its negative rule. Undo and redo restore the projection from the current entries. The opening logical projection has one complete odd clue and the default logical trace finds no placement. Entering a correct 1 enables the two observed placements, after which the tested trace again has no placement. The full exact solve still finds the published answer. Preview and Play now use that projection for the grid, rule descriptions, accessibility, candidates, hints, and Technique Finder. Covered cells keep their fog shading when a peer is highlighted. Undo, redo, reload, and restart derive the reveal from the saved placements. Share links preserve the initial reveal and complete puzzle. The walkthrough recalculates when a logical placement reveals more clues and shows an explicitly labeled exact solution when the logical path ends early. The published code and short link both open in Play. The puzzle remains unrated. [Published puzzle](https://sudoku.coach/en/s/Fnxt) · [Wasm contract](tests/fog-wasm.mts) · [Fog integration](https://github.com/coder13/sudoku-app/issues/91)

*Entropic Spiral 3* opens with eight revealed cells and both outside Sandwich totals visible. The public totals rule out 9 at R4C8 even though the row with the 12 total is entirely covered. *Entropy Quad Fog 2* opens with 45 revealed cells and 15 authored Quadruples. Six complete Quadruples enter the initial proof position. The grid clips the other circle fragments and keeps their covered digits out of the cell labels and proof requests. A partially covered cage keeps its visible boundary and shows its total when the caption's cell is revealed. Its full arithmetic rule becomes available when all its cells are visible. The clip also reveals the ends of Whispers and other lines at the fog boundary. Chromium verified these renders at desktop and mobile widths and confirmed that revealing a cage reuses existing SVG clue elements. The independent counter found one solution for each additional source in 36 and 2,016 nodes, respectively, matching the published completions and the app's exact solver. Both walkthroughs offer an exact finish after the logical path stalls. [Entropic Spiral 3](https://sudoku.coach/en/s/DD1N) · [Entropy Quad Fog 2](https://sudoku.coach/en/s/E3xE)

Warm Node/Wasm measurements used 80 calls per operation. The table gives p50 and p95 in milliseconds. Walkthrough requests took 18 to 42 ms for DD1N and 2.0 to 2.6 s for E3xE across two local runs. The instrumented E3xE run spent 1.94 s on a single engine trace over the opening projection. It returned 18 deductions before the exact finish.

| Puzzle | Pasted preview | Opening candidates | Opening ranked hints |
| --- | ---: | ---: | ---: |
| DD1N | 23.407 / 27.247 | 2.477 / 3.392 | 6.656 / 8.823 |
| E3xE | 85.572 / 95.257 | 0.054 / 0.119 | 0.372 / 1.083 |

After warm-up, 2,000 paired Node/Wasm calls per operation returned identical responses with inline visibility and with the same pre-projected position. The inline path took 0.047 ms median and 0.124 ms at p95 for candidates, 0.060 ms and 0.090 ms for singles, and 0.070 ms and 0.117 ms for Kropki hints. The pre-projected medians were 0.019 ms, 0.025 ms, and 0.033 ms. This measures engine request handling after the first reveal, including JSON serialization. The TypeScript projection, including the reveal calculation, took 4.8 to 9.5 microseconds per call over positions with 1, 6, and 49 visible cells. These are medians of 100 warm batches of 1,000 calls on the local Node runner. With the complete import and play paths connected, 200 warm Node/Wasm calls per operation produced p50 and p95 of 1.094 and 2.046 ms for a pasted preview, 0.024 and 0.031 ms for candidates after the first reveal, and 0.570 and 1.244 ms for ranked hints at that position. Preview includes decompression and full uniqueness verification. The measurements exclude the browser and short-link network request.

*Fog of war & Jigsaw* by GenevieveArchbaker imports from its published link, direct play link, or original code. Its description supplies an SE difficulty note. All 31 gray cells match the initial reveal and the lime, red, and orange cells begin covered. A correct 2 in R5C1 reveals the red R4C2 and lime R6C1. Undo covers them again. Saving and sharing retain the authored colors separately from player colors. The app and independent counter verify the published solution with all nine Jigsaw regions, twelve givens, and six cages. Play offers ten opening hints and a full 113-step logical walkthrough. The opening Technique Finder lists the same two hidden singles as selected hints. A publication with additional author instructions still needs those rules to be understood before import. [Published puzzle](https://sudoku.coach/en/s/7HQD) · [Fog integration](https://github.com/coder13/sudoku-app/issues/91)

### Fog walkthrough performance

The E3xE opening trace stalls after 18 Locked Candidates steps. The most expensive scans at that position are five-digit and four-digit Pattern Overlay. Digits 4 and 7 have identical candidate locations, so their geometric layouts can share an exact support result when either digit appears in the same group. The engine keeps separate slots when both digits occur in a group. Changes to candidate locations invalidate the relevant results.

The table compares the local Wasm build with `07e29fc8` using nine warm pairs with alternating request order. Every complete response matched. Times are median milliseconds for engine requests.

| Fixture and operation | Baseline | Updated |
| --- | ---: | ---: |
| E3xE opening trace | 762.67 | 663.64 |
| E3xE stalled four-digit Pattern Overlay | 195.21 | 168.20 |
| E3xE stalled five-digit Pattern Overlay | 455.49 | 360.76 |
| DD1N opening trace | 3.83 | 3.73 |
| HCHW archived five-digit Pattern Overlay | 27.56 | 10.35 |

The gzip-compressed Wasm grows by 4.4 KiB in this comparison. The E3xE walkthrough offers its explicitly labeled exact completion after step 18. [Fog integration](https://github.com/coder13/sudoku-app/issues/91)

The reveal-aware rating uses the same path as the walkthrough. Each Wasm trace ends after a placement that exposes new cells, so the next engine request can use the newly revealed rules. The app adds the cost and technique count from every applied deduction. Its difficulty follows the hardest technique across the whole path. Rating requests omit the proof steps. Older saved Fog puzzles receive a grade when opened and keep the result across reload and restart.

| Puzzle | Logical moves | Points | Puzzle grade |
| --- | ---: | ---: | --- |
| 7HQD | 113 | 5,219 | Impossible (Pattern Overlay) |
| E3xE | 18 | 900 | Unrated, exact finish |
| DD1N | 11 | 354 | Unrated, exact finish |

Against `8d38f89`, seven warm pairs preserved every applied deduction, replay position and final solution for all three sources. For 7HQD the previous walkthrough returned 961 proof steps across 23 requests and discarded speculative steps after each reveal. The bounded walkthrough returns its 113 applied proofs across the same 23 requests. Rating returns the same grade with zero proof steps. E3xE and DD1N run out of deductions during their opening trace and preserve their logical subtotals. The updated Wasm is 19.6 KiB smaller uncompressed and 10.0 KiB larger with gzip. [Fog integration](https://github.com/coder13/sudoku-app/issues/91)

The geometric witness search now shares a 16,384-node budget between overlay and classic proof pruning, with up to 256 nodes for one candidate probe. Only completed geometric witnesses contribute support. The same exact fallback still checks candidates left unresolved by the probe.

| Fixture and operation | Baseline median ms | Updated median ms |
| --- | ---: | ---: |
| E3xE opening trace | 1,168.09 | 728.69 |
| E3xE stalled four-digit Pattern Overlay | 241.18 | 90.82 |
| E3xE stalled five-digit Pattern Overlay | 544.36 | 219.55 |
| HCHW positive five-digit Pattern Overlay | 140.81 | 70.30 |

Nine alternating warm pairs per operation matched whole responses against `e2f56bb`, including the 18-step E3xE trace and the positive HCHW proof. Five warm pairs each also matched the full traces for HCHW, Hu9m, 220V, Newman Modular and Ksy3. Their median changes ranged from a 37.87 ms improvement for 220V to a 1.27 ms increase for Hu9m. The Wasm grows by three bytes with gzip. A separate four-family index trial moved the E3xE opening trace from 579 to 580 ms. [Fog integration](https://github.com/coder13/sudoku-app/issues/91)

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
3. `renban-killer-clover.json` and `renban-coach.json`: set/cage intersections, overlapping clues and the four-step BSms path and its two new group-count hints tracked in [158](https://github.com/coder13/sudoku-app/issues/158).
4. `region-sum-coach.json`: explicit groupings, closed geometry and FaxQ's limited opening hints. Human coverage stays visible alongside [192](https://github.com/coder13/sudoku-app/issues/192).
5. `little-killer-menace.json`: fourteen Renban sets and four outside sums. The app profile opens with seven hints and completes the published grid in 154 steps. The first placement follows from the five-cell Renban and its row. Joint reasoning is tracked in [202](https://github.com/coder13/sudoku-app/issues/202).
6. `skyscrapers-jigsaw-mixed.json`, `x-sum-jigsaw-mixed.json` and `sandwich-jigsaw-mixed.json`: outside gutters, region boundaries, labels and direction.
7. `xv-quadruple-clover.json`, `adjacent-sum-coach.json` and `clone-mixed.json`: shared marker space, repeated printed digits and candidate insets.

For each control, check starting, correctly progressed and explicit-removal states. Check both Pencil modes, placement cleanup, conflicts, undo/redo, reload and sharing. Compare ordinary hints, selected hints, paged hints and Finder against that same current position. Confirm stale results cannot apply after an edit. A genuine zero-hint state stays visible; exact completion must not become an invented logical explanation.

Hyk5 and Hafj now have complete logical walkthroughs of 144 and 169 steps. They use the full original rules. At the checked positions, Hyk5 uses two rows and a white dot. Hafj uses a dot, four houses, and a second Entropic line. The released HCHW walkthrough still completes in 202 steps. [Issue 162](https://github.com/coder13/sudoku-app/issues/162)

## Browser review and approval

The user authorized the built-in browser. Its runtime currently fails with `Trusted RPC service is not configured: browser`, including after a preview tab opened. Actual app screenshots have not been captured. Existing exported SVG figures and component markup are diagnostic evidence only.

Pending captures must show the actual app at narrow and desktop sizes, light and dark themes, and increased app/grid text sizes. Review empty/full candidates, overlaps, outside clues, Jigsaw borders, focus, menus, hint stages, selected Finder results and solution navigation. Include enough context to identify the puzzle and state. Share the screenshots for approval before merging broader visual changes.

No browser review or screenshot approval is complete. Preserve the open checklist in [SUDOKU_ENGINE_TODO.md](SUDOKU_ENGINE_TODO.md) as each part is verified.

## Reviewed Coach fills on 9×9 puzzles

Sudoku Spider uses 26 grey and red background fills to illustrate the grid. Its mathematical clues are ten givens and eight encoded Thermometers. The importer checks the complete authoring data and the normalized cell shades against the reviewed export. It recognizes the same artwork when a Current State export adds known player entries, Pencil candidates, or player colors. Preview, Play, restart, reload and sharing keep the authored fills separate from the player’s annotations. The same check joins the raw, short and collection links for Pumpkin 2024 and Halloween Candy 1.

An independent counter found the published completion of Sudoku Spider. The Play profile before the joint Thermometer and house deduction offered ten opening hints and explained 68 steps before stalling. Every recorded action agreed with the published grid. A paired re-decode of 72 captured 9×9 codes admitted the three reviewed exports and matched all 69 other outcomes. Changed authoring data, new mathematical instructions accompanying a published code, and authored colors outside the reveal data of a Fog puzzle continue to reject.


## Thermometer deductions with a shared house

A Thermometer can share two or more cells with a row, column, region, diagonal, or extra house. A set of digits that increases from the bulb can still leave the house unable to place all its digits. The new Medium technique, worth 64 points, removes a candidate only when it fits the two rules separately and has no support when they are combined. Play, Technique Finder, the walkthrough, and practice use the same proof. The three practice examples use a row, column, and box. A separate test exercises the region order of an irregular Jigsaw partition.

| Archived Sudoku Coach puzzle | Previous walkthrough | Walkthrough with Thermometer and house |
| --- | --- | --- |
| Sudoku Spider | 68 steps, partial at 9,312 points | 100 steps, Medium at 1,952 points |
| Thermo Sandwich | 187 steps, Extreme at 17,026 points | 163 steps, Very Hard at 5,942 points |
| carved out | 121 steps, Medium at 1,843 points | 121 steps, Medium at 1,843 points |
| cauldron | 82 steps, partial at 12,215 points | 82 steps, partial at 12,215 points |
| Thermos and Region Sums | 156 steps, Medium at 3,830 points | 156 steps, Medium at 3,830 points |

All five retained the same exact completions. Each trace action agrees with the published completion, and independent assignment enumeration checks each new proof. With the technique disabled, all five replay their previous paths.

Nine alternating, warmed Wasm samples on Darwin arm64 measured the median thread CPU times below in milliseconds. Rated opening-hint requests retained ten choices for the first four puzzles and eight for Thermo Sandwich.

| Archived puzzle | Rating before → after | Ranked opening hints before → after |
| --- | --- | --- |
| Sudoku Spider | 218.169 → 0.762 | 0.326 → 1.131 |
| carved out | 0.869 → 0.930 | 0.300 → 0.449 |
| cauldron | 531.867 → 534.975 | 0.135 → 0.140 |
| Thermos and Region Sums | 0.963 → 0.960 | 0.260 → 2.046 |
| Thermo Sandwich | 634.057 → 67.196 | 238.103 → 244.454 |

The lower-tier generation check treats the new deduction as a Medium move. Five former recipes could no longer reach their advertised difficulty. Checked replacements cover the same difficulty range and include two distinct Extreme recipes. The new Extreme recipes have 17 and 21 givens.


## Skip impossible Unique Rectangle searches

Thermo Sandwich's Sandwich clues and Thermometers touch 79 cells. The remaining two cells cannot form a four-corner rectangle. Unique Rectangle AIC and both Unique Rectangle Nice Loops now check for an eligible two-box rectangle using the live candidates and added rule scopes. They skip the 4,096-node uniqueness check and graph construction when every rectangle is excluded. If an eligible rectangle exists, the normal bounded uniqueness check and proof filters still apply.

Across 116 archived 9×9 definitions, 912 paired Wasm replies matched in full. The comparisons include ranked hints, the three unbounded searches used by Technique Finder before and after a move, eight full trace replies, retained hint pages, and 26 seeded generation results. All nine positive rectangle-chain exercises kept their complete proof lists with and without an unrelated parity clue. The variant scoring version remains 15.

The table reports median thread CPU time in milliseconds from nine alternating, warmed measurements on Darwin arm64. Hint requests used the rated puzzle's actual tier. The two timings for Finder use the complete selected Unique Rectangle AIC search.

| Published puzzle | Ranked opening hints before → after | Unique Rectangle AIC before → after | Rating before → after |
| --- | --- | --- | --- |
| Thermo Sandwich | 187.072 → 17.413 | 174.254 → 9.397 | 64.968 → 65.708 |
| American Food | 51.937 → 52.436 | 10.751 → 10.686 | 1.601 → 1.610 |
| Leftovers | 1.253 → 1.267 | 5.262 → 0.952 | 2.169 → 2.138 |
| Brain Zaps | 4.388 → 4.380 | 3.631 → 3.630 | 0.458 → 0.457 |
| Sudoku Spider | 0.960 → 0.946 | 4.096 → 4.534 | 0.569 → 0.737 |

Thermo Sandwich kept all eight opening hints, its 163-step Very Hard walkthrough, and the published exact grid. It continues to report zero Unique Rectangle chain moves at the opening position.


## Kropki dots with a shared house

For a printed white or black dot, the engine checks whether its two open cells can use each feasible pair of digits while the rest of their shared house uses the other digits. The technique removes a candidate only when the dot and the house each allow it on their own and their combination rules it out. It can also remove a digit elsewhere in the house when every assignment uses it on the dot. Proofs carry both rule indices when white and black marks share an edge. An irregular Jigsaw control verifies the authored region and both marks. Unmarked edges retain their negative-rule behavior.

Kropki dot and house costs 48 points at Medium. The three practice estimates are 42, 70, and 48 points. Variant scoring is version 16, and saved ratings with printed dots refresh on the next rating pass.

| Published puzzle | Previous app walkthrough | Walkthrough with dot and house |
| --- | --- | --- |
| Cauldron | 82 steps, partial at 12,215 points | 123 steps, Medium at 2,653 points |
| Entropic Loop (Hyk5) | 144 steps, Hard at 3,345 points | 153 steps, Hard at 3,604 points |
| L25 entropic (Hafj) | 169 steps, Hard at 4,081 points | 193 steps, Tricky at 5,062 points |
| Between the Dots | 62 steps, partial at 1,921 points | 66 steps, partial at 2,085 points |

The original Cauldron import and each walkthrough action agree with the published grid. Independent house permutations check its five new proofs and the new proofs in the Entropic and Between controls. The archived K95q import with complete black-dot markings and Global Entropy also finishes at Medium with 2,452 points. Its exact grid and all 24 printed dots are preserved.

Nine alternating warmed Wasm samples measured median thread CPU time in milliseconds on Darwin arm64. Exact verification replies and opening candidate masks matched on all five sampled puzzles. Each opening-hint request retained its choice count.

| Published puzzle | Rating before → after | Ranked opening hints before → after |
| --- | --- | --- |
| carved out | 1.090 → 0.842 | 0.443 → 0.449 |
| Cauldron | 503.917 → 1.418 | 0.129 → 0.126 |
| Entropic Loop | 3.078 → 4.613 | 6.046 → 6.465 |
| L25 entropic | 7.169 → 8.728 | 1.962 → 2.227 |
| Thermo Sandwich | 63.786 → 63.644 | 15.631 → 15.676 |

Seventeen replacement recipes preserve all seven Kropki generation tiers. Mixed Hard generation with complete Kropki markings checks more layouts within the existing time budget. Tests verify the requested grade, unique solutions, preserved markers, and complete walkthroughs.
