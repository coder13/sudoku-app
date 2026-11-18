# General adjacent totals: source and integration audit

Track this family in [issue 72](https://github.com/coder13/sudoku-app/issues/72). This isolated worktree adds the native rule and its complete app flow. The published source and independent controls define the expected behavior. Release measurements and limits are recorded in the [fixture notes](tests/fixtures/README.md#general-adjacent-totals).

## Published source

[Dariao142's May the Sudoku Be With You, Coach 99Eu](https://sudoku.coach/en/s/99Eu), published on 2025-08-30, has two givens, Anti-Knight, Anti-King, orthogonal Non-Consecutive and one adjacent sum of 15. The original diagram prints the Roman numeral XV between R9C8 and R9C9. It means fifteen. It must remain one sum clue.

The original public API code and solution were fetched again on 2026-11-18 and match the preserved XV audit export. The diagram was inspected. Its SHA-256 is `c7548bfe0ead59ad889a72381144039c07aab70378e69ef3d74536e9f0ffce14`. The fixture preserves the code, author, publication date, endpoint order `[80, 79]`, total, givens, companion rules and published completion.

The independent digit-array counter proves the full source unique in 590 calls. Removing the sum also leaves a unique puzzle, in 652 calls. Replacing its total with either 5 or 10 gives zero completions. These are independent reference calls, not native nodes or a paired performance result. Because the total is redundant for uniqueness, checking only the final solution would miss a decoder that silently drops it.

An authored second control removes a 6/7 rectangle from a standard complete grid. Both recorded completions obey every ordinary house. Adding total 15 between cells 30 and 39 selects exactly one. Removing the total leaves two. This control checks that the implementation enforces the sum, in addition to preserving the published source's data and visible clue.

## Confirmed source semantics

The inspected Coach `Two-Cell-Sum (XV)` compiler uses `parameters.sum`. It compiles 5 and 10 as its existing V/X constraints and other values as a binary equality on the digit sum. Its constructor picker offers totals 3 through 17. Its renderer formats Roman numerals, including XV for 15. Preserve the parameter rather than interpreting the printed text as two different marks.

The constructor's edge selector chooses two cells sharing a horizontal or vertical edge. The drawing helper only computes their midpoint; it does not itself validate adjacency. Validate the endpoints explicitly rather than relying on the renderer.

The starting main, `856e0f6`, exposes only `PuzzleRule::Xv { five, ten }` for these sums. The addition reuses the compiled pair engine's bidirectional support tables, provenance, exact propagation and local logical evidence. The original 99Eu export now imports with all its companion rules.

## Implemented contract

The version-one wire rule is `{ "type": "adjacent-total", "cells": [80, 79], "sum": 15 }`. It preserves source endpoint order. The total must be an integer from 3 through 17. The cells must share an edge. Allowed digit pairs satisfy both the sum and distinctness in their shared row or column. The `adjacent-total` technique costs 20 points at Easy. Existing scoring version 8, costs and relative technique order remain unchanged.

Coach sums of 5 and 10 retain the existing grouped XV representation. Each other total becomes its own native rule. Generic native totals of 5 and 10 also count as positive V/X locations for negative XV and fog completeness. They retain their own proof source and do not create duplicate XV deductions. Removing this family for a generation dependency check removes its arithmetic constraints while retaining those negative-rule exemptions. Otherwise removal could introduce a constraint instead of relaxing the puzzle.

Derived generation accepts `{ "type": "adjacent-total", "cells": [a, b] }` and computes the total from the sampled completion. Tests cover exact clue targets, required-family dependence, technique ordering and an exclusive first-technique request. The app supports imported and shared puzzles. New puzzle recipes remain conditional on difficulty calibration.

The renderer prints one upright Roman numeral per distinct edge/total. It deduplicates a generic 5/10 clue and a matching legacy XV mark. Accessible labels include the numeric total and other cell. Shared-edge layout keeps sums, Kropki dots and inequalities visible. Tests preserve every endpoint through all eight grid transformations.

The app-order trace on 99Eu solves at 4,250 points in 212 steps. The native default stalls at 932 points after 78 steps. Both are checked against the published completion. Keep this profile difference explicit. The source's sum is redundant for uniqueness; the essential control and independent digit-pair proof checks establish arithmetic enforcement.

## Acceptance coverage

- Reuse the compiled pair-support machinery. Keep the parameter and original rule provenance explicit. Do not replace a sum with a search-only shortcut.
- Preserve the old XV wire format, default costs, positive markers and independent negative flags. Cover generic sums of 5/10 under those flags and fog completeness.
- Validate the constructor's orthogonally adjacent endpoint geometry. Preserve endpoint order and totals under all eight grid transformations.
- Preserve a complete `twoCellSum` layer, including mixed 5, 10 and other totals. Reject unknown parameters and unsupported settings instead of dropping them.
- Render each total as one legible clue, with accessible endpoints and its numeric meaning. Keep marks, dots and inequalities separate on a shared edge. Cover wider Roman numerals at mobile sizes.
- Explain candidates and deductions by enumerating allowed digit pairs, including house distinctness. Test low/high boundaries, impossible totals, every candidate digit, both endpoint directions and multiple constraints on one edge.
- Cover exact solving, partial/full logical paths, disabled techniques, proof replay, multiple hints, pages, Finder, lessons, three practice positions, input, both note types, conflicts, persistence, sharing and history.
- Independently verify both published and essential authored fixtures. Preserve complete puzzle data even when a clue is redundant for uniqueness.
- Measure candidates, exact checks, ratings, ordinary/exhaustive hints, generation, memory and all package profiles against current main. Use separate Cargo targets for each source checkout.
- Integrate the family only when native behavior and complete UI pass their checks. Keep New puzzle presets conditional on calibration.

The counter accepts additional reference-only binary relations and now checks Non-Consecutive with explicit exceptions. `basePuzzle` plus `additionalSums` is a test model. It is not an importable native definition and must not be passed to the app as a complete puzzle.
