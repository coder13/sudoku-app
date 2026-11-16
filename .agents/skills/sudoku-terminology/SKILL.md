---
name: sudoku-terminology
description: Keep user-facing Sudoku terminology consistent when writing, editing, or reviewing UI copy, lessons, accessibility text, validation messages, and product documentation in this project.
---

# Sudoku Terminology

Use the vocabulary below for user-facing language. Apply it to visible labels and descriptions, dialogs, menus, tooltips, accessibility names, status and error messages, lessons, and documentation. Do not rename internal types or storage fields solely to match the glossary.

## Preferred vocabulary

- **Sudoku puzzle**: a partially completed grid to solve. Use **puzzle** when discussing one playable instance.
- **grid**: the complete 9×9 arrangement. Do not call it a board in user-facing copy.
- **cell**: one position in the grid. Avoid square because it can be confused with a box.
- **digit**: one of the symbols 1–9. Prefer digit over number, value, or entry when referring to Sudoku content.
- **given**: a digit present when the puzzle begins. **Clue** is an accepted synonym; prefer given while solving and clue when discussing puzzle construction or clue counts. Do not call a player-placed digit a given or clue.
- **placed digit**: a digit entered by the solver. Use placement for the action. Avoid entry or filled number in UI copy.
- **candidate**: a digit that could still be placed in an empty cell. Use add, remove, generate, or highlight candidates. Avoid note, mark, pencil mark, and possible number except when explaining another app's terminology.
- **Pencil mode**: the input mode that edits candidates. Retain this established control name, but describe its contents and effects as candidates.
- **house**: any row, column, or box. Use house when a rule applies to all three; name the specific row, column, or box when that is clearer.
- **box**: one of the nine 3×3 houses. In classic Sudoku UI, avoid block, region, nonet, and group as synonyms. Region remains appropriate for irregular Sudoku variants.
- **peer**: a cell that shares a house with another cell. “Cells that see each other” is acceptable teaching language.
- **single**, **naked single**, **hidden single**, **locked candidate**, and established technique names: preserve their standard meanings.

Use **group** only when it has a distinct technical meaning, such as a grouped candidate node in an alternating inference chain. Do not use group as a casual synonym for house.

## Copy checks

When changing user-facing text:

1. Identify whether the subject is the puzzle, grid, cell, digit, given, candidate, or house.
2. Use one preferred term for that concept throughout the flow, including accessibility text and feedback.
3. Preserve accepted names in import/export formats and third-party product references.
4. If a term is genuinely ambiguous, check the [Glossary of sudoku](https://en.wikipedia.org/wiki/Glossary_of_sudoku) before inventing new wording, then follow this project's preferences above when the glossary lists synonyms.
