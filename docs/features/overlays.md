# Board overlays

## Purpose

An overlay is a visual layer on the Sudoku board that shows information from a selected chain, subset, fish, or branch without changing the puzzle state. It answers “What should I look at?” rather than “What is the proof?”

Use the more specific label **Board overlay** or **Reasoning overlay** in the product. “Pattern Overlay” already names a Sudoku method that compares possible complete placement patterns for a digit, so a bare “Overlay” label could be mistaken for that technique. [SudokuWiki's Pattern Overlay page describes that method](https://www.sudokuwiki.org/Pattern_Overlay).

## What an overlay can show

A selected overlay could display:

- the assumption that starts a branch;
- candidates or cells involved in one selected chain path;
- cells belonging to each selected subset or fish;
- candidates ruled out conditionally within the selected branch;
- the contradiction or shared conclusion at the end of a proof.

The player should be able to show one branch at a time and compare branches by switching between them. A future comparison view could show what is common to all branches, but it must distinguish common consequences from branch-specific consequences.

## How overlays relate to branching and nets

A branch is a conditional working state; a net is a proof graph with cases. An overlay is how the board presents one of those states or paths. It should not own branch logic or decide whether a conclusion is valid.

For example, selecting the “assume 7 is in R4C2” branch can overlay that premise and the candidate consequences that follow. Selecting a different branch replaces the displayed conditional layer while leaving the main puzzle unchanged. In a net, the overlay can focus on one path, then move to the shared conclusion after all required paths have been checked. See [Branching](branching.md) and [Nets](nets.md).

## How overlays relate to chains, subsets, and fish

Chains, subsets, and fish describe logical structures. Their objects should define which cells and candidates an overlay highlights, while the overlay controls how that information appears on the board.

The overlay should reuse the app's established technique coloring for set membership when showing subsets, ALSes, Sue de Coq, or other almost locked set techniques. Branch identity may need a separate visual cue, such as an assumption label, outline, or line style, so branch coloring does not conflict with set colors or existing chain link colors. Color alone should not carry the explanation.

An overlay is not a bookmark. It changes only what is visible; a bookmark saves a board state for later return. It is also not a candidate removal: a candidate shown as unavailable in a branch remains a candidate on the main board.

## Suggested interaction

- Provide a clear toggle to show or hide the selected reasoning overlay.
- Keep the active premise and conclusion visible in text as well as on the board.
- Let the player focus on a single chain path or net branch at a time.
- Preserve current board interaction when the overlay is hidden; do not leave the board in an ambiguous half-branch state.
- Make branch-specific eliminations visually distinct from actual main-board eliminations.

## Open product questions

- Should several structures be visible at once, or should overlays be exclusive to avoid clutter?
- How should branch overlays coexist with chain link colors and subset set colors?
- Should the panel be called **Overlays**, **Board overlays**, or simply expose a show/hide control inside Chains and Branches?
- Which overlay state should persist when the player switches panels or reloads the puzzle?
