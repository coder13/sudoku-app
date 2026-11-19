# Sudoku teaching text

Open each Learn article with a short explanation of the idea and what it tells the player. Then explain when to use it and what to look for on the grid.

Avoid `take`, `takes`, `taking`, `taken`, and `took` in Learn articles, practice clues, and hints.

- Use “Place 9 in R4C2” to describe a move.
- Use “If R4C2 is 9” to describe a condition.
- Use “9 can go in R4C2” to describe a possible placement.
- When two placements for a digit conflict, name the row, column, or box they share. Explain which candidate the placement rules out.

# Component system

When adding, choosing, or changing UI components, use the [Sudoku components skill](.agents/skills/sudoku-components/SKILL.md). Update its component catalog in the same change as additions, renames, removals, or changes to when a component should be used. Keep usage notes and Storybook examples for shared components current.

# Shipping

When asked to ship work in this repository, carry it through the start of the production deployment.

1. Open a pull request into `main` and run the relevant checks.
2. Merge the pull request into `main` once it is ready.
3. Confirm that the **Cloudflare Pages** deployment for the merge commit has started.

Report the merged pull request and note that the deployment started.
