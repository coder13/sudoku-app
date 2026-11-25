# UI refactor checklist

Keep this list current while the UI refactor is in progress. Add follow-ups as code review reveals them; check items off when the work is complete.

## Done

- [x] Document state ownership and keep DOM classes as presentation, not app state, in `ui-composition.md`.
- [x] Split Board content, appearance, interaction, and layout contracts; extract private cell rendering and typed annotations.
- [x] Move Play board click and pointer gesture lifecycles into focused hooks.
- [x] Separate Play input transitions, puzzle-scoped preferences, digit/color actions, and puzzle commands from their presenters.
- [x] Add shared command presenters, panel/layout primitives, keypad components, and reusable settings controls.
- [x] Split number puzzle, settings, puzzle rows/previews, and completion presentation into reusable pieces.
- [x] Move bookmark persistence and restore policy from `Worktable` into `usePlayBookmarkActions`.
- [x] Move the temporary solved-grid session lifecycle from `Worktable` into `usePlaySolvedGrid`.
- [x] Reuse shared grid movement and focus primitives in Play while keeping Play's selection and highlight policy in its host.
- [x] Replace Play and gesture host class-name checks with explicit interaction or sizing data markers where those checks defined application behavior.
- [x] Let `Modal` forward native dialog attributes so a host can expose an interaction boundary without adding style-class coupling; document the contract and story.
- [x] Update the component catalog and add Storybook examples for new shared components.
- [x] Replace class-based renderer, scroll, focus, and Dockview group lookups with explicit anchors or the Dockview API.
- [x] Move Lesson chain candidate refresh, graph, sketch, and strong-link derivation into `useLessonChainModel`.
- [x] Move collection puzzle preview and save/play request lifecycles into `useCollectionPuzzleActions`.
- [x] Review the remaining `PuzzleCollections` and `ImportPuzzle` composition; retain route-specific screen branches and keep their existing source, preview, and camera boundaries.
- [x] Move active-tab scrolling beside the shared roving-tab policy instead of exporting it from `PlayLayout`.
- [x] Preserve identical Play panel content across mobile, Standard desktop, and Advanced desktop; keep each host responsible for placement and focus policy.
- [x] Share chain graph, sketch, selected-candidate, and strong-link composition across Play and Lesson while leaving candidate acquisition and availability policy with each host model.
- [x] Move Play hint-visible and solution-visible rating/history updates into `usePlayRatingEvents`.
- [x] Move the guarded color-group continuation mutation from Worktable into `usePlayColorActions`.
- [x] Move Play chain and strong-link candidate actions into `usePlayChainActions`; retain responsive tool switching, focus, and panel policy in Worktable.
- [x] Keep the shared digit selector numeric in Color mode; route candidate painting through explicit digit actions and leave color choices in the Colors panel.
- [x] Isolate Play candidate-note requests so cancellation can stop a stalled worker; report timeouts and allow retries from Chains.
- [x] Animate opening the first and closing the last mobile tool tab with matching toolbar durations. Preserve the keypad body's height during both transitions; let the board fitter use the resulting card growth or collapse to resize the puzzle smoothly.
- [x] Preview mobile input resizing by running the board fitter against live layout dimensions each pointer frame, keeping the puzzle's dragged position aligned with its release position.
- [x] Clear the finished mobile toolbar exit animation before reusing the toolbar node, so reopened tool tabs remain visible.
- [x] Animate top-edge input-card padding with the tab bar so closing the last tab does not return space to the puzzle only after the animation ends.
- [x] Expand the mobile hint panel from zero height above the input; let live layout fitting move the puzzle without FLIP-scaling the input panel.
- [x] Match the mobile hint and input panel widths while keeping hint navigation hit targets large and visually quiet.
- [x] Give input tab opening and closing a dedicated 160 ms duration across mobile and desktop.
- [x] Collapse hint panels to zero height on close and use the same 160 ms timing as input tabs. Keep the mobile exit panel in flow until its collapse completes so the puzzle fitter follows its live height.
- [x] Make the compact HintCard layout the default and remove its noncompact component and style branches.
- [x] Remove the leftover mobile hint wrapper surface and fixed-height card stretch; put the visible border on the compact card under its separate selector/close toolbar.
- [x] Keep hint exits visible while their 160 ms layout animation collapses the panel, with no competing fade or translation.
- [x] Keep the hint card's white surface in each layout and reserve a fixed eye-control slot so its appearance does not change the card height.
- [x] Add a persisted, mobile-only pinned Hint tab that remains separate from ordinary open/reorderable tool panels and reuses the same hint card.
- [x] Remove the nested rounded frame and excess padding from Hint when it is pinned into the mobile tabs panel; let its explanation use the available panel space.
- [x] Reduce mobile tab toolbar top and bottom padding evenly while preserving the tab buttons' touch height.
- [x] Align spacing between the puzzle/actions, hint and input surfaces with one Play layout token; match the spacing around standard desktop hint content.

## To do / revisit

- [x] Give shared `UiCommand`s one shortcut dispatch contract so keyboard, menu, and pinned actions use the same availability and run path.
- [x] Review remaining `Worktable` orchestration; move cohesive color, chain, hint, rating, bookmark, solved-grid, and puzzle-task behavior to feature owners. Keep puzzle transactions, cross-tool transitions, host layout, focus, and dialogs in Worktable because they coordinate the active Play surface.
- [x] Review remaining structural DOM queries; keep semantic selectors, explicit feature anchors, and documented library APIs.
- [x] Review `LessonWorkbench` for a cohesive chain capability extraction; keep lesson selection, edits, and panel policy in the host.
- [x] Review `PuzzleCollections` and `ImportPuzzle` for cohesive extraction points without splitting route-specific presentation only to reduce line count.
- [x] Compare panel navigation, popover, and resize primitives across hosts; share lifecycle mechanics while retaining host placement and focus policy.
- [x] Review Worktable's ordered keyboard router against Lesson's digit and mode routing; retain host routing because their scope, focus boundaries, and tool-specific digit semantics differ, while sharing the underlying input-tool transitions.
- [x] Audit responsive props on shared Play panel nodes; remove the compact Chains panel content omission and keep future responsive changes presentation-only.
- [x] Recheck the catalog and Storybook examples after the responsive panel and Play action trigger API changes.
- [x] Review the refactor diff for state ownership, duplicated behavior, accessibility, and accidental behavior changes; run the non-test checks (`npm run check`, `git diff --check`).
- [ ] Visually review the newly merged sized-rule clue geometry for fractional regions, Crust, Nonogram, row equations, Zipper, and AQRE in Storybook.
- [ ] Visually review mobile hint opening at portrait and compact-landscape sizes; confirm the input keeps its chosen height and the puzzle follows the expanding hint smoothly.
- [ ] Visually review pinning and unpinning the hint at portrait and compact-landscape sizes, including closing the card and restoring it on a later hint.
- [ ] Visually review equal spacing around puzzle actions, standalone hint, and input surfaces in mobile, Standard desktop, and Advanced desktop.
- [ ] Consolidate the separate mobile, standard desktop, and advanced dock hint-collapse owners behind one shared presence/measurement API.
