# Existing 9×9 variant usability review

Agent A owns [issue 281](https://github.com/coder13/sudoku-app/issues/281). This review covers existing 9×9 puzzles, including combined rules. Further variant additions stay in the backlog. Agent D handles performance work independently on another machine; this review does not change its protocol or import-preview work.

## Inventory

The named inventory comes from `PUZZLE_VARIANTS` in [variants.ts](src/sudoku/variants.ts): 28 variants plus Classic. These represent all 27 native rule types and Jigsaw layouts. A named variant, a native rule type and a combination of rules are different counts.

New Puzzle has 25 released variants plus Classic at review base `bb2458a`, including Inequality through [PR 306](https://github.com/coder13/sudoku-app/pull/306). XV, Two-cell sums and Quadruple remain playable through import; their generation work stays in [189](https://github.com/coder13/sudoku-app/issues/189).

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
| XV | Import | V/X distinction and each negative rule |
| Two-cell sums | Import | Roman totals, shared markers and distinction from XV |
| Quadruple | Import | Repeated digits, cage-caption spacing and corner placement |

Ruleset review also covers Disjoint Groups through typed extra houses, custom extra houses, single diagonals, positive/negative Kropki and XV, Non-Consecutive exceptions, Whispers parameters, Region Sum grouping modes, Jigsaw companions and complete mixed definitions. German and Dutch Whispers are separate generation presets in [variant-rulesets.ts](src/sudoku/variant-rulesets.ts). These are existing rule configurations, not additional named variants.

## Existing automated evidence

[puzzle-help-wasm.mts](tests/puzzle-help-wasm.mts) exercises the first recipe at each offered variant difficulty: starting/progressed positions, invalid candidates, complete generated walkthroughs, sound actions, selected-technique results and Finder target counts. It also checks disabled ordinary hints, explicit technique inspection, Jigsaw catalog rows, hint collections and the preserved mixed fixtures. Import-only families have their own XV, adjacent-total and Quadruple Wasm contracts. This is not a check of every possible generated puzzle.

[variant-help-components.test.ts](tests/variant-help-components.test.ts) checks hint, solution and Finder affordances for every named puzzle in standard and advanced workspaces. Its component trees and server-rendered markup do not establish working pointer/keyboard interactions, layout, contrast or readable clue placement in a browser.

[variant-technique-scan.test.ts](tests/variant-technique-scan.test.ts) checks rule-sensitive counts, shared observers, position isolation and cancellation without cancelling foreground or selected help. [variant-hint-validation.test.ts](tests/variant-hint-validation.test.ts) checks incorrect placements and missing required candidates before engine work starts. These contract checks still need live interaction review.

Existing compatibility matrices and independently checked completion witnesses cover many combinations. They do not prove every clue arrangement is feasible, every rule is necessary or every imported puzzle has a complete human walkthrough.

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

The repeating-groups and house proof advances Hyk5 from 12 to 35 steps, Hafj from 5 to 23, and HCHW from 25 to 28. Each remains partial. Use these source puzzles to check group-order explanations, house highlights, and the separation between exact solution and logical replay. [Issue 162](https://github.com/coder13/sudoku-app/issues/162)

## Browser review and approval

The user authorized the built-in browser. Its runtime currently fails with `Trusted RPC service is not configured: browser`, including after a preview tab opened. Actual app screenshots have not been captured. Existing exported SVG figures and component markup are diagnostic evidence only.

Pending captures must show the actual app at narrow and desktop sizes, light and dark themes, and increased app/grid text sizes. Review empty/full candidates, overlaps, outside clues, Jigsaw borders, focus, menus, hint stages, selected Finder results and solution navigation. Include enough context to identify the puzzle and state. Share the screenshots for approval before merging broader visual changes.

No browser review or screenshot approval is complete. Preserve the open checklist in [SUDOKU_ENGINE_TODO.md](SUDOKU_ENGINE_TODO.md) as each part is verified.
