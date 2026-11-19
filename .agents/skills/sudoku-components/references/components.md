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
| [Board](../../../../src/components/Board.tsx) | `Board` renders a Sudoku grid with givens, entries, candidates, selection, and optional teaching annotations. Pass the Mini Sudoku layout for a 4×4 preview with 2×2 boxes and candidate slots. It reserves cell-sized outside-clue gutters independently of coordinate guides, keeping grid and link coordinates aligned. Outside clues expand teaching crops to the full grid so the entire constrained row or column remains visible. An overlay can replace the grid visually while preserving its dimensions. |
| [OutsideClues](../../../../src/components/OutsideClues.tsx) | `OutsideClues` draws Sandwich/X-Sums totals, Skyscrapers visibility counts and Little Killer arrows in the same inner-cell viewport as candidate links, including the grid border inset. It reserves edge and corner gutters, keeps zero Sandwich totals visible, and moves repeated anchors outward along their actual rays. When orthogonal families mix, numbers have S/X/Sk prefixes with a visible legend in Board. Its accessible description names each clue's rule, direction and covered cells. |
| [BoardAnnotations](../../../../src/components/BoardAnnotations.tsx) | `BoardLinks` draws supplied links between grid positions for chains and teaching diagrams. Pass the grid’s candidate insets when Clone labels or cage totals shift candidate positions. |
| [BoardMarks](../../../../src/components/BoardMarks.tsx) | `BoardMarks` manages the appearance and removal of marks in a grid overlay. |
| [VariantClues](../../../../src/components/VariantClues.tsx) | `VariantClues` renders the visible rules for a variant grid. `Cage` outlines cages and labels totals. `ExtraRegion` marks additional regions. `CloneClue` shades every cell in a Clone clue; letters identify transitive matching sets, including disconnected or overlapping copies. Candidate grids reserve space below the digits for these labels. `ArrowClue` draws a bulb and arrow. `RegionSumClue` draws blue paths with independent line colors, preserving closed geometry and separated logical nodes. `BetweenClue` draws a line with two endpoint circles. Dotted cells and dashed connectors identify separated logical cells; interior digits can repeat. `InequalityClue` marks a comparison. `ColoredLineLane` routes colored rule lines. `WhispersLabel` labels a Whispers line. `SumClue` places a sum indicator. |
| [Controls](../../../../src/components/Controls.tsx) | `Controls` provides the solving keypad and tool actions. In compact Highlight mode, All or Any appears beside Highlight and uses a reserved space. |
| [CellColorPalette](../../../../src/components/CellColorPalette.tsx) | `CellColorPalette` combines color target and swatches. `ColorTargetPicker` chooses cells or candidates. `ColorSwatches` lets the player select a brush. |
| [ChainsPanel](../../../../src/components/ChainsPanel.tsx) | `ChainsPanel` manages player-drawn chains saved with the puzzle. An unfinished path stays available when the player returns to the panel. `LinkLegend` explains the visual conventions used by the desktop panel. |
| [ActionHistoryPanel](../../../../src/components/ActionHistoryPanel.tsx) | `ActionHistoryPanel` shows a puzzle’s recorded moves and provides navigation through them. |
| [HintCard](../../../../src/components/HintCard.tsx) | `HintCard` presents the next hint in stages. `DeductionExplanation` renders the reasoning for a deduction. `DeductionOutcome` summarizes the resulting placement or elimination. |
| [PuzzleAnalysis](../../../../src/components/PuzzleAnalysis.tsx) | `PuzzleAnalysis` owns the analysis interaction. `PuzzleAnalysisCard` wraps the analysis in a standalone card. `PuzzleAnalysisContents` embeds the report in an existing surface. `AnalysisTable` lays out the report’s technique counts. |
| [PuzzleCheckResult](../../../../src/components/PuzzleCheckResult.tsx) | `PuzzleCheckResult` displays the outcome of an explicit puzzle check. |
| [SolutionPath](../../../../src/components/SolutionPath.tsx) | `SolutionPath` embeds a list of logical solving steps. `SolutionDialog` presents that path in a modal. The list and preview label a stalled path **Last position** and a completed path **Final grid**. |
| [Worktable](../../../../src/components/Worktable.tsx) | `Worktable` coordinates interactions, solving tools, and state for a playable puzzle. View grid opens a temporary copy after a solve and keeps the saved result and elapsed time. Space pauses or resumes a puzzle and switches between the grid and results after a solve. The card shows when another device has the puzzle open and offers Catch up when the player can open that device’s latest puzzle. Its menu owns manual sync, in-progress status, and sync warnings. |
| [CompletedPuzzle](../../../../src/components/CompletedPuzzle.tsx) | `CompletedPuzzle` shows solve results and offers to catch up to another device’s puzzle or resume the next playable attempt in last-played order. Pass `onResumePuzzle` to open the existing attempt by ID. New puzzle opens the variant and difficulty picker. When a collection can continue, its next puzzle is the primary action. The mobile worktable displays these actions in the keypad slot. Pure Whispers puzzles retain their German/Dutch ruleset for next-puzzle generation. |

## Layout and navigation

| Source | When to use it |
| --- | --- |
| [Workspace](../../../../src/components/Workspace.tsx) | `SudokuShell` owns application state and shared navigation, resumes the active puzzle at launch, and renders the puzzle hub. `Workspace` mounts the play slot for its route. |
| [DesktopPlayLayout](../../../../src/components/DesktopPlayLayout.tsx) | `DesktopPlayLayout` arranges the play surface and its surrounding content. `PlayWorkspace` places play content in the appropriate layout. `PlayResizeHandle` adjusts the input panel during a resize session. |
| [DesktopDockLayout](../../../../src/components/DesktopDockLayout.tsx) | `DesktopDockLayout` hosts the advanced desktop docking workspace. Its private panel adapters connect dock slots to existing feature views. `PuzzlePanel` hosts the grid. `InputPanel` hosts entry controls. `ChainsDockPanel` hosts chains. `CellColorsPanel` hosts brushes. `HintPanel` hosts hints. `SolutionPathPanel` hosts the solve path. `TechniquesDockPanel` hosts techniques. `DetailsPanel` hosts puzzle details. `BrowserPanel` hosts the puzzle browser. `FixedPanelTab` supplies a tab for a fixed panel. |
| [MobileInputTabs](../../../../src/components/MobileInputTabs.tsx) | `MobileInputTabs` keeps Digits, Colors, and Chains in one mobile input card. The private `InputToolsMenu` opens Colors and Chains from the top-right corner of Digits. Closing a tool tab hides its annotations until reopened. |
| [MobileInputResizeHandle](../../../../src/components/MobileInputResizeHandle.tsx) | `MobileInputResizeHandle` adjusts the height shared by the puzzle and the mobile input card through pointer or keyboard input. |
| [MobilePanelLayout](../../../../src/components/MobilePanelLayout.tsx) | `MobilePanelLayout` arranges the small-screen play panels, supports reordering, and animates changes when a hint opens or closes. |
| [MobileHintSwipe](../../../../src/components/MobileHintSwipe.tsx) | `MobileHintSwipe` wraps the hint card in the mobile play layout. It handles horizontal touch gestures and shows the dismiss or apply action as the card moves. Keep the card buttons available for taps and keyboard input. |

## Library, creation, and import

| Source | When to use it |
| --- | --- |
| [PuzzlesPage](../../../../src/components/PuzzlesPage.tsx) | `PuzzlesPage` serves the Puzzles home and its navigation. Its private `PuzzleLibrary` shows Active Puzzles in last-played order and offers a start action when there are none. `SolvedPuzzleLibrary` shows solves newest first, keeps variant and difficulty filters visible, and opens date fields from the calendar button. `PuzzleRows` renders library rows with `MiniGrid` previews. `NewPuzzleVariant` browses variants and offers creation and import. Families with named rulesets expose their selection on both New Puzzle steps and retain it in URLs/preferences. `NewPuzzleDifficulty` opens on its own route to select a difficulty and start the puzzle. On mobile, center the form below the pinned heading and Back control. `Statistics` summarizes solves. `TechniqueStatistics` shows progress by solving technique. |
| [PuzzleLibrary](../../../../src/components/PuzzleLibrary.tsx) | `PuzzleLibrary` renders a compact list of selectable attempts for callers that supply a selection callback. |
| [AdvancedPuzzleBrowser](../../../../src/components/AdvancedPuzzleBrowser.tsx) | `AdvancedPuzzleBrowser` provides active, past, and saved views inside the advanced workspace. Its `MiniGrid` supplies a preview for each row. |
| [PuzzleCollections](../../../../src/components/PuzzleCollections.tsx) | `PuzzleCollections` browses collection packs. `DownloadPuzzles` offers offline downloads. `CollectionCredits` attributes a collection. `PuzzleCollectionCredit` attributes the collection associated with a particular puzzle. |
| [PuzzleDialogs](../../../../src/components/PuzzleDialogs.tsx) | `ManagePuzzle` handles filing or deleting an attempt. `SharePuzzle` creates a link that opens the saved attempt for devices with access and a fresh solve for other recipients. `SavePuzzle` saves a puzzle made in the editor. |
| [DifficultySelector](../../../../src/components/DifficultySelector.tsx) | `DifficultySelector` chooses a supported difficulty for the selected puzzle variant. |
| [VariantRulesetSelector](../../../../src/components/VariantRulesetSelector.tsx) | `VariantRulesetSelector` chooses a named generation preset using accessible native radio inputs. Pair it with the preview and generation call so Whispers retains the selected German/Dutch minimum. It renders nothing for families without presets. |
| [VariantPreview](../../../../src/components/VariantPreview.tsx) | `VariantPreview` illustrates a generatable variant’s grid markings or global rule. Pair it with the variant name when browsing or confirming a selection; chess variants use their matching piece/crown, Non-Consecutive shows valid adjacent digits, Odd/Even uses the shared circle/square marker renderer, Whispers uses the selected preset’s actual line/minimum, Palindrome reuses its real mirrored-line renderer, Global Entropy shows a valid 2 × 2 example with all three digit ranges, Entropic Lines uses complete paths through the shared dashed-line renderer, and Modular Lines adds valid remainder-class digits to complete shared line geometry. |
| [ImportPuzzle](../../../../src/components/ImportPuzzle.tsx) | `ImportPuzzle` handles puzzle text, files, and photo entry through preview and confirmation. |
| [PuzzleCamera](../../../../src/components/PuzzleCamera.tsx) | `PuzzleCamera` captures a still image of a puzzle for import. |
| [PhotoCropEditor](../../../../src/components/PhotoCropEditor.tsx) | `PhotoCropEditor` lets a player align the crop with a photographed grid before recognition. |
| [PhotoPuzzleReview](../../../../src/components/PhotoPuzzleReview.tsx) | `PhotoPuzzleReview` lets a player correct recognized givens before opening a photographed puzzle. |

## Settings and linked devices

| Source | When to use it |
| --- | --- |
| [Settings](../../../../src/components/Settings.tsx) | `Settings` composes the settings modal and its sections. `GeneralSettings` renders the selected play or hint settings. `AppearanceSettings` groups appearance and workspace choices. `ThemePreview` shows a palette sample. `ThemeSettings` selects palettes. `SizeSettings` adjusts text and input sizes. `GuideSetting` controls grid guides. `HighlightSettings` configures related cells, digits, and candidates. `PuzzleTimingSettings` controls the timer, pause button, and time tracking. |
| [KeyboardShortcutsPage](../../../../src/components/KeyboardShortcutsPage.tsx) | `KeyboardShortcutsPage` reviews, edits, and restores keyboard bindings. |
| [DeviceSyncPage](../../../../src/components/DeviceSyncPage.tsx) | `DeviceSyncPage` renders the current sync route for enrollment, scanning, confirmation, recovery, invitations, or device management. Its header follows browser history. |
| [SyncConnectionStatus](../../../../src/components/SyncConnectionStatus.tsx) | Use `SyncConnectionStatus` for the connection dot beside the app wordmark. Show the status label on the Device sync page. |
| [PairingInvitation](../../../../src/components/PairingInvitation.tsx) | Use `PairingInvitation` on the inviting device to show the single-use code, expiry, and copy action. It uses the shared Sudoku QR generator. The close control belongs in its top-right corner. |
| [PairingScanner](../../../../src/components/PairingScanner.tsx) | Use `PairingScanner` with the site address that issues codes for the current sync service. It opens confirmation after the same code stays in the live camera view for half a second, reads a selected photo immediately, and explains site mismatches. |
| [LinkedDeviceRow](../../../../src/components/LinkedDeviceRow.tsx) | `LinkedDeviceRow` displays each device name in medium-weight body text beneath the section heading. The current device gets a smaller, muted label. Its `DeviceActionMenu` groups rename and unlink on narrow screens and manages menu keyboard focus. |

## Learning

| Source | When to use it |
| --- | --- |
| [LearnHeading](../../../../src/components/LearnHeading.tsx) | `LearnHeading` supplies the heading and navigation context for a lesson. The mobile header stays above the scrolling introduction and article. `LessonDifficulty` labels its difficulty. |
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
