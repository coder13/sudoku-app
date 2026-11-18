# Component catalog

Use the source link to see props and exports. Private names are included so related changes can stay with their owner. Route components own navigation and screen composition.

Search by component name or browse the sections below.

## Shared controls and surfaces

| Source | When to use it |
| --- | --- |
| [Button](../../../../src/components/Button.tsx) | `Button` for a labeled action or explicit form submission. `IconButton` for an icon-only action with an accessible name. `ChoiceButton` for a selectable path with explanatory text. |
| [SelectControl](../../../../src/components/SelectControl.tsx) | `SelectControl` for a native select with the app’s chevron, form behavior, and keyboard navigation. |
| [Modal](../../../../src/components/Modal.tsx) | `Modal` for a blocking task that needs focus management, Escape dismissal, and a return to its opener. |
| [Presence](../../../../src/components/Presence.tsx) | `Presence` keeps a subtree mounted through its exit. `MotionSurface` provides that lifecycle for conditional surfaces such as dialogs. |
| [ModeBadge](../../../../src/components/ModeBadge.tsx) | `ModeBadge` identifies the active input tool on the grid. |
| [OfflineUpdates](../../../../src/components/OfflineUpdates.tsx) | `OfflineUpdates` connects to the service worker at the app root. `UpdatePrompt` presents an available or pending app update. |

## Puzzle input and tools

| Source | When to use it |
| --- | --- |
| [Board](../../../../src/components/Board.tsx) | `Board` renders a Sudoku grid with givens, entries, candidates, selection, and optional teaching annotations. |
| [BoardAnnotations](../../../../src/components/BoardAnnotations.tsx) | `BoardLinks` draws supplied links between grid positions for chains and teaching diagrams. |
| [BoardMarks](../../../../src/components/BoardMarks.tsx) | `BoardMarks` manages the appearance and removal of marks in a grid overlay. |
| [VariantClues](../../../../src/components/VariantClues.tsx) | `VariantClues` renders the visible rules for a variant grid. `Cage` outlines cages and labels totals. `ExtraRegion` marks additional regions. `ArrowClue` draws a bulb and arrow. `InequalityClue` marks a comparison. `ColoredLineLane` routes colored rule lines. `WhispersLabel` labels a Whispers line. `SumClue` places a sum indicator. |
| [Controls](../../../../src/components/Controls.tsx) | `Controls` provides the solving keypad and tool actions for a play workspace. |
| [CellColorPalette](../../../../src/components/CellColorPalette.tsx) | `CellColorPalette` combines color target and swatches. `ColorTargetPicker` chooses cells or candidates. `ColorSwatches` lets the player select a brush. |
| [ChainsPanel](../../../../src/components/ChainsPanel.tsx) | `ChainsPanel` manages player-drawn chains. `LinkLegend` explains the visual conventions used by the panel. |
| [ActionHistoryPanel](../../../../src/components/ActionHistoryPanel.tsx) | `ActionHistoryPanel` shows a puzzle’s recorded moves and provides navigation through them. |
| [HintCard](../../../../src/components/HintCard.tsx) | `HintCard` presents the next hint in stages. `DeductionExplanation` renders the reasoning for a deduction. `DeductionOutcome` summarizes the resulting placement or elimination. |
| [PuzzleAnalysis](../../../../src/components/PuzzleAnalysis.tsx) | `PuzzleAnalysis` owns the analysis interaction. `PuzzleAnalysisCard` wraps the analysis in a standalone card. `PuzzleAnalysisContents` embeds the report in an existing surface. `AnalysisTable` lays out the report’s technique counts. |
| [PuzzleCheckResult](../../../../src/components/PuzzleCheckResult.tsx) | `PuzzleCheckResult` displays the outcome of an explicit puzzle check. |
| [SolutionPath](../../../../src/components/SolutionPath.tsx) | `SolutionPath` embeds a list of logical solving steps. `SolutionDialog` presents that path in a modal. |
| [Worktable](../../../../src/components/Worktable.tsx) | `Worktable` coordinates interactions, solving tools, and state for a playable puzzle. |
| [CompletedPuzzle](../../../../src/components/CompletedPuzzle.tsx) | `CompletedPuzzle` shows the result and next actions after a solve. `PuzzleDifficulty` displays the puzzle’s grade. |

## Layout and navigation

| Source | When to use it |
| --- | --- |
| [Workspace](../../../../src/components/Workspace.tsx) | `SudokuShell` owns application state and shared navigation. `Workspace` mounts the play slot for its route. `PuzzlesWorkspace` connects the puzzles route to shell state. |
| [DesktopPlayLayout](../../../../src/components/DesktopPlayLayout.tsx) | `DesktopPlayLayout` arranges the play surface and its surrounding content. `PlayWorkspace` places play content in the appropriate layout. `PlayResizeHandle` adjusts the input panel during a resize session. |
| [DesktopDockLayout](../../../../src/components/DesktopDockLayout.tsx) | `DesktopDockLayout` hosts the advanced desktop docking workspace. Its private panel adapters connect dock slots to existing feature views. `PuzzlePanel` hosts the grid. `InputPanel` hosts entry controls. `ChainsDockPanel` hosts chains. `CellColorsPanel` hosts brushes. `HintPanel` hosts hints. `SolutionPathPanel` hosts the solve path. `TechniquesDockPanel` hosts techniques. `DetailsPanel` hosts puzzle details. `BrowserPanel` hosts the puzzle browser. `FixedPanelTab` supplies a tab for a fixed panel. |
| [MobilePanelLayout](../../../../src/components/MobilePanelLayout.tsx) | `MobilePanelLayout` arranges the small-screen play panels and supports reordering. |

## Library, creation, and import

| Source | When to use it |
| --- | --- |
| [ResumePuzzles](../../../../src/components/ResumePuzzles.tsx) | `ResumePuzzles` shows the home list when several attempts are in progress and links to each attempt. |
| [PuzzlesPage](../../../../src/components/PuzzlesPage.tsx) | `PuzzlesPage` composes the full puzzle hub. Its private `PuzzleLibrary` supports browsing and managing attempts. `MiniGrid` previews an attempt. `NewPuzzleSection` presents creation choices. `Statistics` summarizes solves. `TechniqueStatistics` shows progress by solving technique. |
| [PuzzleLibrary](../../../../src/components/PuzzleLibrary.tsx) | `PuzzleLibrary` renders a compact list of selectable attempts for callers that supply a selection callback. |
| [AdvancedPuzzleBrowser](../../../../src/components/AdvancedPuzzleBrowser.tsx) | `AdvancedPuzzleBrowser` provides active, past, and saved views inside the advanced workspace. Its `MiniGrid` supplies a preview for each row. |
| [PuzzleCollections](../../../../src/components/PuzzleCollections.tsx) | `PuzzleCollections` browses collection packs. `DownloadPuzzles` offers offline downloads. `CollectionCredits` attributes a collection. `PuzzleCollectionCredit` attributes the collection associated with a particular puzzle. |
| [PuzzleDialogs](../../../../src/components/PuzzleDialogs.tsx) | `NewPuzzle` starts a puzzle from variant and difficulty choices. `ManagePuzzle` handles filing or deleting an attempt. `SharePuzzle` prepares a puzzle for another player. `SavePuzzle` saves a puzzle made in the editor. |
| [MobileNewPuzzle](../../../../src/components/MobileNewPuzzle.tsx) | `MobileNewPuzzle` provides the small-screen creation flow through variant, difficulty, and start. |
| [DifficultySelector](../../../../src/components/DifficultySelector.tsx) | `DifficultySelector` chooses a supported difficulty for the selected puzzle variant. |
| [VariantSelector](../../../../src/components/VariantSelector.tsx) | `VariantSelector` chooses a puzzle ruleset. `VariantPreview` illustrates a ruleset before selection. |
| [ImportPuzzle](../../../../src/components/ImportPuzzle.tsx) | `ImportPuzzle` handles puzzle text, files, and photo entry through preview and confirmation. |
| [PuzzleCamera](../../../../src/components/PuzzleCamera.tsx) | `PuzzleCamera` captures a still image of a puzzle for import. |
| [PhotoCropEditor](../../../../src/components/PhotoCropEditor.tsx) | `PhotoCropEditor` lets a player align the crop with a photographed grid before recognition. |
| [PhotoPuzzleReview](../../../../src/components/PhotoPuzzleReview.tsx) | `PhotoPuzzleReview` lets a player correct recognized givens before opening a photographed puzzle. |

## Settings and linked devices

| Source | When to use it |
| --- | --- |
| [Settings](../../../../src/components/Settings.tsx) | `Settings` composes the settings modal and its sections. `GeneralSettings` renders the selected play or hint settings. `AppearanceSettings` groups appearance and workspace choices. `ThemePreview` shows a palette sample. `ThemeSettings` selects palettes. `SizeSettings` adjusts text and input sizes. `GuideSetting` controls grid guides. `HighlightSettings` configures related cells, digits, and candidates. `PuzzleTimingSettings` controls the timer, pause button, and time tracking. |
| [KeyboardShortcutsPage](../../../../src/components/KeyboardShortcutsPage.tsx) | `KeyboardShortcutsPage` reviews, edits, and restores keyboard bindings. |
| [DeviceSyncPage](../../../../src/components/DeviceSyncPage.tsx) | `DeviceSyncPage` owns enrollment, invites, joining, recovery, and linked-device management. |
| [PairingScanner](../../../../src/components/PairingScanner.tsx) | `PairingScanner` reads a device-link QR code from the camera or a saved photo and returns a ticket for confirmation. |
| [LinkedDeviceRow](../../../../src/components/LinkedDeviceRow.tsx) | `LinkedDeviceRow` displays a private device label and handles rename and unlink. Its `DeviceActionMenu` groups those actions on narrow screens and manages menu keyboard focus. |

## Learning

| Source | When to use it |
| --- | --- |
| [LearnHeading](../../../../src/components/LearnHeading.tsx) | `LearnHeading` supplies the heading and navigation context for a lesson. `LessonDifficulty` labels its difficulty. |
| [ConceptCheck](../../../../src/components/ConceptCheck.tsx) | `ConceptCheck` presents questions with feedback when a lesson tests understanding. |
| [LessonWorkbench](../../../../src/components/LessonWorkbench.tsx) | `LessonWorkbench` provides an interactive teaching grid with lesson annotations and optional editing. |
| [LessonPractice](../../../../src/components/LessonPractice.tsx) | `PracticePuzzle` runs a specific practice position and checks the learner’s next move. |
| [FoundationVisual](../../../../src/components/FoundationVisual.tsx) | `FoundationVisual` selects a visual for a foundation lesson. `VisualKey` explains annotations. `ProofBranches` renders alternative cases. `VisualWalkthrough` steps through an explanation. |
| [TechniqueLesson](../../../../src/components/TechniqueLesson.tsx) | `TechniqueLesson` composes an article and its exercises. `Diagram` shows a lesson position. `WorkedExampleViewer` steps through one example. `WorkedExamples` selects and loads examples. `Practice` renders a drill block. `LessonTags` shows classifications. `AlternateNames` lists other names for a technique. `ExplanationBlock` dispatches a content block to its appropriate presentation. |

## Route-owned components

| Source | When to use it |
| --- | --- |
| [__root](../../../../src/routes/__root.tsx) | `App` composes the app shell and routed content. `RootDocument` supplies the document, head, and scripts. |
| [import](../../../../src/routes/import.tsx) | `ImportPage` mounts the import experience at its route. |
| [learn.$technique](../../../../src/routes/learn.$technique.tsx) | `LessonPage` resolves the selected lesson for its route. |
| [learn.index](../../../../src/routes/learn.index.tsx) | `LessonOverview` introduces the learning catalog. |
| [learn](../../../../src/routes/learn.tsx) | `LearnLayout` arranges lesson navigation and content. `TechniqueNavigation` navigates the lesson catalog. |
