# UI composition guide

This guide explains how the app composes a feature across views, actions, panels, and layouts. Keep puzzle rules and save transactions in their domain modules. Let React own native semantics, component state, focus, and presentation.

Use ECS-inspired composition where it helps: give reusable features stable IDs and typed data, keep derived behavior in small models or hooks, and let host surfaces present those features. This is a UI organization guide; Sudoku rules and domain behavior remain defined by their domain modules.

## Put state with its lifetime

Use the smallest owner that matches how long the state needs to live:

| State lifetime | Owner |
| --- | --- |
| Puzzle values, candidates, marks, history, bookmarks | `Game` and `roomStore` |
| Open Play tools, selected Play tab, digit highlights, solution step | `playSession`, keyed by puzzle |
| User preferences such as theme, input layout, and enabled experiments | The relevant preferences store |
| A dialog, hover target, pending pointer gesture, or local confirmation | The component or host that owns that interaction; refs/controllers hold gesture snapshots |
| Derived labels, availability, candidate summaries, and error marks | A model or hook derived from current inputs |

Do not use CSS classes as the source of app state. `roomStore` owns puzzle data, `playSession` owns puzzle-keyed tools and highlights, and the preference stores own saved settings. A class or data attribute may project those values into presentation. Local React state owns open dialogs and hover targets; refs or interaction controllers own pending pointer snapshots. Layout hosts may write transient inline styles, CSS variables, and data attributes during frame-sensitive resize or drag previews. Clear those preview values on completion or cancellation, commit the final user choice to its owning state, and never infer puzzle, tool, or preference state from the preview DOM.

Use `usePlaySession` to bind the play-session store to the puzzle displayed by a Play surface. It returns no session data while another puzzle is active and exposes puzzle-scoped updates without making the component manage subscription or storage details.

Use `usePlayToolPreferences` to bind one coherent snapshot of shared input preferences and puzzle-scoped digit highlights for a Play host. Keep temporary pointer state in the host and derive the effective input mode in `usePlayInputModel`; color and digit action hooks receive that state through explicit channels. Use the atomic Play preference transition for deliberate Pen, Pencil, Highlight, Color, and Erase switches so the mutually exclusive persisted fields update together.

Panel selection transitions are pure helpers in `sudoku/play-session.ts`; a host supplies its tab order and active-tab fallback. Persisted Play panels use those transitions without adding UI lifecycle behavior to the store. `usePlayPanelModel` resolves availability and placement state; `usePlayPanelNavigation` coordinates host-specific opening, closing, and focus handoffs. The host supplies panel effects and fallback controls, while the hook keeps mobile focus restoration and desktop tab focus consistent. Shared tab navigation and horizontal visibility helpers live in `tab-navigation.ts`, independent of Play's layout presenter.

Keep a completion card presentational. `CompletedPuzzle` owns Sudoku-specific follow-up such as generating a next attempt, checking collection progress, and handling the next-puzzle shortcut; `PuzzleCompletionView` renders supplied facts and actions without starting that work. A different puzzle family can use the same card with its own result facts and follow-up actions. [CompletedPuzzle.tsx](../src/components/CompletedPuzzle.tsx) · [PuzzleCompletionView.tsx](../src/components/PuzzleCompletionView.tsx)

Use `usePlaySolvedGrid` for the temporary editable grid opened from completed results. It keeps the saved solve intact, scopes edits to a temporary session, and drops stale sessions when the puzzle identity changes. Worktable retains the result-view focus policy and panel placement.

Use `PlayStageLayers` when a puzzle surface must keep its live and paused views mounted together. It owns only stable layering and the active layer’s `aria-hidden` and `inert` state; the puzzle host supplies the board and its pause or resume content.

`MotionSurface` clones one child and adds `className`, `data-presence`, `aria-hidden`, and `inert` for its exit lifecycle. A custom child must accept those props and forward them to its root. If the child does not have that root contract, put the host-owned element inside `MotionSurface` instead.

Keep exclusive Pen, Pencil, Highlight, Color, and Erase transitions in `sudoku/input-tool-mode.ts`. Play preferences serialize that state using the existing saved fields; Learn uses the same transition function in `useLessonInputMode`. `usePlayInputModel` resolves saved tool state with temporary painting and hint restrictions, while `usePlayInteractionModel` derives the available pointer interactions. The board host supplies blocked overlays; rendered classes remain a styling output.

Keep lesson-specific Pen, Pencil, Highlight, Color, and Erase transitions in `useLessonInputMode`. `LessonWorkbench` owns lesson selection, edits, and chain activity, then supplies the current candidate layout to the mode model.

Use `useChainCapability` to compose candidate masks into a chain graph, sketch, selected candidates, and strong-link overlay. Play and Lesson supply their own candidate source and draw, availability, and highlight policy. `usePlayChainActions` owns Play's chain and strong-link candidate actions; Worktable retains tool switching and panel focus policy. `useLessonChainModel` additionally owns lesson candidate refresh cancellation; the lesson host keeps selection, edits, panels, and shortcuts.

Keep the pointer snapshot and cell-path accumulation for drag selection in `useCellSelectionDrag`. `usePlayBoardGestures` composes that controller with candidate painting, cell painting, candidate previews, touch-hold highlighting, and Play-specific availability. Worktable supplies the current puzzle, input capabilities, selection updates, and edit boundary; the gesture hook owns the temporary pointer lifecycle and never infers mode from rendered classes.

Keep candidate paint stroke paths and their Control-click fallback in `useCandidatePaintDrag`. `usePlayBoardGestures` decides which active pointer interaction receives a move and supplies the candidate mutation; the lower-level controller owns one candidate stroke and its capture lifecycle.

Keep direct cell-click selection, entry, erase, highlight, and double-click-single policy in `usePlayCellActions`. It receives a coherent snapshot of the current puzzle and tool state plus explicit selection and mutation actions. `Worktable` retains command routing and the host layout; `usePlayBoardGestures` supplies the pending pointer and double-click snapshots.

Keep digit highlight and candidate-paint operations in `usePlayDigitActions`: it owns the reusable transitions for multi-digit selection, highlight clearing, and painting selected candidate digits. The host still decides when a keypad action should invoke those operations.

Keep color palette, candidate-color, and group-continuation mutations in `usePlayColorActions`. It receives the active puzzle position, continuation result, edit boundary, and explicit color capabilities; Worktable retains panel placement, tool switching, and board gesture ownership.

Use `paintCandidate` to assign a candidate shade and `toggleCandidateColor` for a direct paint click that removes the same shade when repeated. Play and Learn share that domain operation so equivalent candidate-paint gestures have the same result. Keep group painting's all-matching toggle rule in `paintCandidateGroup` because it evaluates a set of targets as one action.

Keep almost-locked-set discovery in `sudoku/als-highlighting.ts`; `useAlsHighlight` gates the experimental capability and turns the discovered sets into board annotations. The menu command only toggles that capability, and the setting stays opt-in by default.

Keep digit-to-entry routing and entry side effects in `usePlayEntryActions`. The board and keypad can share the same input transition while the host supplies the current mode, selected cells, preferences, and automatic-single action.

Keep hint generation and page navigation in `usePlayHintActions`; it owns solver-task coordination and hint state updates, while Worktable still owns host placement, focus, and applying edits to the active puzzle.

Use `usePlayRatingEvents` to record when a player sees a hint or reveals a solution. It owns the rating and technique-history side effects; the host supplies the current puzzle, deduction, and visibility state.

Keep applying hints, restoring candidate recovery, and applying chain deductions in `usePlayHintMutations`. It checks that each deduction still matches its source position before recording the mutation; the host supplies the edit transaction and focus target.

Keep bookmark persistence and restore policy in `usePlayBookmarkActions`. The Play host supplies its current and saved game, edit boundary, solved-grid session opener, and post-history focus action; the hook does not own the bookmark panel or its placement.

Keep puzzle checking, candidate generation, and singles solving in `usePlayPuzzleCommands`. The command controller guards stale solver results and performs puzzle mutations; the host provides dialog callbacks, menu closing, confirmation focus, and the game-update boundary.

DOM reads support browser-owned behavior and event boundaries: `data-cell` for pointer hit-testing, `data-candidate-button` for candidate keyboard navigation, `data-paint-candidate` for paint focus restoration, `data-grid-click-away-exempt` for preserving Play selection on host controls, `data-puzzle-mode-tab` for its independent touch gesture, `data-board-body`, `data-candidate-marks`, and `data-board-links` for the board resize preview, `data-learn-content-scroll` for Learn scroll restoration, and `data-hint-card-close` for focus restoration. Dockview group animation uses the elements exposed by its API. Other boundaries include `:popover-open` for the native Popover API, tab IDs for menu navigation, focus relationships for restoration and dismissal, and target ancestry when a gesture or shortcut must not intercept an interactive control. Prefer semantic roles, documented library APIs, and explicit data attributes for application-specific boundaries. Keep CSS classes for styling; do not read them to determine a puzzle rule, selected digit, active tool, or saved preference. Those values come from their owning state and are projected into the DOM.

Use `gridCellInDirection` and `focusGridCell` when Board-based editors share the same clamped row and column movement. A feature can reuse these primitives while keeping its own navigation policy: Play still owns digit highlighting, focus gating, and range selection. Keep keyboard navigation with its feature when a grid has different semantics, as Learn and photo review do.

## Add a Play tool

1. Give a saved tool a stable ID in `sudoku/play-session.ts`. Restore and sanitize persisted IDs there.
2. Add its label, icon, support rule, and after-solve availability to `PlayToolRegistry.ts`.
3. Derive open and active panel state in `usePlayPanelModel`; keep puzzle-specific availability in the owning feature.
4. Supply the content once from `Worktable`. Each host chooses its placement: mobile tabs, Standard desktop insights, or the Advanced desktop dock.
5. Use `PanelActivityBoundary` for content that needs to know whether it is active, a swipe preview, or inactive. Gate expensive work and assistance tracking on the state that actually means the player opened the tool.
6. Use `usePlayPanelNavigation` for Play's mobile and desktop panel transitions. The host supplies panel effects and stable fallback controls when closing a tool removes its opener.

Keep content independent of its placement. For example, `PuzzleDetails` renders named facts supplied by Worktable; the dialog and dock decide where to put it. Play follows the same rule: `Worktable` builds one `toolPanelContents` map, then passes those same panel nodes to mobile tabs, Standard desktop insights, and Advanced desktop dock slots. Those hosts own placement, sizing, activation, and focus policy; they must not fork the panel's feature behavior. Small presentation inputs such as a compact density flag may change layout or spacing, but must not hide or add panel information.

## Present one action in several places

Use `UiCommand` when keyboard handling, a menu, a toolbar, or a pinned action share the same operation and availability. Resolve its label, shortcut ID, available state, pressed state, and callback in the feature owner. Use `dispatchCommandShortcut` for these shared keyboard routes so keyboard, menu, and pinned actions use the same command availability and `run` callback. `ActionMenuItem` and `PinnedActionBar` present that same command in their respective surfaces; both call `run` rather than copying its business logic.

Keep host behavior with the host: native button or menu semantics, confirmation dialogs, dismissal, and return focus. An operation can accept the invoking element when it needs to restore focus after a confirmation or menu closes. Do not force two puzzle families to share an operation just because their buttons look alike.

Keep puzzle mutations in the Play host when a confirmation dialog only presents the choice. `PuzzleSessionDialogs` receives the current open state and callbacks for generating candidates, resetting, or discarding a draft; it does not reach into game or preference stores.

## Give layout owners explicit anchors

If a host measures or resizes a region, pass a named ref for that region. `PlayLayoutHintLayout` names the puzzle and its column, the hint card, its heading, and the toolbar that Standard desktop measures. `PlayLayoutAnchors` names the main puzzle, input, divider, and layout regions used by the Advanced workspace.

Keep measurement and resize policy in the host. A content component should not need a particular ancestor class or descendant selector to participate in layout. Put persistent choices in the appropriate preference; keep pointer preview values transient and clean them up on cancellation or unmount. `desktop-hint-sizing.ts` shares the spacing and available-height calculations used by Standard desktop hint fitting and resize limits. On mobile Play, `useMobilePuzzleFit` owns the `ResizeObserver` fitting loop and derives temporary geometry from the host-provided panel, board, and gap refs.

For a native popover anchored to a control, use `useAnchoredPopover` to share its open-state measurement lifecycle across scroll, viewport resize, and observed size changes. The host supplies named refs and the placement policy, since menus can have different flip and alignment rules. Use `positionScaledRightPopover` when menus share the scaled, right-aligned placement policy. Use `useActionMenuKeyboard` for action-menu focus entry and arrow navigation. The host supplies a dismissal callback when Escape or Tab needs a delayed exit or a fallback focus target; otherwise, the hook closes the menu and returns focus to its trigger. Keep open state, outside-click dismissal, and placement with each host. Use lower-level `focusMenuItem` or `moveMenuItemFocus` only when a control has different focus semantics.

For a custom menu whose opening direction depends on a clipping region, pass that region through a named ref. `DeviceActionMenu` receives its bounds from Settings instead of finding an ancestor by class name.

When a host scopes keyboard handling to a panel, pass the panel root through a named ref too. `ChainsPanel.panelRef` lets Play route history shortcuts to chain edits without using its styling class as an interaction contract.

Use `useCameraStream` to own camera permission requests, video playback, cancellation, and track cleanup. Keep image capture and QR decoding with the feature that understands those inputs.

Use `usePuzzleImportPreview` for import decoding, verification, cancellation, and deferred rating. Keep source choice, manual clue entry, route navigation, and saving with the import screen and puzzle store.

Use `useCollectionPuzzleActions` for the selected collection puzzle's preview request and save/play operation lifecycle. The collection route supplies its selected puzzle, network availability, and saved grid; it owns browse and detail presentation.

For a one-dimensional resize handle, `useLinearResize` shares pointer capture, clamping, and keyboard steps. The host still supplies the axis, limits, direction, and callback that updates its layout. Use a dedicated controller when a resize gesture also needs a multi-region preview or snap animation.

Use `ResizeOptionsDialog` when a single-axis panel offers step and reset controls. The host supplies the current size, bounds, resize callbacks, and focus target; use `ResizeStepControls` directly when combining multiple dimensions in one dialog.

## Separate content, marks, interaction, and layout

For reusable surfaces, decide which parts vary independently:

- **Content:** grid geometry, values, candidates, puzzle facts, or clue definitions.
- **Marks:** player colors, hint annotations, chain emphasis, conflicts, and focus cues.
- **Interaction:** click, keyboard, drag, selection, paint, and edit capabilities.
- **Layout:** host placement, measured anchors, sizing, and responsive policy.

`Board` applies the same separation at its public API: `content` describes the puzzle, `appearance` supplies marks and visual policy, `interaction` supplies selection and callbacks, and `layout` supplies host measurement anchors. Keep those groups stable and pass only the channels a caller owns. Its private `BoardCell` renderer uses matching content, appearance, and interaction groups so new cell behavior does not expand a flat per-cell prop list.

Use `COLOR_TONES` from `sudoku/game.ts` as the shared fill palette for swatches, board marks, digit keys, and cursor previews. `colorToneStyle` projects both the fill and its light or dark contrast ink; CSS consumes those values without keeping per-shade color class rules.

`VariantClues` resolves overlap and draw-order metadata in `variant-clue-model.ts`, then renders SVG marks from that model. Keep clue rules and peer semantics in their Sudoku modules; the view model only arranges their supplied definitions for display.

`NumberPuzzleGrid` follows the same content, appearance, and interaction split. Omit `interaction` for a read-only view and supply only the marks that view should show. It defaults to image semantics for static previews; use `readOnlySemantics="button"` for a solution grid. `NumberPuzzlePreview` is a thin adapter over this renderer, so import and catalog previews use the same clue, given, entry, and note presentation as play.

Solver operations that are independent of rendering live beside the puzzle rules. `solveSingleValues` is a shared domain operation for rating and Play actions; a surface can supply an engine runner and its enabled variant rules without owning that algorithm.

`Controls` groups `digits`, `tools`, `history`, `actions`, and `layout` so Play and lesson hosts can supply the channels they own without flattening keypad, mode, and workspace state into one large prop list.

`ControlModeActions` renders the primary mode buttons and capability-driven secondary actions separately. The control host owns which capabilities are available; this presenter keeps their ordering and conditional visibility consistent across compact and desktop keypads.

`DigitSelector` uses `ColorKeypad` for color choice and keeps numeric digit selection in its own path. Both stay inside the same keypad slot, while the host continues to own color and digit mutations.

Use typed data for combinations that real callers need. `BoardAnnotations` keeps cell fills, candidate marks, links, and grouped endpoints as separate kinds of mark. `mergeBoardAnnotations` combines an overlay without dropping unrelated marks. Board rendering and its accessible descriptions should resolve those marks from the same data.

For repeated puzzle summaries, share the data view while leaving the native action with its caller. `PuzzleRowContent` and `PuzzleThumbnail` can sit inside either a route link or a selection button.

## Keep the catalog useful

Update the [component catalog](../.agents/skills/sudoku-components/references/components.md) when a shared component is added, removed, renamed, or changes its intended use. Add or revise Storybook examples for reusable states and combinations, especially when behavior changes across hosts, pointer modes, or visual marks. The catalog checker verifies named component coverage; it does not prove that host lifecycles or visual combinations behave correctly.
