# Sudoku teaching text

Open each Learn article with a short explanation of the idea and what it tells the player. Then explain when to use it and what to look for on the grid.

Avoid `take`, `takes`, `taking`, `taken`, and `took` in Learn articles, practice clues, and hints.

- Use “Place 9 in R4C2” to describe a move.
- Use “If R4C2 is 9” to describe a condition.
- Use “9 can go in R4C2” to describe a possible placement.
- When two placements for a digit conflict, name the row, column, or box they share. Explain which candidate the placement rules out.

# Component system

When adding, choosing, or changing UI components, use the [Sudoku components skill](.agents/skills/sudoku-components/SKILL.md). Update its component catalog in the same change as additions, renames, removals, or changes to when a component should be used. Keep usage notes and Storybook examples for shared components current.

When adding or changing UI motion, follow the [animation guidelines](docs/animation-guidelines.md). For pointer-driven motion, keep previews frame-coalesced, honor reduced motion, and verify both snap directions at a mobile viewport.

Keep panel copy focused on the current state, controls, and instructions the player needs. Use a toast for temporary action feedback when a visible message is useful. Omit routine confirmations when the result is already visible and empty-state copy that only restates the display.

When changing UI behavior or content for mobile, make the equivalent change on Standard desktop and Advanced desktop unless the user explicitly approves a mobile-only change. Responsive differences may change placement, sizing, or density, but should preserve the same feature content and behavior.

# Shipping

When asked to ship work in this repository, carry it through the start of the production deployment.

1. Open a pull request into `main` and run the relevant checks.
2. Merge the pull request into `main` once it is ready.
3. Confirm that the **Cloudflare Pages** deployment for the merge commit has started.

Report the merged pull request and note that the deployment started.

# GitHub issue labels

When creating, triaging or auditing repository issues, use the [GitHub issue labels skill](.agents/skills/github-issue-labels/SKILL.md). Keep new puzzle families separate from Sudoku variants and from puzzle generation. Preserve useful existing labels and the current agent's pickup comments.

# Rust WebAssembly builds

The Homebrew Rust install on this host may not include `rustup` or the
`wasm32-unknown-unknown` standard library. Check the other managed Codex
worktrees before treating the target as unavailable. One working Rustup home
was installed by the Sudoku Arrow Codex worktree at
`~/.codex/worktrees/agent-b-sudoku-arrow/toolchain`; `rustup show` there lists
stable Rust and `wasm32-unknown-unknown`.

Reuse that installation by setting its homes and adding its Cargo shims to the
front of `PATH` before building:

```sh
TOOLCHAIN_ROOT="$HOME/.codex/worktrees/agent-b-sudoku-arrow/toolchain"
export RUSTUP_HOME="$TOOLCHAIN_ROOT/rustup"
export CARGO_HOME="$TOOLCHAIN_ROOT/cargo"
export PATH="$CARGO_HOME/bin:$PATH"
rustup show
rustup target list --installed
npm run build:wasm
```

If that worktree has been removed, search other
`~/.codex/worktrees/*/toolchain` directories and prior Codex build sessions for
an installed Rustup home. In a sandbox where the found Cargo home is read-only,
copy its `cargo` directory into a writable temporary directory and set
`CARGO_HOME` and `PATH` to that copy while keeping `RUSTUP_HOME` pointed at the
installed toolchain. Verify the target with `rustup target list --installed`
before running `npm run build:wasm`.
