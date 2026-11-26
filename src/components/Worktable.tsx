import { fogView } from '../sudoku/fog'
import { Button, IconButton } from './Button'
import {
  type CSSProperties,
  type ReactNode,
  type Dispatch,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ArrowRight,
  Bookmark,
  Braces,
  Check,
  CheckCheck,
  Clipboard,
  CloudUpload,
  Eraser,
  Eye,
  Info,
  Lightbulb,
  Link2,
  ListFilter,
  ListOrdered,
  LoaderCircle,
  LogOut,
  MonitorSmartphone,
  MoreHorizontal,
  Palette,
  Pause,
  PencilLine,
  Pin,
  PinOff,
  Play,
  Redo2,
  RotateCcw,
  ScanSearch,
  Share2,
  Undo2,
  X,
  ZoomOut,
} from 'lucide-react'
import { explainCandidateRecovery } from '../sudoku/candidate-recovery'
import { recordAction, type ActionKind } from '../sudoku/action-history'
import { PINNABLE_ACTIONS, type PinnedAction } from '../sudoku/pinned-actions'
import { deviceSync } from '../sudoku/device-sync'
import { formatPuzzleRating, SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { createEngineSession, runEngine, type Candidate, type DeductionAction, type EngineRunner } from '../sudoku/engine'
import {
  EMPTY,
  candidateCount,
  clearImportedDrawings,
  completeCandidateMasks,
  conflictsOf,
  enter,
  formatTime,
  hasCandidate,
  isSolved,
  marksOf,
  markSolveUntimed,
  needsInitialCandidates,
  onlyCandidate,
  paintCandidates,
  paintCells,
  puzzleIdentity,
  redo,
  replaceCandidates,
  restartGame,
  setAqreShade,
  setGamePaused,
  singleFromCandidates,
  toggleCandidateGroup,
  undo,
  valuesOf,
  type ColorTarget,
  type ErrorMode,
  type Game,
  type Position,
} from '../sudoku/game'
import { sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { algebraicRules } from '../sudoku/algebraic-play'
import { ALGEBRAIC_CAGES_NAME, MINI_NAME, MINI_RULE, sizedGridName } from '../sudoku/new-puzzle'
import { CLASSIC_GRID, sizedClassicPosition } from '../sudoku/grid'
import { cellReference, describeHintRemovals, hintChoiceKey, techniqueLabel, type CellReferenceStyle } from '../sudoku/hints'
import { activeHighlightDigit, functionKeyDigit, givenDigitAt, nextIncompleteDigit } from '../sudoku/highlighting'
import { lessonValues } from '../sudoku/lesson-diagram'
import { lessonRoutes } from '../sudoku/lessons'
import { originalSolutionStatus } from '../sudoku/puzzle-validation'
import type { AdvancedModes, AppearancePreferences, HighlightPreferences, WorkspaceMode } from '../sudoku/preferences'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { rectangleSelection } from '../sudoku/selection'
import { togglePencilMode } from '../sudoku/puzzle-input-mode'
import { highlightedDigitShortcut, shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { roomStore } from '../sudoku/storage'
import {
  defaultDigitHighlight,
  defaultToolPanels,
  TOOL_PANEL_ORDER,
  type ToolPanelTab,
  type PuzzleTool,
} from '../sudoku/play-session'
import { puzzleInputMode } from '../sudoku/puzzle-input-mode'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { playerActions } from '../sudoku/technique-progress'
import { variantName, type VariantRuleSectionId } from '../sudoku/variants'
import { solveSingleValues } from '../sudoku/solve-singles'
import { Board, gridCellAtPoint } from './Board'
import { BookmarksPanel } from './BookmarksPanel'
import { AdvancedPuzzleBrowser, type PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { CellColorPalette } from './CellColorPalette'
import { ChainColorsDialog, ChainsPanel } from './ChainsPanel'
import { CompletedPuzzle } from './CompletedPuzzle'
import { KillerCombos } from './KillerCombos'
import { Controls } from './Controls'
import { DesktopDockLayout } from './DesktopDockLayout'
import { ModeBadge } from './ModeBadge'
import { PuzzleCollectionCredit } from './PuzzleCollections'
import { HintCard } from './HintCard'
import { InputToolsMenu } from './InputToolsMenu'
import { MobileInputTabs } from './MobileInputTabs'
import type { MobileInputResizeRefs } from './MobileInputResizeHandle'
import { VariantRules } from './VariantRules'
import { PlayHint, PlayLayout } from './PlayLayout'
import { useMobileLayout } from './mobile-layout'
import { usePlayPanelNavigation } from './play/usePlayPanelNavigation'
import { useGridClickAway } from './useGridClickAway'
import { Modal } from './Modal'
import { MotionSurface, usePresence } from './Presence'
import { PuzzleCheckResult, type DialogResult } from './PuzzleCheckResult'
import { PuzzleAnalysisContents } from './PuzzleAnalysis'
import { PuzzleDetails } from './PuzzleDetails'
import { PuzzleSessionDialogs } from './PuzzleSessionDialogs'
import { PlayStageLayers } from './PlayStageLayers'
import { PinnedActionBar } from './PinnedActionBar'
import { SolutionPath, type SolutionPathState } from './SolutionPath'
import { useActionHistory } from './useActionHistory'
import { usePlayPreference } from './usePlayPreference'
import { usePuzzleSelection } from './usePuzzleSelection'
import { usePuzzleTimer } from './usePuzzleTimer'
import { usePuzzleZoom } from './usePuzzleZoom'
import { useTouchHold } from './useTouchHold'
import { PLAY_TOOL_TABS } from './PlayToolRegistry'
import { usePlayPanelModel } from './play/usePlayPanelModel'
import { usePlayInputModel, type CellPaintStroke } from './play/usePlayInputModel'
import { dispatchCommandShortcut, type UiCommand } from './UiCommand'
import { mergeBoardAnnotations } from './BoardAnnotations'
import { CellReferenceHighlightProvider } from './CellReferenceHighlight'
import { canSelectAlsHighlight, useAlsHighlight } from './useAlsHighlight'
import { candidateToolMasks, isChainStep } from './play/play-model'
import { usePlayGameModel } from './play/usePlayGameModel'
import { usePauseHotkey } from './usePauseHotkey'
import { usePlayPuzzleTasks } from './play/usePlayPuzzleTasks'
import { usePlaySession } from './play/usePlaySession'
import { ActionMenuItem } from './ActionMenuItem'
import { usePlayHintModel, type HintState } from './play/usePlayHintModel'
import { usePlayHintActions } from './play/usePlayHintActions'
import { usePlayDigitActions } from './play/usePlayDigitActions'
import { usePlayColorActions } from './play/usePlayColorActions'
import { usePlayPuzzleCommands } from './play/usePlayPuzzleCommands'
import { usePlayHintMutations } from './play/usePlayHintMutations'
import { usePlayEntryActions } from './play/usePlayEntryActions'
import { usePlaySolutionModel } from './play/usePlaySolutionModel'
import { usePlaySolutionLoader } from './play/usePlaySolutionLoader'
import { usePlayRatingEvents } from './play/usePlayRatingEvents'
import { usePlayPuzzleRating } from './play/usePlayPuzzleRating'
import { usePlayCandidateNotes } from './play/usePlayCandidateNotes'
import { usePlayNakedSingles } from './play/usePlayNakedSingles'
import { usePlayChainModel } from './play/usePlayChainModel'
import { usePlayChainActions } from './play/usePlayChainActions'
import { usePlayColorModel } from './play/usePlayColorModel'
import { usePlayErrorModel } from './play/usePlayErrorModel'
import { usePlayInteractionModel } from './play/usePlayInteractionModel'
import { usePlayToolPreferences } from './play/usePlayToolPreferences'
import { usePlayBoardGestures } from './play/usePlayBoardGestures'
import { usePlayCellActions } from './play/usePlayCellActions'
import { useAnchoredPopover } from './useAnchoredPopover'
import { positionScaledRightPopover } from './scaled-popover-position'
import { usePlayLayoutAnchors } from './play-layout-anchors'
import { mergeRefs } from './merge-refs'
import { usePlayBookmarkActions } from './play/usePlayBookmarkActions'
import { focusGridCell, gridCellInDirection, isGridDirectionKey } from './grid-cell-navigation'
import { usePlaySolvedGrid } from './play/usePlaySolvedGrid'

const pinnedActionDetails = Object.fromEntries(PINNABLE_ACTIONS.map((action) => [action.id, action])) as Record<PinnedAction, (typeof PINNABLE_ACTIONS)[number]>

function pinnedCommand<Id extends PinnedAction>(id: Id, available: boolean, run: (source?: HTMLElement) => void, pressed?: boolean): UiCommand<Id> {
  return {
    id,
    label: pinnedActionDetails[id].label,
    available,
    run,
    ...(pressed === undefined ? {} : { pressed }),
  }
}

export type WorktableActions = { check: () => void }

export function Worktable({
  game: savedGame,
  games,
  placeholder,
  storageAvailable = true,
  preferredDifficulty,
  modalOpen,
  pauseShortcutsEnabled = true,
  advancedModes,
  appearance,
  highlighting,
  errorMode,
  multi,
  actionsRef,
  inputSize,
  panelHeight,
  setPanelHeight,
  beginResize,
  toggleMulti,
  onShare,
  onExport,
  onPublish,
  onCancelDraft,
  onNewPuzzle,
  onImportPuzzle,
  onEditCages,
  onEditSizedRules,
  onEditRegions,
  onEditChainColors,
  onStopPlaying,
  onSelectPuzzle = roomStore.select,
  sharedOnOtherDevice,
  catchUpPuzzle,
  onMobilePuzzleTopSpaceChange,
  pausedOnLaunch = false,
  onResumeLaunch,
  loadingPuzzle = false,
  cellReferenceStyle,
  workspaceMode,
  showLeftPanel,
  showRightPanel,
  showBottomPanel,
  onOpenHintPanel,
  onOpenRightPanel,
  puzzleBrowserView,
  setPuzzleBrowserView,
}: {
  game: Game
  games: Game[]
  placeholder?: ReactNode
  storageAvailable?: boolean
  preferredDifficulty: DifficultyPreference
  modalOpen: boolean
  pauseShortcutsEnabled?: boolean
  advancedModes: AdvancedModes
  appearance: AppearancePreferences
  highlighting: HighlightPreferences
  errorMode: ErrorMode
  cellReferenceStyle: CellReferenceStyle
  workspaceMode: WorkspaceMode
  multi: boolean
  actionsRef: RefObject<WorktableActions | null>
  inputSize: number
  panelHeight: number
  setPanelHeight: Dispatch<SetStateAction<number>>
  beginResize: () => void
  toggleMulti: () => void
  onShare: () => void
  onExport?: () => void
  onPublish: () => void
  onCancelDraft: () => void
  onStopPlaying: () => void
  onSelectPuzzle?: (id: string) => void
  pausedOnLaunch?: boolean
  onResumeLaunch?: () => void
  loadingPuzzle?: boolean
  sharedOnOtherDevice?: boolean
  catchUpPuzzle?: Game
  onNewPuzzle: (step?: 'difficulty') => void
  onImportPuzzle: () => void
  onEditCages?: () => void
  onEditSizedRules?: () => void
  onEditRegions?: () => void
  onEditChainColors?: () => void
  showLeftPanel: boolean
  showRightPanel: boolean
  showBottomPanel: boolean
  onOpenHintPanel: () => void
  onOpenRightPanel: () => void
  puzzleBrowserView: PuzzleBrowserView
  setPuzzleBrowserView: (view: PuzzleBrowserView) => void
  onMobilePuzzleTopSpaceChange?: (space: number, shrink: number) => void
}) {
  const playLayoutAnchors = usePlayLayoutAnchors()
  const focusGridAfterHistory = useRef(false)
  const {
    completed,
    game,
    playground,
    session,
    showResults,
    showSolvedGrid,
    openSolvedGrid,
    toggleSolvedView,
    readWorkingGame,
    updateSolvedSession,
  } = usePlaySolvedGrid(savedGame, pausedOnLaunch)
  const { state: savedPlayState, set: setPlaySessionState } = usePlaySession(game.id)
  const hintRevealed = savedPlayState?.hintOpen ?? false
  const setHintRevealed = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    setPlaySessionState('hintOpen', current => typeof value === 'function' ? value(current) : value)
  }, [setPlaySessionState])
  const desktopHintSizeRef = useRef<number | undefined>(savedPlayState?.desktopHintSize)
  desktopHintSizeRef.current = savedPlayState?.desktopHintSize
  const saveDesktopHintSize = useCallback((size: number | undefined) => setPlaySessionState('desktopHintSize', size), [setPlaySessionState])
  const toolPanels = savedPlayState?.toolPanels ?? defaultToolPanels
  const {
    id,
    givens,
    difficulty,
    score,
    variant,
    algebraic,
    sized,
    grid,
    gridSize,
    generatedWithAuto,
    nonUnique,
    fog,
    visibleGivens,
    start,
    values,
    center,
    corner,
    eliminations,
    displayedCandidates,
    candidateDigitColors,
    aqreShades,
    puzzle,
    hintPosition,
    conflicts,
    draft,
    mixedVariant,
    ruleSections,
    solutionIdentity,
    verifiedOriginal,
  } = usePlayGameModel(game)
  useActionHistory(savedGame)
  const modeBadgeId = useId()
  const puzzleStageId = useId()
  const [modeBadgePosition, setModeBadgePosition] = usePlayPreference('cardModeBadgePosition')
  const [pinnedActions] = usePlayPreference('pinnedActions')
  const [mobileHintPinned, setMobileHintPinned] = usePlayPreference('mobileHintPinned')
  const [showKillerCombinations] = usePlayPreference('showKillerCombinations')
  const [pointerFocusedCell, setPointerFocusedCell] = useState<number | null>(null)
  const [inputModality, setInputModality] = useState<'pointer' | 'keyboard'>('keyboard')
  const { active, selected, anchor, setActive, setSelected, setAnchor } = usePuzzleSelection(game.id, start)
  const {
    selectedDigit, setSelectedDigit,
    digitHighlight, setDigitHighlight, highlightedDigitMask,
    selectedColor, setSelectedColor, colorTarget, setColorTarget, colorBrush, setColorBrush,
    highlightCandidatePairs, setHighlightCandidatePairs,
    savedHighlightMode, setSavedHighlightMode,
    savedPencil,
    candidateKind, setCandidateKind,
    setColorMode,
    setEraseMode,
    savedInputTool,
    setInputToolOverride, toggleInputToolOverride, selectInputToolPencil,
  } = usePlayToolPreferences({ gridSize, session: savedPlayState, updateSession: setPlaySessionState })
  const [lastColoredCandidate, setLastColoredCandidate] = useState<{
    gameId: string
    candidate: Candidate
  } | null>(null)
  const [desktopColorsVisible, setDesktopColorsVisible] = useState(false)
  const [desktopChainsVisible, setDesktopChainsVisible] = useState(false)
  const alsHighlightEnabled = advancedModes.experimentalAlsHighlighting
  const [desktopInputVisible, setDesktopInputVisible] = useState(false)
  const showStrongLinks = savedPlayState?.showStrongLinks ?? false
  const setShowStrongLinks = (value: SetStateAction<boolean>) => setPlaySessionState('showStrongLinks', value)
  const [startDrawingOnOpen, setStartDrawingOnOpen] = useState(false)
  const drawingReturn = useRef<{
    gameId: string
    tab: ToolPanelTab
    highlight: boolean
  } | null>(null)
  const [failedChainActions, setFailedChainActions] = useState<readonly DeductionAction[] | null>(null)
  const [chainColorsOpen, setChainColorsOpen] = useState(false)
  const [pencilModifier, setPencilModifier] = useState(false)
  const [dialogResult, setDialogResult] = useState<DialogResult | null>(null)
  const [variantRulesOpen, setVariantRulesOpen] = useState(false)
  const [dialogRule, setDialogRule] = useState<VariantRuleSectionId | null>(null)
  const [pinnedRule, setPinnedRule] = useState<VariantRuleSectionId | null>(null)
  const [desktopSolutionVisible, setDesktopSolutionVisible] = useState(false)
  const [puzzleMenuOpen, setPuzzleMenuOpen] = useState(false)
  const [puzzleDetailsOpen, setPuzzleDetailsOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmCandidatesOpen, setConfirmCandidatesOpen] = useState(false)
  const candidateConfirmationOpener = useRef<HTMLElement | null>(null)
  const [cancelDraftOpen, setCancelDraftOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const pauseShortcut = shortcutLabel(shortcuts.pauseOrSwitchView)
  const pauseKeys = pauseShortcut === 'Space' ? ['Space'] : ['Space', pauseShortcut]
  const [hintState, setHint] = useState<HintState | null>(null)
  const previousPlayGameId = useRef(game.id)
  const resumedOpenHint = useRef<string | null>(null)
  const mobile = useMobileLayout()
  const desktop = !mobile
  const wasMobile = useRef(mobile)
  const [mobileRearranging, setMobileRearranging] = useState(false)
  const rearranging = mobile && mobileRearranging
  const [focusHintRequest, setFocusHintRequest] = useState(0)
  const [focusChainsRequest, setFocusChainsRequest] = useState(0)
  const [completionActionsTarget, setCompletionActionsTarget] = useState<HTMLElement | null>(null)
  const completionActionsOverflowRef = useRef<HTMLElement>(null)
  const completionActionsTargetRef = useMemo(() => mergeRefs(completionActionsOverflowRef, setCompletionActionsTarget), [])
  const solutionStepsOverflowRef = useRef<HTMLElement>(null)
  const setSolutionStepsOverflowRef = useCallback((element: HTMLOListElement | null) => {
    solutionStepsOverflowRef.current = element
  }, [])
  const [singlesCheck, setSinglesCheck] = useState<{
    givens: string
    variant: Game['variant']
    needsMore: boolean
  }>()
  const boardRef = useRef<HTMLDivElement>(null)
  const chainsPanelRef = useRef<HTMLElement>(null)
  const hintColumnRef = useRef<HTMLDivElement>(null)
  const hintBoardFrameRef = useRef<HTMLDivElement>(null)
  const puzzleCardRef = useRef<HTMLElement>(null)
  const hintCardRef = useRef<HTMLElement>(null)
  const hintHeadingRef = useRef<HTMLDivElement>(null)
  const hintToolbarRef = useRef<HTMLDivElement>(null)
  const desktopHintLayout = useMemo(
    () => ({
      column: hintColumnRef,
      puzzle: puzzleCardRef,
      card: hintCardRef,
      heading: hintHeadingRef,
      toolbar: hintToolbarRef,
      size: desktopHintSizeRef,
      onSizeChange: saveDesktopHintSize,
    }),
    [saveDesktopHintSize]
  )
  const puzzleStageRef = useRef<HTMLDivElement>(null)
  const gridAlignmentBoundaryRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const mobileInputTabsRef = useRef<HTMLDivElement>(null)
  const mobileInputToolbarRef = useRef<HTMLDivElement>(null)
  const mobileInputPanelsRef = useRef<HTMLDivElement>(null)
  const mobileDigitsPanelRef = useRef<HTMLDivElement>(null)
  const mobileActiveInputPanelRef = useRef<HTMLDivElement>(null)
  const mobileInputTabsLayoutRefs = useMemo(
    () => ({
      inputTabs: mobileInputTabsRef,
      inputToolbar: mobileInputToolbarRef,
      inputPanels: mobileInputPanelsRef,
      digitsPanel: mobileDigitsPanelRef,
      activeInputPanel: mobileActiveInputPanelRef,
    }),
    []
  )
  const restoreCellFocus = useRef<number | null>(null)
  const puzzleCardLayoutRef = useMemo(() => mergeRefs(puzzleCardRef, playLayoutAnchors?.puzzleCard), [playLayoutAnchors])
  const puzzleGridBorderRef = useRef<HTMLDivElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const puzzleMenuPopupRef = useRef<HTMLDivElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileHintPanelRef = useRef<HTMLDivElement>(null)
  const hintReturnFocus = useRef<HTMLElement | null>(null)
  const coloringDigit = activeHighlightDigit(values, selected, active, selectedDigit)
  const savedSolution = savedPlayState?.solutionView
  const solutionView = !draft && savedSolution?.identity === solutionIdentity ? savedSolution : null
  const solutionPathRevealed = solutionView !== null && !solutionView.hidden
  const { path: cachedSolution, retrySolution } = usePlaySolutionLoader({
    game,
    identity: solutionIdentity,
    revealed: solutionPathRevealed,
  })
  const solutionPath: SolutionPathState | null = solutionPathRevealed ? (cachedSolution ?? { status: 'loading' }) : null
  const solutionHintOpen = !game.paused && (solutionView?.hintOpen ?? false)
  // A loading draft skips solver effects but reserves the regular play UI.
  const presentationDraft = draft && !placeholder
  const candidateMode = advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
  const solved = playground ? isSolved(game) : completed
  const {
    hint,
    visibleHint,
    hintLoading,
    mobileHintOpen,
    hintOpen,
    deduction,
    hintCount,
    hintStage,
    recovery,
    recoveryCell,
    recoveryLocationVisible,
    fullHint,
    hintDifficulty,
    hintCandidates,
    techniqueStartClue,
    locationClue,
    endpointMarks,
    hintBoardPosition,
    hintDiagram,
    availableHintAnnotations,
    playerVisualsSelected,
    hintVisualsActive,
    hintAnnotations,
    hintCopy,
  } = usePlayHintModel({
    game,
    hintState,
    hintRevealed,
    mobile,
    solved,
    draft,
    solutionHintOpen,
    hintPosition,
    cellReferenceStyle,
  })
  const {
    panelAvailable,
    openPuzzlePanels,
    activeToolPanel,
    advancedPanelOpen,
    openInsightTabs,
    activeDesktopTab,
    advancedWorkspace,
    puzzleToolsAvailable,
    mobileToolsAvailable,
    previewing,
    showMobileResults,
    historyDisabled,
    disabled,
    cellColorsDisabled,
    chainsVisible,
    colorsPanelOpen,
    colorsVisible,
  } = usePlayPanelModel({
    game,
    toolPanels,
    placeholder: Boolean(placeholder),
    draft,
    mixedVariant,
    solved,
    showResults,
    showSolvedGrid,
    mobile,
    desktop,
    workspaceMode,
    showRightPanel,
    desktopColorsVisible,
    desktopChainsVisible,
    desktopSolutionVisible,
    solutionPathRevealed,
    solutionPath,
    savedHighlightMode,
    rearranging,
  })
  const {
    rulesButtonRef,
    rulesPanelRef,
    focusRulesAfterDialog,
    insightTabsRef,
    activeMobileInputTabRef,
    focusMobileInput,
    mobileToolsOpener,
    desktopToolsOpener,
    selectToolPanel,
    closeToolPanel,
    showRulesTab,
    focusPinnedRules,
    showPuzzleTool,
    togglePuzzlePanel,
  } = usePlayPanelNavigation({
    host: { mobile, disabled, previewing, advancedWorkspace, showRightPanel },
    panels: {
      toolPanels,
      openPuzzlePanels,
      openInsightTabs,
      activeDesktopTab,
      isAvailable: panelAvailable,
      setOpenPanels: (update) => setPlaySessionState('toolPanels', update),
    },
    controls: { puzzleMenuButtonRef },
    actions: {
      closePuzzleMenu: () => setPuzzleMenuOpen(false),
      closeActions: () => setActionsOpen(false),
      changeHintVisuals: () => changeHintVisuals('player'),
      hideSolutionPath,
      openRightPanel: onOpenRightPanel,
    },
  })
  const draftCages = game.position.draftCages
  const cages = algebraic?.rules ?? draftCages
  const sizedRules = sized?.rules ?? game.position.draftSizedRules
  const sizedName = cages ? ALGEBRAIC_CAGES_NAME : grid ? sizedGridName(grid) : MINI_NAME
  const { markHintVisible, markSolutionVisible } = usePlayRatingEvents({
    puzzle: { id, givens, variant, gridPuzzle: Boolean(grid), completed },
    hint: { deduction, position: hintPosition, previewing },
  })
  const { ratingPending } = usePlayPuzzleRating({
    game,
    givens,
    variant,
    nonUnique: Boolean(nonUnique),
    draft: Boolean(draft),
    completed,
    gridPuzzle: Boolean(grid),
  })
  const { mounted: desktopActionsMounted, exiting: desktopActionsExiting } = usePresence(desktop && !advancedWorkspace && actionsOpen)
  const { mounted: puzzleMenuMounted, exiting: puzzleMenuExiting } = usePresence(puzzleMenuOpen)
  const puzzleControlsBelow = appearance.puzzleControlsPosition === 'bottom' && !draft && !placeholder
  const floatingPuzzleMenu = mobile || puzzleControlsBelow
  const { canPaint, mobileHintPreview, brush, colorMode, eraseMode, highlightMode, pencil, cellBrush, boardPosition, cellPaint } = usePlayInputModel({
    gameId: id,
    game,
    selectedColor,
    colorTarget,
    colorBrush,
    savedInputTool,
    cellColorsDisabled,
    hintAnnotations: Boolean(hintAnnotations),
    mobileHintOpen,
    playerVisualsSelected,
    gridSize,
    onPaint: (stroke) =>
      edit((current) =>
        paintCells(
          current,
          [...stroke.cells].map((cell) => ({ cell, color: stroke.color }))
        )
      ),
    onStrokeStart: () => setSelected([]),
    onStrokeCell: (cell) => {
      setActive(cell)
      setAnchor(cell)
    },
    capturePointer: (pointerId) => boardRef.current?.setPointerCapture(pointerId),
  })
  const colorsActive = brush !== null || colorMode
  const { notes, retry: retryCandidateNotes } = usePlayCandidateNotes({
    game,
    values,
    generateCandidateVariants: advancedModes.generateCandidateVariants,
    draft: Boolean(draft),
    solved,
  })
  const puzzleNotes = notes?.gameId === id && notes.variant === variant && notes.algebraic === algebraic && notes.sized === sized ? notes : undefined
  const currentNotes = puzzleNotes?.values === values && puzzleNotes.eliminations === game.position.eliminations ? puzzleNotes : undefined
  const masks = currentNotes?.masks
  const toolMasks = useMemo(() => candidateToolMasks(masks, values, displayedCandidates, eliminations), [masks, values, displayedCandidates, eliminations])
  const alsHighlight = useAlsHighlight({
    gameId: id,
    enabled: alsHighlightEnabled,
    available: !busy && !disabled && !draft && !solved && canSelectAlsHighlight(highlightedDigitMask, gridSize),
    candidateMasks: toolMasks,
    values,
    selectedDigits: highlightedDigitMask,
    grid: grid ?? CLASSIC_GRID,
    puzzle,
    sizedRules: game.sized?.rules,
    hidden: hintVisualsActive,
  })
  const { active: alsHighlightActive, annotations: alsAnnotations } = alsHighlight
  const autoGenerateCandidates = advancedModes.autoGenerateCandidates && !draft && !solved && needsInitialCandidates(game)
  const hasSingles = useMemo(
    () => !draft && !solved && Boolean(masks && singleFromCandidates(values, displayedCandidates ?? masks, eliminations, puzzle, grid, sized?.rules)),
    [draft, solved, masks, values, displayedCandidates, eliminations, puzzle, grid, sized]
  )
  const needsSinglesCheck = !grid && !generatedWithAuto && difficulty !== 'easy'
  const offerSingles =
    !draft &&
    !solved &&
    (grid || generatedWithAuto || (!ratingPending && needsSinglesCheck && singlesCheck?.givens === givens && singlesCheck.variant === variant && singlesCheck.needsMore))
  const canApplyHintEdit = fullHint && !recovery && Boolean(deduction && hintCandidates) && (!advancedWorkspace || showBottomPanel)
  const chainsPanelOpen = openPuzzlePanels.includes('chains')
  const {
    drawingIntent,
    chainDrawingRequested,
    chainsActive,
    showChainSketches,
    chainMasks,
    missingChainCandidates,
    chainGraph,
    canAnalyzeChains,
    playerHighlightMask,
    startHighlightDigit,
    sketch,
    selectedChainCandidates,
    canApplyChainEdits,
    chainHighlightDigit,
    strongLinkMask,
    strongLinksVisible,
    strongLinks,
    browsingStrongLinks,
  } = usePlayChainModel({
    game,
    puzzle,
    values,
    masks,
    noteMasks: puzzleNotes?.masks,
    notesMatch: Boolean(currentNotes),
    displayedCandidates,
    eliminations,
    toolMasks,
    drawingIntent: savedPlayState?.drawingIntent ?? null,
    highlightedDigitMask,
    coloringDigit,
    savedHighlightMode,
    colorsActive,
    colorMode,
    eraseMode,
    brush,
    draft,
    solved,
    completed,
    disabled,
    chainsPanelOpen,
    startDrawingOnOpen,
    showStrongLinks,
    hintVisualsActive,
  })
  const { colorContinuation, canContinueColorGroup, colorGroupMessage } = usePlayColorModel({
    game,
    puzzle,
    values,
    displayedCandidates,
    toolMasks,
    candidatesLoading: masks === undefined,
    selected,
    active,
    coloringDigit,
    lastColoredCandidate,
    colorTarget,
    colorsVisible,
    cellReferenceStyle,
    gridSize,
  })
  const interactionBlocked = Boolean(modalOpen || puzzleMenuOpen || actionsOpen || dialogResult || resetOpen || confirmCandidatesOpen || variantRulesOpen)
  const {
    candidateBrush,
    paintingCandidates,
    colorPreview,
    canActivateTemporaryPencil,
    temporaryPencil,
    pencilActive,
    mode,
    penOrPencil,
    givenHighlightSelection,
    hasInputSelection,
    cellDrivenHighlight,
    canEditPencil,
    pencilGroup,
    canDragCandidates,
    canSelectCellsByDrag,
    pencilPreviewMask,
    canPreviewCandidates,
    canHighlightCellCandidates,
    canDoubleClickSingle,
  } = usePlayInteractionModel({
    draft,
    disabled,
    solved,
    highlightMode,
    colorMode,
    eraseMode,
    pencil,
    pencilModifier,
    brush,
    cellBrush,
    colorTarget,
    selectedColor,
    cellColorsDisabled,
    hintAnnotations: Boolean(hintAnnotations),
    mobileHintPreview,
    sketchDrawing: sketch.drawing,
    browsingStrongLinks,
    selectedDigit,
    highlightedDigitMask,
    selected,
    values,
    visibleGivens,
    gridSize,
    multi,
    candidateMode,
    doubleClickSingles: advancedModes.doubleClickSingles,
    interactionBlocked,
  })
  const {
    paintCandidateDigits,
    paintCandidateDigit,
    paintSelectedCandidateDigits,
    clearHighlightedDigits,
    clearDigitSelection,
    showDigitHighlights,
    toggleDigitHighlight,
    changeDigitHighlightMatch,
  } = usePlayDigitActions({
    puzzle: { gridSize },
    selection: { selectedDigit, highlightedDigitMask, cellDrivenHighlight, brush },
    capability: { canPaint },
    actions: {
      setDigitHighlight,
      setSelectedDigit,
      setHighlightCandidatePairs,
      setSelected,
      setColorBrush,
      setEraseMode,
      edit,
    },
  })
  const { changeColorTarget, chooseColor, highlightColorDigit, switchColorShade, clearColors, colorCandidate, continueColorGroup } = usePlayColorActions({
    puzzle: { id, position: game.position, selectedCells: selected, coloringDigit },
    continuation: colorContinuation,
    state: { target: colorTarget, selectedColor, brush, candidateBrush, colorMode },
    capability: { canPaint, cellColorsDisabled, sketchDrawing: sketch.drawing },
    actions: {
      setTarget: setColorTarget,
      setSelectedColor,
      setColorBrush,
      setSelectedDigit,
      setEraseMode,
      setSavedHighlightMode,
      setActive,
      setSelected,
      setLastColoredCandidate,
      clearHighlightedDigits,
      setHighlightCandidatePairs,
      leaveChainInput,
      changeHintVisuals,
      edit,
    },
  })
  const {
    setStrongLinkHighlights,
    toggleStrongLinks,
    toggleStrongLinkDigit,
    selectStrongLinkCandidate,
    startStrongLinkChain,
    toggleChainHighlight,
  } = usePlayChainActions({
    model: { sketch, strongLinks },
    state: { showStrongLinks, strongLinkMask, strongLinksVisible, chainHighlightDigit },
    actions: {
      setSelected,
      setColorBrush,
      setColorMode,
      setInputToolOverride,
      setShowStrongLinks,
      setStartDrawingOnOpen,
      showDigitHighlights,
      changeHintVisuals,
    },
  })
  const cellHold = useTouchHold(mobile && canHighlightCellCandidates)
  const cancelCellHold = cellHold.cancel
  const boardGestures = usePlayBoardGestures({
    boardRef,
    puzzle: { game, readWorkingGame, values, gridSize },
    selection: { selected, multi, setActive, setAnchor, setSelected },
    input: { brush: cellBrush, pencilGroup, pencilPreviewMask, candidateMode, selectedDigit, temporaryPencil },
    capability: { mobile, desktop, canPreviewCandidates, canSelectCellsByDrag, canDragCandidates },
    controllers: { cellPaint, cellHold },
    actions: {
      edit,
      highlightCellCandidates,
      cellHighlightMask,
      cellAtPoint: (point) => gridCellAtPoint(boardRef.current, point),
      setPointerFocusedCell,
    },
  })
  const {
    candidatePress,
    suppressCellClick,
    pendingDoubleClickSingle,
    candidatePreviewCell,
    setCandidatePreviewCell,
    startCellDrag,
    continueCellDrag,
    preventControlClickMenu,
    finishControlClick,
    onGridPointerLeave,
    resetClickState,
    reset: resetBoardGestures,
    clearCandidatePaintDrag,
  } = boardGestures
  useLayoutEffect(() => cancelCellHold, [cancelCellHold, hintPosition])
  const puzzleZoom = usePuzzleZoom(mobile && !draft && !disabled && !solved, id, () => {
    cancelCellHold()
    resetClickState()
  })
  const mobileInputResizeRefs = useMemo<MobileInputResizeRefs>(
    () => ({
      puzzle: puzzleCardRef,
      puzzleColumn: hintColumnRef,
      boardViewport: puzzleZoom.viewport,
      boardFrame: hintBoardFrameRef,
      inputTabs: mobileInputTabsRef,
      inputToolbar: mobileInputToolbarRef,
      inputPanels: mobileInputPanelsRef,
      digitsPanel: mobileDigitsPanelRef,
      digitControls: inputRef,
      activeInputPanel: mobileActiveInputPanelRef,
      overflowRegions: [solutionStepsOverflowRef, completionActionsOverflowRef],
    }),
    []
  )
  const { trace, solutionStep, previewPosition, solutionFog, replayedSolutionStep, solutionStepDifficulty, stepDiagram, chainInspection, solutionHintCopy } = usePlaySolutionModel({
    solutionPath,
    selectedStep: solutionView?.step ?? 0,
    previewing,
    variant,
    grid,
    gridSize,
    cellReferenceStyle,
  })

  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  const showElapsedTime = timing.showTimer && !game.timeUntracked && (timing.trackTime || completed)
  usePuzzleTimer(
    game.id,
    !rearranging &&
      timing.trackTime &&
      !game.timeUntracked &&
      !draft &&
      game.started &&
      !game.paused &&
      !completed &&
      !modalOpen &&
      !puzzleMenuOpen &&
      !actionsOpen &&
      !previewing &&
      dialogResult === null &&
      !resetOpen &&
      !confirmCandidatesOpen &&
      !cancelDraftOpen &&
      !variantRulesOpen &&
      !chainColorsOpen,
    (seconds, puzzleId) => {
      roomStore.advanceElapsed(puzzleId, seconds)
    },
    (puzzleId) => roomStore.flushElapsed(puzzleId)
  )

  const puzzleTasks = usePlayPuzzleTasks({ game, readWorkingGame, setBusy })
  const {
    beginPuzzleTask,
    currentTaskGame,
    finishPuzzleTask,
    cancelHintWork: cancelTaskHintWork,
    cancelPendingPuzzleWork: cancelPendingTask,
    hasActiveTask,
  } = puzzleTasks
  const { showHint, showTechniqueHints, resumeHint, moveHint, changeHintDetail } = usePlayHintActions({
    puzzle: { game, values, displayedCandidates, eliminations, position: hintPosition, gridSize },
    state: { hintCount, visibleHint, busy, solved, draft, disabled, mobile },
    host: { advancedWorkspace, showBottomPanel },
    focus: {
      returnTarget: hintReturnFocus,
      actionsButton: actionsMenuButtonRef,
      activeInputTab: activeMobileInputTabRef,
    },
    actions: {
      setHint,
      setHintRevealed,
      clearSavedHint: () => setPlaySessionState('hintView', undefined),
      suspendDrawing: () => {
        if (sketch.drawing) sketch.suspend()
      },
      closePuzzleMenu: () => setPuzzleMenuOpen(false),
      closeActions: () => setActionsOpen(false),
      openHintPanel: onOpenHintPanel,
      focusHint: () => setFocusHintRequest((request) => request + 1),
    },
    tasks: puzzleTasks,
  })
  const hintPositionKey = useMemo(() => JSON.stringify([
    solutionIdentity, hintPosition.values, hintPosition.center, hintPosition.corner,
    hintPosition.eliminations, hintPosition.shades, game.difficulty, game.practiceTechnique,
  ]), [solutionIdentity, hintPosition, game.difficulty, game.practiceTechnique])
  const savedHintView = savedPlayState?.hintView
  useLayoutEffect(() => {
    if (!visibleHint || session || savedPlayState?.puzzleId !== game.id) return
    setPlaySessionState('hintView', {
      position: hintPositionKey,
      source: visibleHint.source,
      index: visibleHint.index,
      stage: visibleHint.stage,
      ...(deduction ? { choice: hintChoiceKey(deduction) } : {}),
      ...(visibleHint.visuals === 'player' ? { visuals: 'player' } : {}),
      ...(visibleHint.reviewingRemoval ? { reviewingRemoval: true } : {}),
    })
  }, [visibleHint, deduction, hintPositionKey, session, savedPlayState?.puzzleId, game.id, setPlaySessionState])
  useEffect(() => {
    if (!savedPlayState?.hintOpen || savedPlayState.puzzleId !== game.id || resumedOpenHint.current === game.id ||
      hintState || busy || hasActiveTask() || disabled || solved || draft || game.paused) return
    resumedOpenHint.current = game.id
    void resumeHint(savedHintView?.position === hintPositionKey ? savedHintView : undefined)
  }, [savedPlayState?.hintOpen, savedPlayState?.puzzleId, savedHintView, hintPositionKey, game.id, game.paused, hintState, busy,
    hasActiveTask, disabled, solved, draft, resumeHint])

  const updateWorkingGame = useCallback(
    (transform: (current: Game) => Game) => {
      if (session) {
        updateSolvedSession(session, transform)
      } else if (!completed) {
        roomStore.update(id, (current) => (isSolved(current) ? current : transform(current)), {
          chainCandidates(current) {
            if (
              !puzzleNotes?.masks ||
              current.grid ||
              current.givens !== givens ||
              current.variant !== variant ||
              (variant && current.position.eliminations !== puzzleNotes.eliminations)
            )
              return null
            const currentValues = valuesOf(current)
            if (currentValues !== puzzleNotes.values) return null
            return candidateToolMasks(puzzleNotes.masks, currentValues, completeCandidateMasks(current), current.position.eliminations)
          },
        })
      }
    },
    [completed, givens, id, puzzleNotes, session, updateSolvedSession, variant]
  )

  const { runCheck, generateCandidates, solveAllSingles } = usePlayPuzzleCommands({
    puzzle: {
      game,
      values,
      givens,
      cages,
      draftCages,
      sizedRules,
      masks,
      displayedCandidates,
      eliminations,
      solved,
      draft: Boolean(draft),
      completed,
      previewing,
      hasSingles,
    },
    state: { busy, disabled, placeholder: Boolean(placeholder) },
    modes: advancedModes,
    tasks: puzzleTasks,
    host: {
      clearResult: () => setDialogResult(null),
      showCheckResult: (result) => setDialogResult({ title: 'Puzzle check', ...result }),
      showActionResult: (result) => setDialogResult({ title: 'Puzzle action', ...result }),
      closeMenus: () => {
        setPuzzleMenuOpen(false)
        setActionsOpen(false)
      },
      closeSolutionPath,
      requestCandidateConfirmation: (source) => {
        const focused = document.activeElement
        candidateConfirmationOpener.current = source ??
          (actionsOpen ? actionsMenuButtonRef.current : puzzleMenuOpen ? puzzleMenuButtonRef.current
            : focused instanceof HTMLElement && focused !== document.body ? focused : null)
        setPuzzleMenuOpen(false)
        setActionsOpen(false)
        setConfirmCandidatesOpen(true)
      },
      updateWorkingGame,
    },
  })
  const { applyCandidateRecovery, applyHint, applyChainEdits } = usePlayHintMutations({
    puzzle: { currentPosition: hintPosition, savedChainSketch: savedGame.chainSketch, completed },
    state: {
      recovery,
      visibleHint,
      deduction,
      hintCandidates,
      canApplyChainEdits,
      chainMasks,
      chainActions: sketch.allActions,
      chainIds: sketch.appliedChainIds,
    },
    modes: advancedModes,
    actions: {
      edit,
      setHint,
      setHintRevealed,
      setFailedChainActions,
      suspendChain: () => sketch.suspend(),
      focusPuzzleActions: () => {
        if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
      },
    },
  })

  const placeNakedSingles = usePlayNakedSingles({
    gameId: id,
    enabled: advancedModes.autoPlaceNakedSingles,
    disabled,
    modalOpen,
    session: Boolean(session),
    solveSinglesVariants: advancedModes.solveSinglesVariants,
    autoRemoveCandidates: advancedModes.autoRemoveCandidates,
    autoRemoveCandidateVariants: advancedModes.autoRemoveCandidateVariants,
    updateWorkingGame,
  })
  const { input, enterFromInput } = usePlayEntryActions({
    puzzle: { values, visibleGivens, gridSize, selected, completed, draft: Boolean(draft) },
    state: {
      mode,
      highlightMode,
      selectedDigit,
      highlightedDigitMask,
      brush,
      colorBrush,
      colorTarget,
      givenHighlightSelection,
      multi,
    },
    modes: advancedModes,
    actions: {
      edit,
      clearHighlightedDigits,
      paintCandidateDigits,
      changeHintVisuals,
      leaveChainInput,
      setSelectedDigit,
      setSelected,
      setHighlightCandidatePairs,
      setSelectedColor,
      setColorBrush,
      setEraseMode,
      placeNakedSingles,
    },
  })

  const { clickCell, doubleClickCell } = usePlayCellActions({
    puzzle: { game, values, visibleGivens, gridSize, completed, draft: Boolean(draft) },
    selection: { selected, anchor, multi, setActive, setAnchor, setSelected },
    input: {
      mode,
      candidateMode,
      colorMode,
      eraseMode,
      highlightMode,
      pencilActive,
      pencilGroup,
      selectedDigit,
      selectedColor,
      highlightedDigitMask,
      digitHighlightMatch: digitHighlight.match,
      colorTarget,
      cellBrush,
    },
    capability: { desktop, canPreviewCandidates, pencilPreviewMask, canDoubleClickSingle },
    gestures: {
      candidatePress,
      suppressCellClick,
      pendingDoubleClickSingle,
      suppressHoldClick: cellHold.suppressClick,
      cellHighlightMask,
    },
    actions: { edit, enterFromInput, highlightCellCandidates, toggleDigitHighlight, setSelectedDigit },
  })

  const cancelPendingPuzzleWork = useCallback(() => {
    if (cancelPendingTask()) {
      resumedOpenHint.current = null
    }
  }, [cancelPendingTask])

  const cancelHintWork = cancelTaskHintWork

  const cancelPuzzleWork = useCallback(() => {
    cancelPendingPuzzleWork()
    cancelHintWork()
  }, [cancelPendingPuzzleWork, cancelHintWork])

  // Pending actions belong to the full board revision, including colors and
  // undo history. Clock ticks and rating metadata do not invalidate them.
  useLayoutEffect(
    () => cancelPendingPuzzleWork,
    [cancelPendingPuzzleWork, id, game.source, givens, variant, grid, algebraic, sized, game.position, game.past, game.future, session]
  )
  // Completed hint pages remain valid after color-only edits. Their worker is
  // retained only while the hint inputs, puzzle rules, and play session match.
  useLayoutEffect(
    () => () => {
      cancelHintWork()
      resumedOpenHint.current = null
      setHint(null)
    },
    [cancelHintWork, id, game.source, givens, variant, grid, algebraic, sized, hintPosition, session]
  )
  useLayoutEffect(() => {
    if (!hintRevealed) cancelHintWork()
  }, [hintRevealed, cancelHintWork])
  useLayoutEffect(() => {
    if (!disabled) return
    cancelPuzzleWork()
  }, [disabled, cancelPuzzleWork])

  function resumePuzzle() {
    if (pausedOnLaunch) onResumeLaunch?.()
    updateWorkingGame((current) => setGamePaused(current, false))
  }

  function togglePause() {
    setActionsOpen(false)
    setPuzzleMenuOpen(false)
    if (game.paused) resumePuzzle()
    else updateWorkingGame((current) => setGamePaused(current, true, { onOpen: true }))
  }

  useEffect(() => {
    if (!timing.trackTime && !draft && !completed && game.started && !game.timeUntracked) {
      roomStore.update(id, (current) => (isSolved(current) ? current : markSolveUntimed(current)))
    }
  }, [completed, draft, game.started, game.timeUntracked, id, timing.trackTime])

  useLayoutEffect(() => {
    puzzleCardRef.current?.closest<HTMLElement>('[data-dock-puzzle-panel]')?.scrollTo(0, 0)
    if (previousPlayGameId.current === game.id) return
    previousPlayGameId.current = game.id
    setPointerFocusedCell(null)
    setDialogResult(null)
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setResetOpen(false)
    setConfirmCandidatesOpen(false)
    setVariantRulesOpen(false)
    setDialogRule(null)
    setPinnedRule(null)
    setChainColorsOpen(false)
    setHint(null)
    hintReturnFocus.current = null
    setStartDrawingOnOpen(false)
    resetClickState()
    clearCandidatePaintDrag()
  }, [clearCandidatePaintDrag, game.id, game.source, resetClickState])

  useGridClickAway(
    boardRef,
    () => {
      if (!rearranging) setSelected([])
    },
    (target) =>
      Boolean(
        target.closest('[data-grid-click-away-exempt], [data-panel-editor], [data-tab-panel-id], [data-puzzle-menu]') ||
        (target.closest('[data-grid-click-away-controls]') &&
          target.closest('button, input, select, textarea, a, [role="separator"]'))
      )
  )

  useAnchoredPopover({
    open: !mobile && !advancedWorkspace && desktopActionsMounted,
    anchorRef: actionsMenuButtonRef,
    popupRef: actionsMenuRef,
    show: true,
    revision: offerSingles,
    observe: () => [playLayoutAnchors?.page.current, playLayoutAnchors?.inputStack.current].filter((element): element is HTMLElement => Boolean(element)),
    place: (button, menu) => {
      // The anchor is measured in viewport pixels, while fixed offsets inherit the page zoom.
      const anchor = button.getBoundingClientRect()
      const scale = Number(getComputedStyle(menu).getPropertyValue('--desktop-layout-scale')) || 1
      const gap = 8
      const right = Math.min(anchor.right, window.innerWidth - gap)
      const left = Math.max(gap, right - menu.offsetWidth * scale)
      const top = Math.min(anchor.top, window.innerHeight - gap)
      menu.style.left = `${left / scale}px`
      menu.style.top = `${top / scale}px`
      menu.style.maxHeight = `${Math.max(0, window.innerHeight - top - gap) / scale}px`
      menu.style.transformOrigin = 'top right'
    },
  })

  useAnchoredPopover({
    open: floatingPuzzleMenu && puzzleMenuMounted,
    anchorRef: puzzleMenuButtonRef,
    popupRef: puzzleMenuPopupRef,
    show: true,
    clearInlineStyle: true,
    revision: puzzleControlsBelow,
    place: (button, menu) => positionScaledRightPopover(button, menu, {
      preferAbove: puzzleControlsBelow,
      heightAdjustment: 2,
    }),
  })

  useEffect(() => {
    if (!actionsOpen || mobile) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!actionsMenuRef.current?.contains(target) && !actionsMenuButtonRef.current?.contains(target)) setActionsOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setActionsOpen(false)
      actionsMenuButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionsOpen, mobile])

  useEffect(() => {
    if (draft || solved || game.paused || !needsSinglesCheck) return
    let current = true
    const engine = createEngineSession()
    const check = variant
      ? solveSingleValues({ variant }, givens, { run: engine.run, variantRules: advancedModes.solveSinglesVariants }).then((board) => board.includes('0'))
      : engine
          .run({
            type: 'rate',
            values: givens,
            techniqueOrder: SINGLE_TECHNIQUES,
          })
          .then(({ status }) => status === 'stalled')
    void check
      .then((needsMore) => {
        if (current) setSinglesCheck({ givens, variant, needsMore })
      })
      .catch(() => {
        /* Leave the action hidden when the starting puzzle cannot be checked. */
      })
      .finally(() => engine.close())
    return () => {
      current = false
      engine.close()
    }
  }, [advancedModes.solveSinglesVariants, draft, game.paused, givens, needsSinglesCheck, solved, variant])

  useEffect(() => {
    if (!autoGenerateCandidates || !masks || disabled) return
    updateWorkingGame((current) =>
      !current.paused && current.givens === givens && valuesOf(current) === values && needsInitialCandidates(current)
        ? replaceCandidates(current, masks, { recordHistory: false })
        : current
    )
  }, [advancedModes.generateCandidateVariants, autoGenerateCandidates, disabled, givens, masks, updateWorkingGame, values])

  useLayoutEffect(() => {
    if (wasMobile.current && advancedWorkspace && openPuzzlePanels.length && !showRightPanel) onOpenRightPanel()
    wasMobile.current = mobile
  }, [mobile, advancedWorkspace, openPuzzlePanels.length, showRightPanel, onOpenRightPanel])

  useLayoutEffect(() => {
    if (!startDrawingOnOpen || !currentNotes) return
    setStartDrawingOnOpen(false)
    if (!savedHighlightMode && chainGraph && !sketch.drawing) sketch.toggle()
  }, [startDrawingOnOpen, currentNotes, savedHighlightMode, chainGraph, sketch])

  useLayoutEffect(() => {
    if (!sketch.drawing) return
    changeHintVisuals('player')
  }, [sketch.drawing])

  useLayoutEffect(() => {
    if (!advancedWorkspace && focusChainsRequest && activeDesktopTab?.id === 'chains') {
      insightTabsRef.current?.querySelector<HTMLButtonElement>('[data-insight-tab="chains"]')?.focus({ preventScroll: true })
    }
  }, [focusChainsRequest])

  useLayoutEffect(() => {
    if (!mobile) return
    const markPointer = () => setInputModality('pointer')
    const markKeyboard = () => setInputModality('keyboard')
    document.addEventListener('pointerdown', markPointer, true)
    document.addEventListener('keydown', markKeyboard, true)
    return () => {
      document.removeEventListener('pointerdown', markPointer, true)
      document.removeEventListener('keydown', markKeyboard, true)
    }
  }, [mobile])

  useEffect(() => {
    if (!mobile) setInputModality('keyboard')
  }, [mobile])

  useLayoutEffect(() => {
    if (paintingCandidates) {
      if (!puzzleMenuOpen && inputModality === 'keyboard' && !document.activeElement?.closest('[data-candidate-paint-focus-keep]')) {
        boardRef.current?.querySelector<HTMLElement>('[data-paint-candidate][tabindex="0"]')?.focus({ preventScroll: true })
      }
    } else if (restoreCellFocus.current !== null) {
      boardRef.current?.querySelector<HTMLElement>(`[data-cell="${restoreCellFocus.current}"]`)?.focus({ preventScroll: true })
      restoreCellFocus.current = null
    }
  }, [paintingCandidates, inputModality])

  useEffect(() => {
    if (!hintOpen) return
    function closeHint(event: KeyboardEvent) {
      if (rearranging || event.defaultPrevented || event.key !== 'Escape' || (event.target instanceof HTMLElement && event.target.closest('dialog[open]'))) return
      if (solutionHintOpen) setSolutionHintOpen(false)
      else setHintRevealed(false)
    }
    window.addEventListener('keydown', closeHint)
    return () => window.removeEventListener('keydown', closeHint)
  }, [hintOpen, solutionHintOpen, rearranging])

  useEffect(() => {
    if (mobileHintOpen) {
      mobileHintPanelRef.current?.querySelector<HTMLButtonElement>('[data-hint-card-close]')?.focus({ preventScroll: true })
    } else if (hintReturnFocus.current) {
      const opener = hintReturnFocus.current
      hintReturnFocus.current = null
      if (!solved) {
        const target = opener.isConnected && !opener.closest('[inert]') ? opener : (activeMobileInputTabRef.current ?? actionsMenuButtonRef.current)
        target?.focus({ preventScroll: true })
      }
    }
  }, [mobileHintOpen, solved])

  useEffect(() => {
    if (!completed) {
      focusGridAfterHistory.current = false
    } else if (showSolvedGrid && (!mobile || focusGridAfterHistory.current)) {
      focusGridAfterHistory.current = false
      boardRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true })
    }
  }, [completed, mobile, showSolvedGrid])

  useEffect(() => {
    if (!puzzleMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!puzzleMenuRef.current?.contains(event.target as Node)) setPuzzleMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape') return
      event.preventDefault()
      setPuzzleMenuOpen(false)
      puzzleMenuButtonRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [puzzleMenuOpen])

  useEffect(() => {
    function releasePencilModifier(event: KeyboardEvent) {
      if ((event.key === 'Control' || event.key === 'Meta') && !event.ctrlKey && !event.metaKey) setPencilModifier(false)
    }
    function clearPencilModifier() {
      setPencilModifier(false)
    }

    window.addEventListener('keyup', releasePencilModifier)
    window.addEventListener('blur', clearPencilModifier)
    return () => {
      window.removeEventListener('keyup', releasePencilModifier)
      window.removeEventListener('blur', clearPencilModifier)
    }
  }, [])

  const { errors } = usePlayErrorModel({
    game,
    errorMode,
    conflicts,
    values,
    draft,
  })

  function edit(
    transform: (current: Game) => Game,
    kind: ActionKind = transform === undo ? 'undo' : transform === redo ? 'redo' : 'edit',
    options?: { technique?: string; actions?: readonly DeductionAction[] }
  ) {
    if (showResults && (transform === undo || transform === redo)) {
      if (historyDisabled) return
      const next = transform(savedGame)
      if (next !== savedGame) {
        focusGridAfterHistory.current = true
        openSolvedGrid(recordAction(savedGame, next, kind))
      }
      return
    }
    if (disabled) return
    updateWorkingGame((current) => recordAction(current, transform(current), kind, options))
  }

  const { saveBookmark, deleteBookmark, restoreBookmark } = usePlayBookmarkActions({
    game,
    savedGame,
    session: Boolean(session),
    showResults,
    edit,
    openSolvedGrid,
    focusGridAfterHistory: () => { focusGridAfterHistory.current = true },
  })

  function rememberInputBeforeDrawing() {
    drawingReturn.current = {
      gameId: id,
      tab: activeToolPanel,
      highlight: savedHighlightMode,
    }
    setInputToolOverride(null)
  }

  function stopDrawingAndFocusGrid() {
    setStartDrawingOnOpen(false)
    sketch.stop()
    const previous = drawingReturn.current
    drawingReturn.current = null
    if (previous?.gameId === id) {
      if (previous.highlight) setSavedHighlightMode(true)
      if (activeToolPanel === 'chains') selectToolPanel(previous.tab)
    }
    requestAnimationFrame(() => boardRef.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus({ preventScroll: true }))
  }

  function highlightCellCandidates(mask: number) {
    resetClickState()
    setSelected([])
    showDigitHighlights(mask, 'any')
  }

  function cellHighlightMask(index: number) {
    return canHighlightCellCandidates && values[index] === '0' ? center[index] | corner[index] : 0
  }

  function leaveChainInput(switchMobileToDigits = true) {
    if (chainDrawingRequested || startDrawingOnOpen) sketch.suspend()
    if (showStrongLinks) setShowStrongLinks(false)
    setStartDrawingOnOpen(false)
    drawingReturn.current = null
    if (switchMobileToDigits && mobile && activeToolPanel === 'chains') selectToolPanel('digits')
  }

  function toggleHighlightMode() {
    const enable = sketch.drawing || browsingStrongLinks || !highlightMode
    leaveChainInput()
    setColorBrush(null)
    setPencilModifier(false)
    setInputToolOverride(enable ? 'highlight' : null)
  }

  function switchPenPencil(pencil: boolean) {
    leaveChainInput()
    setColorBrush(null)
    setPencilModifier(false)
    selectInputToolPencil(pencil)
  }

  function returnToPenPencilMode() {
    if (mobile && (colorsVisible || chainsVisible)) selectToolPanel('digits')
    switchPenPencil(savedPencil)
  }

  function togglePenPencilMode() {
    if (mobile && colorsVisible) selectToolPanel('digits')
    switchPenPencil(togglePencilMode(pencil))
  }

  function toggleChainDrawing() {
    if (sketch.drawing || startDrawingOnOpen) {
      stopDrawingAndFocusGrid()
      return
    }
    setColorBrush(null)
    setShowStrongLinks(false)
    rememberInputBeforeDrawing()
    setStartDrawingOnOpen(true)
  }

  usePauseHotkey({
    enabled: pauseShortcutsEnabled,
    draft,
    placeholder: Boolean(placeholder),
    completed,
    clearPointerFocus: setPointerFocusedCell,
    toggleSolvedView,
    togglePause,
  })

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Shift') setCandidatePreviewCell(null)
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ' || isGridDirectionKey(event.key)) setPointerFocusedCell(null)
      const target = event.target
      const key = event.key.toLowerCase()
      const shortcut = event.ctrlKey || event.metaKey
      const shortcutDigit = shortcut && !event.shiftKey && !event.isComposing ? Number(/^[1-9]$/.test(key) ? key : /^Digit([1-9])$/.exec(event.code)?.[1]) || null : null
      const shiftDigit = event.isComposing ? null : highlightedDigitShortcut(event)
      const solvingDigitShortcuts = !draft && !disabled && !solved
      const digitShortcut = shortcutDigit ?? shiftDigit
      const drawLinksShortcut = !event.isComposing && shortcutMatches(event, shortcuts, 'chainDrawing')
      const applyEditsShortcut = !event.isComposing && shortcutMatches(event, shortcuts, 'applyEdits')
      const checkboxShortcut =
        target instanceof HTMLInputElement &&
        target.type === 'checkbox' &&
        (drawLinksShortcut || applyEditsShortcut || ((strongLinksVisible || (solvingDigitShortcuts && !sketch.drawing)) && digitShortcut !== null))
      if (
        event.defaultPrevented ||
        rearranging ||
        modalOpen ||
        puzzleMenuOpen ||
        actionsOpen ||
        chainColorsOpen ||
        dialogResult !== null ||
        resetOpen ||
        confirmCandidatesOpen ||
        cancelDraftOpen ||
        event.altKey ||
        (target instanceof HTMLElement && !checkboxShortcut && (target.isContentEditable || target.closest('input, select, textarea, a')))
      )
        return
      if (
        pauseShortcutsEnabled &&
        !draft &&
        !placeholder &&
        !previewing &&
        !variantRulesOpen &&
        event.key !== ' ' &&
        !event.isComposing &&
        shortcutMatches(event, shortcuts, 'pauseOrSwitchView') &&
        !(target instanceof HTMLElement && target.closest('dialog[open]'))
      ) {
        event.preventDefault()
        if (!event.repeat) {
          if (completed) toggleSolvedView()
          else togglePause()
        }
        return
      }
      const historyShortcut = shortcut && (key === 'z' || key === 'y')
      const redoShortcut = key === 'y' || event.shiftKey
      if (showResults && historyShortcut && !historyDisabled && !variantRulesOpen) {
        event.preventDefault()
        edit(redoShortcut ? redo : undo)
        return
      }
      if (game.paused || (solved && !showSolvedGrid)) return
      if (!draft && shortcutMatches(event, shortcuts, 'highlightMode')) {
        event.preventDefault()
        if (!event.repeat) toggleHighlightMode()
        return
      }
      const cancelTool = key === 'escape' && !variantRulesOpen && !(target instanceof HTMLElement && target.closest('dialog[open], [popover]:popover-open'))
      if (cancelTool && (sketch.drawing || startDrawingOnOpen)) {
        event.preventDefault()
        if (!event.repeat) {
          stopDrawingAndFocusGrid()
          returnToPenPencilMode()
        }
        return
      }
      if (drawLinksShortcut && !variantRulesOpen && panelAvailable('chains') && (!disabled || previewing)) {
        event.preventDefault()
        if (event.repeat) return
        if (sketch.drawing || startDrawingOnOpen) stopDrawingAndFocusGrid()
        else {
          enterChainsMode()
          showChains()
        }
        return
      }
      if (previewing) return
      if (historyShortcut && (sketch.drawing || browsingStrongLinks || (chainsVisible && target instanceof Node && chainsPanelRef.current?.contains(target)))) {
        event.preventDefault()
        if (redoShortcut) sketch.redo()
        else if (sketch.canUndo) sketch.undo()
        return
      }
      if (!draft && shortcutMatches(event, shortcuts, 'digitMode')) {
        event.preventDefault()
        if (!event.repeat) switchPenPencil(false)
        return
      }
      if (!draft && shortcutMatches(event, shortcuts, 'pencilMode')) {
        event.preventDefault()
        if (!event.repeat) togglePenPencilMode()
        return
      }
      if (applyEditsShortcut && !variantRulesOpen && !draft && !disabled && !solved && (canApplyHintEdit || canApplyChainEdits)) {
        event.preventDefault()
        if (event.repeat) return
        if (canApplyHintEdit) applyHint()
        else applyChainEdits()
        return
      }
      if (!draft && !disabled && !solved && (mobile || !advancedWorkspace) && shortcutMatches(event, shortcuts, 'actions')) {
        event.preventDefault()
        setPuzzleMenuOpen(false)
        setActionsOpen(true)
        return
      }
      if (event.key === 'Control' || event.key === 'Meta') {
        if (canActivateTemporaryPencil) setPencilModifier(true)
        return
      }
      const cycleDigit =
        key === '`' &&
        !shortcut &&
        !event.shiftKey &&
        !event.isComposing &&
        solvingDigitShortcuts &&
        !variantRulesOpen &&
        !(target instanceof HTMLElement && target.closest('dialog[open]'))
      let highlightedDigit = shiftDigit ?? functionKeyDigit(event.key)
      if (cycleDigit) {
        event.preventDefault()
        if (event.repeat) return
        const current = strongLinksVisible
          ? onlyCandidate(strongLinkMask)
          : sketch.drawing
            ? chainHighlightDigit
            : (selectedDigit ?? onlyCandidate(highlightedDigitMask) ?? coloringDigit)
        highlightedDigit = nextIncompleteDigit(values, current, gridSize)
        if (highlightedDigit === null) return
      }
      if (sketch.drawing || browsingStrongLinks) {
        if (cancelTool && browsingStrongLinks) {
          event.preventDefault()
          if (!event.repeat) returnToPenPencilMode()
        } else if (strongLinksVisible && digitShortcut) {
          event.preventDefault()
          if (!event.repeat) toggleStrongLinkDigit(digitShortcut)
        } else if (!shortcut && highlightedDigit) {
          event.preventDefault()
          if (strongLinksVisible) setStrongLinkHighlights(1 << (highlightedDigit - 1))
          else sketch.setHighlightedDigit(highlightedDigit)
        } else if (!shortcut && (/^[0-9]$/.test(key) || key === 'delete' || key === 'backspace')) {
          event.preventDefault()
          if (!event.repeat) toggleChainHighlight(Number(key) || 0)
        }
        return
      }
      if (cancelTool && !cellColorsDisabled && (brush !== null || colorMode || sketch.drawing || browsingStrongLinks || startDrawingOnOpen)) {
        event.preventDefault()
        if (event.repeat) return
        const cell = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-paint-candidate]')?.closest<HTMLElement>('[data-cell]') : null
        if (cell) {
          const index = Number(cell.dataset.cell)
          restoreCellFocus.current = index
          setActive(index)
        }
        if (!cell && mobile && colorsVisible) focusMobileInput.current = true
        returnToPenPencilMode()
      } else if (!draft && !event.isComposing && shortcutMatches(event, shortcuts, 'switchColorShade')) {
        event.preventDefault()
        if (!event.repeat) switchColorShade()
      } else if (historyShortcut) {
        event.preventDefault()
        edit(redoShortcut ? redo : undo)
      } else if (solvingDigitShortcuts && digitShortcut) {
        if (digitShortcut > gridSize) return
        event.preventDefault()
        if (event.repeat) return
        if (shortcutDigit && hasInputSelection && brush === null) input(shortcutDigit, candidateMode)
        else toggleDigitHighlight(digitShortcut, shortcutDigit ? 'all' : 'any')
      } else if (!draft && !shortcut && highlightedDigit) {
        event.preventDefault()
        if (cellDrivenHighlight) setSelected([])
        clearHighlightedDigits()
        setHighlightCandidatePairs(false)
        setSelectedDigit(highlightedDigit)
      } else if (!draft && brush === null && !colorMode && shortcut && !event.shiftKey && !event.isComposing) {
        if (!shortcutDigit || shortcutDigit > gridSize) return
        const cells =
          !selected.length && target instanceof HTMLButtonElement && target.matches('[role="gridcell"][data-cell]') && boardRef.current?.contains(target)
            ? [Number(target.dataset.cell)]
            : selected
        if (!cells.some((cell) => values[cell] === '0')) return
        event.preventDefault()
        if (!event.repeat) input(shortcutDigit, candidateMode, cells)
      } else if (!shortcut && isGridDirectionKey(event.key) && (target === document.body || boardRef.current?.contains(target as Node))) {
        event.preventDefault()
        const next = gridCellInDirection(active, gridSize, event.key)
        if (next === undefined) return
        setActive(next)
        const givenDigit = givenDigitAt(visibleGivens, next)
        if (!highlightedDigitMask) {
          if (givenDigit) setSelectedDigit(givenDigit)
          else if (!highlightMode) setSelectedDigit(null)
        }
        if (event.shiftKey) setSelected(rectangleSelection(anchor, next, gridSize))
        else {
          setAnchor(next)
          setSelected([next])
        }
        focusGridCell(boardRef.current, next, true)
      } else if (!shortcut && /^[1-9]$/.test(key)) {
        event.preventDefault()
        if ((brush !== null || colorMode || eraseMode) && event.repeat) return
        const digit = Number(key)
        if (brush !== null || colorMode || eraseMode) {
          highlightColorDigit(digit === coloringDigit ? null : digit)
        } else if (solvingDigitShortcuts && selected.length) {
          input(digit, 'value', selected, true)
        } else input(digit)
      } else if (!shortcut && (key === 'delete' || key === 'backspace' || key === '0')) {
        event.preventDefault()
        if (colorTarget === 'candidate' && (paintingCandidates || colorMode) && event.repeat) return
        if (brush !== null && !colorMode) chooseColor(0)
        else input(0)
      } else if (
        dispatchCommandShortcut(
          event,
          shortcuts,
          [generateCandidatesCommand, solveSinglesCommand],
          document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
        )
      ) {
        return
      } else if (!draft && shortcutMatches(event, shortcuts, 'colorMode') && (desktop || mobileToolsAvailable)) {
        event.preventDefault()
        if (!event.repeat) activateColorsShortcut()
      } else if (!draft && shortcutMatches(event, shortcuts, 'eraseMode')) {
        event.preventDefault()
        setColorBrush(null)
        setSelected([])
        toggleInputToolOverride('erase')
      }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      window.removeEventListener('keydown', keydown)
    }
  })

  const checkCommand: UiCommand<'check'> = pinnedCommand('check', !busy && !hasActiveTask() && !game.paused && !placeholder, () => {
    void runCheck()
  })

  const generateCandidatesCommand: UiCommand<'candidates'> = {
    ...pinnedCommand('candidates', !busy && !solved && !disabled && !draft && !placeholder, (source) => {
      void generateCandidates(false, source)
    }),
    shortcut: shortcutLabel(shortcuts.generateCandidates),
    shortcutId: 'generateCandidates',
  }
  const highlightAlsCommand: UiCommand<'highlight-als'> = {
    id: 'highlight-als',
    label: 'Highlight ALS',
    available: alsHighlight.available,
    pressed: alsHighlightActive,
    run: () => {
      alsHighlight.toggle()
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
    },
  }

  const solveSinglesCommand: UiCommand<'singles'> = {
    ...pinnedCommand('singles', !busy && !hasActiveTask() && hasSingles && !solved && !draft && !disabled, () => {
      void solveAllSingles()
    }),
    shortcut: shortcutLabel(shortcuts.solveSingles),
    shortcutId: 'solveSingles',
  }

  const hintCommand: UiCommand<'hint'> = pinnedCommand('hint', !busy && !hasActiveTask() && !solved && !draft && !disabled, () => {
    void showHint()
  })
  const highlightCandidatePairsCommand: UiCommand<'candidate-pairs'> = {
    id: 'candidate-pairs',
    label: 'Highlight {x,y} cells',
    available: !solved,
    pressed: highlightCandidatePairs,
    run: () => {
      if (sketch.drawing) sketch.setHighlightedDigit(null)
      else setSelectedDigit(null)
      clearHighlightedDigits()
      setHighlightCandidatePairs((current) => !current)
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
    },
  }

  function changeHintVisuals(visuals: 'hint' | 'player') {
    if (visuals === 'hint' && sketch.drawing) sketch.suspend()
    setHint((current) => (current && current.visuals !== visuals ? { ...current, visuals } : current))
  }

  function showSolutionPath(force = false) {
    if (game.paused || draft || busy) return
    if (savedHighlightMode) setSavedHighlightMode(false)
    setPuzzleMenuOpen(false)
    if (desktop) selectToolPanel('solution')
    setHintRevealed(false)
    setActionsOpen(false)
    if (!solutionPathRevealed || force) {
      setPlaySessionState('solutionView', {
        identity: solutionIdentity,
        step: force ? 0 : (solutionView?.step ?? 0),
        hintOpen: false,
      })
    }
    if (force) retrySolution()
  }

  function setSolutionHintOpen(hintOpen: boolean) {
    setPlaySessionState('solutionView', (current) => (current?.identity === solutionIdentity && current.hintOpen !== hintOpen ? { ...current, hintOpen } : current))
  }

  function hideSolutionPath() {
    setPlaySessionState('solutionView', (current) => (current?.identity === solutionIdentity && !current.hidden ? { ...current, hintOpen: false, hidden: true } : current))
  }

  function closeSolutionPath() {
    setPuzzleMenuOpen(false)
    closeToolPanel('solution')
  }

  function selectSolutionStep(index: number) {
    if (game.paused) return
    if (savedHighlightMode) setSavedHighlightMode(false)
    setPlaySessionState('solutionView', {
      identity: solutionIdentity,
      step: index,
      hintOpen: true,
    })
    setFocusHintRequest((request) => request + 1)
    if (isChainStep(trace?.steps[index])) setFocusChainsRequest((request) => request + 1)
  }

  useEffect(() => {
    actionsRef.current = placeholder || previewing || (solved && !showSolvedGrid) ? null : { check: () => checkCommand.run() }
    return () => {
      actionsRef.current = null
    }
  })

  const solutionHintPanel = previewing && solutionHintOpen && solutionHintCopy
  const hintTechnique = solutionHintPanel ? replayedSolutionStep?.deduction.technique : visibleHint && !recovery ? deduction?.technique : undefined
  const hintLesson = hintTechnique ? lessonRoutes.get(hintTechnique) : undefined
  const applyHintAction = solutionHintPanel
    ? undefined
    : recovery
      ? { label: 'Restore candidate', onClick: applyCandidateRecovery }
      : deduction && hintCandidates
        ? {
            label: 'Apply hint',
            onClick: applyHint,
            shortcut: shortcutLabel(shortcuts.applyEdits),
          }
        : undefined
  const closeHint = () => (solutionHintPanel ? setSolutionHintOpen(false) : setHintRevealed(false))
  const toggleMobileHintPinned = () => {
    setMobileHintPinned(current => !current)
    window.requestAnimationFrame(() => {
      mobileHintPanelRef.current?.querySelector<HTMLButtonElement>('[data-hint-card-pin]')?.focus({ preventScroll: true })
    })
  }
  const explanation = solutionHintPanel ? stepDiagram : hintDiagram
  const revealedDeduction = solutionHintPanel ? replayedSolutionStep?.deduction : fullHint && !recovery ? deduction : undefined
  const recoveryExplanation = !solutionHintPanel && recovery && fullHint ? explainCandidateRecovery(game, recovery, cellReferenceStyle) : undefined
  const hintPanel = (solutionHintPanel || visibleHint || hintLoading || mobileHintOpen) && (
    <PlayHint mobile={mobile} collapseOnExit={advancedWorkspace} panelRef={mobile ? mobileHintPanelRef : undefined}>
      <HintCard
        hint={solutionHintPanel ? solutionHintCopy : hintLoading ? { title: 'Finding a hint…', text: '' } : hintCopy}
        layoutAnchors={desktop ? { card: hintCardRef, heading: hintHeadingRef, toolbar: hintToolbarRef } : undefined}
        lesson={hintLesson && hintTechnique ? { id: hintTechnique, title: hintLesson.title } : undefined}
        removals={
          revealedDeduction
            ? describeHintRemovals(revealedDeduction, {
                difficulty: techniqueDifficulties[revealedDeduction.technique],
                cellReferenceStyle,
                gridSize,
              })
            : undefined
        }
        onClose={closeHint}
        pinned={mobile && mobileHintPinned}
        onTogglePinned={mobile ? toggleMobileHintPinned : undefined}
        onShown={!solutionHintPanel && deduction ? markHintVisible : undefined}
        visuals={
          availableHintAnnotations && !disabled && !solved
            ? {
                visible: !playerVisualsSelected,
                onToggle: () => changeHintVisuals(playerVisualsSelected ? 'hint' : 'player'),
              }
            : undefined
        }
        action={applyHintAction}
        detailNavigation={
          applyHintAction
            ? {
                first: hintStage === 'technique',
                last: fullHint,
                onMove: changeHintDetail,
              }
            : undefined
        }
        secondaryAction={
          !solutionHintPanel && recovery?.movesAgo
            ? {
                label: 'Review move',
                reserved: !recoveryLocationVisible,
                expanded: visibleHint?.reviewingRemoval ?? false,
                onClick: () =>
                  setHint((current) =>
                    current?.recovery
                      ? {
                          ...current,
                          reviewingRemoval: !current.reviewingRemoval,
                        }
                      : current
                  ),
              }
            : undefined
        }
        explanation={
          recoveryExplanation ?? (explanation?.description ? [explanation.description, ...(explanation.reasonSteps ? [] : [explanation.reason])].filter(Boolean) : undefined)
        }
        explanationSteps={recoveryExplanation ? undefined : explanation?.reasonSteps}
        collapseExplanation={Boolean(solutionHintPanel)}
        trace={solutionHintPanel ? (replayedSolutionStep && 'variant' in replayedSolutionStep.deduction.evidence ? stepDiagram?.trace : undefined) : hintDiagram?.trace}
        navigation={!solutionHintPanel && visibleHint && hintCount > 0 ? { index: visibleHint.index, count: hintCount, onMove: moveHint } : undefined}
      />
    </PlayHint>
  )
  const cellColorsPanel = (
    <CellColorPalette
      target={colorTarget}
      onTarget={changeColorTarget}
      brush={brush}
      hasColors={
        colorTarget === 'cell'
          ? Boolean(game.position.importedCellColors) || game.position.colors.some(Boolean)
          : Boolean(game.position.candidateColors || game.position.importedCandidateColors)
      }
      canContinueGroup={canContinueColorGroup}
      groupMessage={colorGroupMessage}
      onContinueGroup={continueColorGroup}
      disabled={cellColorsDisabled}
      onColor={chooseColor}
      onSwitchShade={switchColorShade}
      onStop={() => {
        setColorBrush(null)
        setColorMode(false)
      }}
      onClear={clearColors}
    />
  )
  const chainUnavailable =
    chainGraph && canAnalyzeChains
      ? undefined
      : previewing
        ? 'Select a chain step in Solution.'
        : draft || solved
          ? 'Chains are available while solving.'
          : game.paused
            ? 'Resume the puzzle to mark chains.'
            : missingChainCandidates
              ? 'Restore candidates in empty cells before you mark chains.'
              : currentNotes?.failed
                ? 'The candidates did not load.'
                : currentNotes?.masks === null
                  ? 'Resolve the grid conflicts to draw links.'
                  : 'Loading candidates…'
  const chainsPanel = grid ? (
    <p className="analysis-empty">Open Techniques to explore deductions on this grid.</p>
  ) : (
    <ChainsPanel
      panelRef={chainsPanelRef}
      sketch={sketch}
      onToggleDrawing={toggleChainDrawing}
      onApply={applyChainEdits}
      applyFailed={failedChainActions === sketch.allActions}
      onChooseColors={() => setChainColorsOpen(true)}
      shortcuts={shortcuts}
      unavailable={chainUnavailable}
      onRetryCandidates={currentNotes?.failed ? retryCandidateNotes : undefined}
      inspection={chainInspection}
      eliminations={{
        shown: sketch.showEliminations,
        toggle: sketch.toggleEliminations,
      }}
      strongLinks={{
        shown: showStrongLinks,
        hasHighlights: strongLinkMask !== 0,
        count: strongLinks.count,
        toggle: toggleStrongLinks,
      }}
    />
  )
  const completionPanel =
    showResults || (mobile && showSolvedGrid) ? (
      <CompletedPuzzle
        game={savedGame}
        games={games}
        catchUpPuzzle={catchUpPuzzle}
        preferredDifficulty={preferredDifficulty}
        ratingPending={ratingPending}
        shortcutEnabled={showResults && !rearranging && !modalOpen && !puzzleMenuOpen && !actionsOpen && !cancelDraftOpen && !variantRulesOpen}
        actionsTarget={mobile ? completionActionsTarget : null}
        layoutBoundaryRef={gridAlignmentBoundaryRef}
        showGuides={appearance.showGuides}
        cellReferenceStyle={cellReferenceStyle}
        onResumePuzzle={onSelectPuzzle}
        onChooseDifficulty={() => onNewPuzzle('difficulty')}
        onChooseVariant={() => onNewPuzzle()}
      />
    ) : null
  const solveSinglesAction = (
    <ActionMenuItem command={solveSinglesCommand} Icon={CheckCheck} showShortcut />
  )
  function showColors() {
    showPuzzleTool('colors')
  }

  function activateColorsShortcut() {
    if (!panelAvailable('colors') || disabled) return
    const coloringActive = colorMode || colorBrush !== null
    const paletteOpen = colorsPanelOpen
    showColors()
    if (coloringActive) {
      changeColorTarget(colorTarget === 'cell' ? 'candidate' : 'cell')
      return
    }
    leaveChainInput(false)
    setInputToolOverride(null)
    if (selectedColor === null || selectedColor <= 0) {
      if (paletteOpen) changeColorTarget(colorTarget === 'cell' ? 'candidate' : 'cell')
      return
    }
    changeHintVisuals('player')
    if (mobile) {
      setInputToolOverride(null)
      setColorBrush(selectedColor)
    } else {
      setColorBrush(null)
      setInputToolOverride('color')
    }
  }

  function enterColorsMode() {
    if (!panelAvailable('colors') || disabled) return
    leaveChainInput(false)
    if (!colorMode && colorBrush === null) {
      changeHintVisuals('player')
      if (mobile && selectedColor !== null && selectedColor > 0) setColorBrush(selectedColor)
      else {
        setColorBrush(null)
      }
      setInputToolOverride(mobile && selectedColor !== null && selectedColor > 0 ? null : 'color')
    }
  }

  function enterChainsMode() {
    if (grid || !panelAvailable('chains')) return
    setColorBrush(null)
    setInputToolOverride(null)
    setShowStrongLinks(false)
    changeHintVisuals('player')
    setStartDrawingOnOpen(true)
  }

  function showChains() {
    if (grid) return
    if (advancedWorkspace && !previewing) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
    showPuzzleTool('chains')
    if (desktop && !advancedWorkspace) setFocusChainsRequest((request) => request + 1)
  }

  const panelToggles = PLAY_TOOL_TABS.filter(({ id }) => openPuzzlePanels.includes(id) || panelAvailable(id)).map(({ id, label, Icon }) => (
    <button key={id} type="button" disabled={rearranging || game.paused} aria-pressed={openPuzzlePanels.includes(id)} onClick={() => togglePuzzlePanel(id)}>
      <Icon size={17} aria-hidden="true" /> {label}
    </button>
  ))
  const hintMenuAction = !draft && !solved && (
    <ActionMenuItem command={hintCommand} Icon={Lightbulb} />
  )
  const commonSolvingMenuItems = (
    <>
      <ActionMenuItem command={generateCandidatesCommand} Icon={PencilLine} showShortcut />
      {alsHighlightEnabled && (
        <ActionMenuItem command={highlightAlsCommand} Icon={ScanSearch} />
      )}
      <ActionMenuItem command={highlightCandidatePairsCommand} Icon={Braces} />
      {hintMenuAction}
    </>
  )
  const syncStatus = useSyncExternalStore(
    deviceSync.subscribePuzzle,
    () => deviceSync.puzzleStatus(game.id),
    () => 'none'
  )
  const puzzleDetailsCommand: UiCommand<'puzzle-details'> = {
    id: 'puzzle-details',
    label: 'Puzzle details',
    available: !grid && !advancedWorkspace && !draft && !placeholder,
    run: () => {
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
      setPuzzleDetailsOpen(true)
    },
  }
  const sharePuzzleCommand: UiCommand<'share-puzzle'> = {
    id: 'share-puzzle',
    label: 'Share puzzle',
    available: true,
    run: () => {
      setPuzzleMenuOpen(false)
      onShare()
    },
  }
  const exportPuzzleCommand: UiCommand<'export-puzzle'> = {
    id: 'export-puzzle',
    label: 'Export puzzle',
    available: true,
    run: () => {
      setPuzzleMenuOpen(false)
      onExport?.()
    },
  }
  const syncPuzzleCommand: UiCommand<'sync-puzzle'> = {
    id: 'sync-puzzle',
    label: 'Sync now',
    available: storageAvailable && syncStatus !== 'saving' && syncStatus !== 'offline' && syncStatus !== 'offline-clean',
    run: () => { void deviceSync.syncPuzzle(game.id) },
  }
  const clearImportedDrawingsCommand: UiCommand<'clear-imported-drawings'> = {
    id: 'clear-imported-drawings',
    label: 'Clear imported drawings',
    available: !disabled,
    run: () => {
      setPuzzleMenuOpen(false)
      edit(clearImportedDrawings)
    },
  }
  const resetPuzzleCommand: UiCommand<'reset-puzzle'> = {
    id: 'reset-puzzle',
    label: 'Reset puzzle',
    available: true,
    run: () => {
      setPuzzleMenuOpen(false)
      setResetOpen(true)
    },
  }
  const stopPlayingCommand: UiCommand<'stop-playing'> = {
    id: 'stop-playing',
    label: 'Stop playing',
    available: !busy,
    run: () => {
      setPuzzleMenuOpen(false)
      onStopPlaying()
    },
  }
  const showPuzzleSync = syncStatus !== 'none' && !placeholder && !draft
  const syncWarning =
    showPuzzleSync &&
    storageAvailable &&
    (syncStatus === 'offline' ? 'Offline' : syncStatus === 'failed' ? 'Couldn’t sync. Changes saved on this device.' : '')
  const syncMenuStatus = !storageAvailable
    ? 'Local storage is unavailable.'
    : {
        none: '',
        checking: 'Checking cloud save…',
        pending: 'Cloud save pending.',
        saving: 'Saving to the cloud…',
        saved: '',
        offline: 'Offline',
        'offline-clean': 'Offline. Connect to sync this puzzle.',
        failed: 'Couldn’t sync. Changes saved on this device.',
        'check-failed': 'Couldn’t verify the cloud save.',
        conflict: 'Your changes are in a conflict copy.',
      }[syncStatus]
  const puzzleOptionItems = (
    <>
      {hintMenuAction}
      <ActionMenuItem command={checkCommand} Icon={Check} />
      {!grid && !advancedWorkspace && !draft && !placeholder && (
        <ActionMenuItem command={puzzleDetailsCommand} Icon={Info} />
      )}
      {advancedWorkspace && generatedWithAuto && offerSingles && solveSinglesAction}
      <ActionMenuItem command={sharePuzzleCommand} Icon={Share2} />
      {!draft && (
        <ActionMenuItem command={exportPuzzleCommand} Icon={Clipboard} />
      )}
      {showPuzzleSync && (
        <>
          <ActionMenuItem command={syncPuzzleCommand} Icon={CloudUpload} />
          {syncMenuStatus && (
            <p className="puzzle-sync-menu-status" role="status">
              {syncMenuStatus}
            </p>
          )}
        </>
      )}
      {game.position.importedDrawings && (
        <ActionMenuItem command={clearImportedDrawingsCommand} Icon={Eraser} />
      )}
      <ActionMenuItem command={resetPuzzleCommand} Icon={RotateCcw} />
      {!completed && (
        <>
          <div className="app-menu-separator" role="separator" />
          <ActionMenuItem command={stopPlayingCommand} Icon={LogOut} />
        </>
      )}
    </>
  )
  const mobileActionsMenu = (
    <div className="app-menu puzzle-menu" id="mobile-actions-menu">
      {offerSingles && solveSinglesAction}
      {commonSolvingMenuItems}
    </div>
  )
  const desktopActionsMenu = desktopActionsMounted && (
    <div
      ref={actionsMenuRef}
      className="app-menu puzzle-menu desktop-actions-menu"
      id="input-actions-menu"
      popover="manual"
      data-grid-click-away-controls
      data-presence={desktopActionsExiting ? 'exit' : 'open'}
      aria-hidden={desktopActionsExiting || undefined}
      inert={desktopActionsExiting || undefined}
    >
      {commonSolvingMenuItems}
      {offerSingles && (
        <>
          <div className="app-menu-separator" role="separator" />
          {solveSinglesAction}
        </>
      )}
    </div>
  )
  const puzzleMenu = puzzleMenuMounted && (
    <div
      ref={puzzleMenuPopupRef}
      className={`app-menu puzzle-menu${floatingPuzzleMenu ? ' floating-puzzle-menu' : ''}`}
      id="puzzle-menu"
      popover={floatingPuzzleMenu ? 'manual' : undefined}
      data-presence={puzzleMenuExiting ? 'exit' : 'open'}
      aria-hidden={puzzleMenuExiting || undefined}
      inert={puzzleMenuExiting || undefined}
      onClickCapture={() => puzzleMenuButtonRef.current?.focus({ preventScroll: true })}
    >
      {puzzleOptionItems}
    </div>
  )
  const canSelectCell = !game.paused && !showMobileResults && !rearranging
  // Input mode is independent of the visible tool tab and never falls into a "no mode" state.
  // Paused/preview/finished puzzles retain their mode without showing editable controls.
  const gridInputMode = puzzleInputMode({
    drawingLinks: sketch.drawing,
    browsingStrongLinks,
    erasing: eraseMode,
    coloring: colorMode || brush !== null,
    highlighting: highlightMode,
    penciling: pencilActive,
  })
  const badgeMode = disabled || showResults || draft || (solved && !showSolvedGrid) ? undefined : gridInputMode
  const modeBadge = badgeMode && (
    <ModeBadge
      mode={badgeMode}
      descriptionId={modeBadgeId}
      cardRef={puzzleGridBorderRef}
      boundaryLabel="puzzle edge"
      position={modeBadgePosition}
      onPosition={setModeBadgePosition}
      onActivate={() => {
        if (badgeMode === 'chain') {
          if (sketch.drawing) stopDrawingAndFocusGrid()
          else if (browsingStrongLinks) setShowStrongLinks(false)
          return
        }
        leaveChainInput()
        setColorBrush(null)
        setPencilModifier(false)
        if (badgeMode === 'pen') selectInputToolPencil(false)
        else setInputToolOverride(badgeMode === 'pencil' ? 'highlight' : null)
      }}
    />
  )
  const showPlayerColors = colorsPanelOpen || colorBrush !== null || colorMode || hintOpen
  const visibleChainAnnotations =
    !colorsActive && chainsPanelOpen && !hintVisualsActive && (sketch.annotations.links?.length || sketch.annotations.candidates?.size) ? sketch.annotations : undefined
  const chainBoardAnnotations = mergeBoardAnnotations(visibleChainAnnotations, alsAnnotations)
  const highlightedRule = variantRulesOpen ? dialogRule : pinnedRule
  const boardContent = {
    grid,
    variantPuzzle: variant?.puzzle,
    fog,
    whispersGuide: game.whispersGuide,
    algebraicCages: cages,
    sizedRules,
    givens: game.givens,
    aqreShades,
    givenCellColors: game.givenCellColors,
  }
  const boardAppearance = {
    highlightedRule,
    showGuides: appearance.showGuides,
    highlighting,
  }
  const boardFrameLayout = {
    frameRef: hintBoardFrameRef,
    layoutBoundaryRef: !game.paused ? gridAlignmentBoundaryRef : undefined,
  }
  const liveBoardLayout = {
    ...boardFrameLayout,
    modeBorder: badgeMode,
    modeBoundaryRef: puzzleGridBorderRef,
    modeBadge,
  }
  const solutionGrid = (
    <Board
      content={{
        ...boardContent,
        fog: solutionFog,
        givens,
        values: previewPosition ? lessonValues(previewPosition) : (solutionFog?.puzzle.givens ?? givens),
        candidates: previewPosition?.candidates,
      }}
      appearance={{
        ...boardAppearance,
        authoredArtwork: game.authoredArtwork,
        annotations: stepDiagram?.annotations,
        label: 'Solution preview',
      }}
      layout={boardFrameLayout}
    />
  )
  const livePuzzleStage = previewing ? (
    solutionGrid
  ) : !mobile && completionPanel ? (
    completionPanel
  ) : (sketch.drawing || browsingStrongLinks) && chainMasks ? (
    <Board
      content={{
        ...boardContent,
        values,
        position: game.position,
        candidates: chainMasks,
      }}
      appearance={{
        ...boardAppearance,
        errors: errors,
        authoredArtwork: game.authoredArtwork,
        annotations: mergeBoardAnnotations(strongLinksVisible ? strongLinks.annotations : sketch.annotations, alsAnnotations),
        annotationsOnTop: Boolean(alsAnnotations),
        showPlayerColors: showPlayerColors,
        showImportedAnnotations: !hintVisualsActive,
        label: sketch.drawing ? 'Sudoku grid for drawing links' : 'Sudoku grid with strong links',
        descriptionId: badgeMode ? modeBadgeId : undefined,
        highlightedDigit: strongLinksVisible ? null : chainHighlightDigit,
        highlightedDigitMask: strongLinksVisible ? strongLinkMask : 0,
        highlightedDigitMatch: 'any',
        highlighting: highlighting,
        highlightCandidateCells: true,
        fullCandidateCellHighlight: true,
        highlightCandidateCount: !strongLinksVisible && highlightCandidatePairs ? 2 : null,
      }}
      interaction={{
        boardRef: boardRef,
        linkDrawing: sketch.drawing,
        onCandidate: strongLinksVisible ? selectStrongLinkCandidate : sketch.select,
        onGroupCandidate: sketch.groupCandidate,
        onGiven: strongLinksVisible ? (digit) => setStrongLinkHighlights(1 << (digit - 1)) : undefined,
        onLinkSelect: strongLinksVisible ? startStrongLinkChain : undefined,
        onCandidateHover: sketch.drawing ? sketch.hover : undefined,
        isLinkTarget: sketch.isLinkTarget,
        selectedCandidates: selectedChainCandidates,
      }}
      layout={liveBoardLayout}
    />
  ) : (
    <Board
      content={{
        ...boardContent,
        givens: game.givens,
        values: values,
        position: hintAnnotations ? hintBoardPosition : boardPosition,
        candidates: hintAnnotations && hintDiagram ? hintCandidates : undefined,
      }}
      appearance={{
        ...boardAppearance,
        errors: errors,
        candidateLayout: advancedModes.candidateLayout,
        authoredArtwork: game.authoredArtwork,
        annotations: hintAnnotations ?? chainBoardAnnotations,
        annotationsOnTop: Boolean(hintAnnotations || alsAnnotations),
        showAnnotatedCandidates: Boolean(visibleChainAnnotations),
        showPlayerColors: showPlayerColors,
        showImportedAnnotations: true,
        descriptionId: badgeMode ? modeBadgeId : undefined,
        label: cages ? 'Algebraic Cages Sudoku grid' : variant ? `${variantName(variant)} Sudoku grid` : undefined,
        overlay: mobile && completionPanel ? { content: completionPanel, visible: showMobileResults } : undefined,
        highlightedDigit: selectedDigit ?? (visibleChainAnnotations ? chainHighlightDigit : null),
        highlightedDigitMask: hintOpen ? highlightedDigitMask : playerHighlightMask,
        highlightedDigitMatch: digitHighlight.match,
        colorPreview: colorPreview,
        highlightCandidateCells: !eraseMode,
        highlightCandidateCount: highlightCandidatePairs ? 2 : null,
      }}
      interaction={{
        candidateGroupPreview:
          !hintVisualsActive && canPreviewCandidates && candidatePreviewCell !== null
            ? {
                cell: candidatePreviewCell,
                mask: pencilPreviewMask,
                mode: candidateMode,
              }
            : undefined,
        selected: selected,
        active: active,
        pointerFocusedCell: pointerFocusedCell,
        boardRef: boardRef,
        onCell: canSelectCell && !paintingCandidates ? clickCell : undefined,
        onAqreShade: canSelectCell && !paintingCandidates && !hintAnnotations
          ? (cell, shade) => edit(current => setAqreShade(current, cell, shade))
          : undefined,
        onCellDoubleClick: canSelectCell && !paintingCandidates && !hintAnnotations ? doubleClickCell : undefined,
        onPaintCandidate: paintingCandidates ? colorCandidate : undefined,
        dragSelect: canSelectCell && (cellBrush !== null || canSelectCellsByDrag || canDragCandidates),
        onCellPointerDown: canSelectCell && !paintingCandidates ? startCellDrag : undefined,
        onCellPointerMove: canSelectCell && !paintingCandidates ? continueCellDrag : undefined,
          onGridPointerLeave,
      }}
      layout={liveBoardLayout}
    />
  )
  const pausedPuzzleStage = (
    <div className={`board-frame puzzle-paused-frame ${appearance.showGuides ? '' : 'guides-hidden'}`}>
      <div ref={game.paused ? gridAlignmentBoundaryRef : undefined} className="puzzle-paused" role="status" aria-label="Puzzle paused">
        <span className="puzzle-paused-icon" aria-hidden="true">
          <Pause size={25} />
        </span>
        <h2>Puzzle paused</h2>
        <Button type="button" variant="primary" onClick={resumePuzzle}>
          <Play size={17} aria-hidden="true" /> Resume puzzle
        </Button>
      </div>
    </div>
  )
  const puzzlePlayLayers = <PlayStageLayers paused={game.paused} live={livePuzzleStage} pause={pausedPuzzleStage} />

  const quickActions: Record<PinnedAction, { Icon: typeof PencilLine; command: UiCommand<PinnedAction> }> = {
    candidates: { Icon: PencilLine, command: generateCandidatesCommand },
    singles: { Icon: CheckCheck, command: solveSinglesCommand },
    chain: {
      Icon: Link2,
      command: pinnedCommand('chain', panelAvailable('chains'), enterChainsMode, chainsActive),
    },
    colors: {
      Icon: Palette,
      command: pinnedCommand('colors', panelAvailable('colors'), enterColorsMode, colorsActive),
    },
    'strong-links': {
      Icon: Link2,
      command: pinnedCommand('strong-links', panelAvailable('chains'), toggleStrongLinks, showStrongLinks),
    },
    techniques: {
      Icon: ListFilter,
      command: pinnedCommand('techniques', panelAvailable('techniques'), () => showPuzzleTool('techniques'), activeToolPanel === 'techniques'),
    },
    hint: { Icon: Lightbulb, command: hintCommand },
    check: { Icon: Check, command: checkCommand },
    undo: {
      Icon: Undo2,
      command: pinnedCommand('undo', game.past.length > 0, () => edit(undo)),
    },
    redo: {
      Icon: Redo2,
      command: pinnedCommand('redo', game.future.length > 0, () => edit(redo)),
    },
  }
  const visiblePinnedActions = !placeholder && !draft && !completed ? pinnedActions : []
  const visiblePinnedControls = visiblePinnedActions.map((id) => ({
    Icon: quickActions[id].Icon,
    shortLabel: pinnedActionDetails[id].shortLabel,
    command: quickActions[id].command,
  }))
  useLayoutEffect(() => {
    const puzzle = puzzleCardRef.current
    const puzzleStack = playLayoutAnchors?.puzzleStack.current
    const inputStack = playLayoutAnchors?.inputStack.current
    const stage = puzzleStageRef.current
    if (!desktop || advancedWorkspace || !puzzle || !puzzleStack || !inputStack || !stage) return
    const gridBoundary = () => gridAlignmentBoundaryRef.current ?? stage
    const alignInput = () => {
      const page = playLayoutAnchors?.page.current
      const previewScale = playLayoutAnchors?.layoutRoot.current?.hasAttribute('data-layout-resizing') ? Number(page?.style.scale) || 1 : 1
      const scale = (Number(getComputedStyle(puzzleStack).getPropertyValue('--desktop-layout-scale')) || 1) * previewScale
      const top = (gridBoundary().getBoundingClientRect().top - puzzleStack.getBoundingClientRect().top) / scale
      inputStack.style.setProperty('--puzzle-grid-offset', `${top + puzzleStack.scrollTop}px`)
    }
    alignInput()
    const observer = new ResizeObserver(alignInput)
    observer.observe(puzzle, { box: 'border-box' })
    observer.observe(stage, { box: 'border-box' })
    observer.observe(gridBoundary(), { box: 'border-box' })
    return () => {
      observer.disconnect()
      inputStack.style.removeProperty('--puzzle-grid-offset')
    }
  }, [
    desktop,
    advancedWorkspace,
    game.paused,
    placeholder,
    appearance.showGuides,
    puzzleControlsBelow,
    previewing,
    showResults,
    sketch.drawing,
    browsingStrongLinks,
    playLayoutAnchors,
  ])

  const puzzleMetadata = (!draft || placeholder) && (
    <div key="metadata" className="puzzle-metadata" aria-hidden={Boolean(placeholder) || undefined}>
      {difficulty && (
        <span className="puzzle-difficulty">
          <span className="sr-only">Puzzle difficulty </span>
          {formatPuzzleRating(difficulty, score)}
        </span>
      )}
      {game.generatedWithAuto && <span className="puzzle-auto-mode">Auto</span>}
      {showElapsedTime && (
        <span className="duration-counter" role="timer" aria-label={`Elapsed time ${formatTime(game.elapsed)}${game.paused ? ', paused' : ''}`}>
          {formatTime(game.elapsed)}
        </span>
      )}
      {!placeholder && sharedOnOtherDevice && (
        <span className="puzzle-peer-status" role="img" aria-label="Open on another linked device" title="Open on another linked device">
          <MonitorSmartphone size={16} aria-hidden="true" />
        </span>
      )}
      {showPuzzleSync && (loadingPuzzle || syncStatus === 'saving') && (
        <span className="puzzle-sync-loading" role="status" title="Syncing puzzle progress…">
          <LoaderCircle size={15} className="loading-spinner" aria-hidden="true" />
          <span className="sr-only">Syncing puzzle progress…</span>
        </span>
      )}
      {syncWarning && (
        <span className="puzzle-sync-warning" role="status">
          {syncWarning}
        </span>
      )}
      {catchUpPuzzle && !placeholder && !draft && (
        <Button
          variant="quiet"
          className="puzzle-catch-up"
          style={showResults ? { visibility: 'hidden' } : undefined}
          onClick={() => onSelectPuzzle(catchUpPuzzle.id)}
          title={`Open ${catchUpPuzzle.title} from another linked device`}
        >
          Catch up <ArrowRight size={14} aria-hidden="true" />
        </Button>
      )}
    </div>
  )
  const viewToggleBesideMenu = desktop && !advancedWorkspace && puzzleControlsBelow
  const viewToggle = completed && !previewing && (
    <Button
      variant="quiet"
      className="puzzle-view-toggle"
      aria-pressed={showSolvedGrid}
      aria-controls={puzzleStageId}
      aria-keyshortcuts={pauseKeys.join(' ')}
      onClick={toggleSolvedView}
    >
      {showSolvedGrid ? 'View results' : 'View grid'}
    </Button>
  )
  const puzzleUtilityActions = (
    <>
      {puzzleZoom.zoomed && (
        <IconButton variant="quiet" className="puzzle-zoom-reset" aria-label="Reset grid zoom" title="Reset grid zoom" onClick={puzzleZoom.reset}>
          <ZoomOut size={18} aria-hidden="true" />
        </IconButton>
      )}
      {nonUnique && <span className="non-unique-chip">Multiple Solutions</span>}
      {mixedVariant ? (
        <IconButton
          ref={rulesButtonRef}
          variant="quiet"
          className="variant-rules-button"
          aria-label="Puzzle rules"
          title="Puzzle rules"
          aria-haspopup={openPuzzlePanels.includes('rules') ? undefined : 'dialog'}
          onClick={() => (openPuzzlePanels.includes('rules') ? showRulesTab() : setVariantRulesOpen(true))}
        >
          <Info size={16} aria-hidden="true" />
        </IconButton>
      ) : (
        (variant || grid) && (
          <Button
            variant="quiet"
            className="variant-rules-button"
            onClick={() => setVariantRulesOpen(true)}
            aria-label={grid ? `${sizedName} rules` : `${variantName(variant)} Sudoku rules`}
            aria-haspopup="dialog"
          >
            <Info size={16} aria-hidden="true" />
            {grid ? sizedName : variantName(variant)}
          </Button>
        )
      )}
      {!viewToggleBesideMenu && viewToggle}
    </>
  )
  const puzzleActions = (
    <div key="actions" className="puzzle-actions">
      {presentationDraft ? (
        <>
          <Button onClick={() => setCancelDraftOpen(true)}>
            <X size={17} /> Cancel
          </Button>
          {grid && 'regions' in grid && onEditRegions && (
            <Button onClick={onEditRegions} aria-haspopup="dialog">
              Edit regions
            </Button>
          )}
          {grid && !draftCages && onEditSizedRules && (
            <Button onClick={onEditSizedRules} aria-haspopup="dialog">
              Edit rules
            </Button>
          )}
          {draftCages && onEditCages && (
            <Button onClick={onEditCages} aria-haspopup="dialog">
              Edit cages
            </Button>
          )}
          <Button variant="primary" className="publish-button" onClick={onPublish}>
            <Check size={17} /> Save puzzle
          </Button>
        </>
      ) : (
        <>
          {!puzzleControlsBelow && puzzleUtilityActions}
          {viewToggleBesideMenu && viewToggle}
          {timing.trackTime && timing.showPause && !draft && !completed && (mobile || game.started || game.paused) && !previewing && (
            <IconButton
              type="button"
              variant="quiet"
              className="puzzle-pause-trigger"
              aria-label={game.paused ? 'Resume puzzle' : 'Pause puzzle'}
              title={`${game.paused ? 'Resume puzzle' : 'Pause puzzle'} (${pauseKeys.join(' / ')})`}
              aria-pressed={game.paused}
              aria-keyshortcuts={pauseKeys.join(' ')}
              onClick={togglePause}
            >
              <span className="pause-toggle-icons" aria-hidden="true">
                <Pause className="pause-toggle-pause" size={18} />
                <Play className="pause-toggle-play" size={18} />
              </span>
            </IconButton>
          )}
          <div className="puzzle-menu-wrap" data-puzzle-menu data-grid-click-away-exempt ref={puzzleMenuRef}>
            <IconButton
              ref={puzzleMenuButtonRef}
              variant="quiet"
              className="puzzle-menu-trigger"
              aria-label="Open puzzle options"
              title="Puzzle options"
              disabled={Boolean(placeholder)}
              aria-expanded={puzzleMenuOpen}
              aria-controls={puzzleMenuOpen ? 'puzzle-menu' : undefined}
              onClick={(event) => {
                if (mobile) event.currentTarget.focus({ preventScroll: true })
                setActionsOpen(false)
                setPuzzleMenuOpen((open) => !open)
              }}
            >
              <MoreHorizontal size={20} />
            </IconButton>
            {puzzleMenu}
          </div>
        </>
      )}
    </div>
  )
  const puzzleStage = (
    <div
      key="grid"
      id={puzzleStageId}
      ref={puzzleStageRef}
      data-no-panel-hold={mobile || undefined}
      data-pointer-input={(mobile && inputModality === 'pointer') || undefined}
      className={`puzzle-stage${previewing ? ' solution-preview' : sketch.drawing || browsingStrongLinks || visibleChainAnnotations ? ' chain-sketch' : hintAnnotations ? ' hint-preview' : ''}`}
      onContextMenu={(event) => {
        if (!cellHold.suppressContextMenu(event)) preventControlClickMenu(event)
      }}
      onPointerUp={(event) => finishControlClick(event, clickCell)}
      onBlur={(event) => {
        const cell = event.target.dataset.cell
        if (cell !== undefined) setPointerFocusedCell((current) => (current === Number(cell) ? null : current))
      }}
    >
      {placeholder ? (
        <div className="puzzle-placeholder-stage">
          <div className="puzzle-grid-reservation" aria-hidden="true" inert>
            <Board
              content={{
                grid: grid,
                fog: fog,
                algebraicCages: cages,
                sizedRules: sizedRules,
                givens: givens,
                values: values,
                givenCellColors: game.givenCellColors,
              }}
              appearance={{
                authoredArtwork: game.authoredArtwork,
                showGuides: appearance.showGuides,
              }}
            />
          </div>
          <div className="puzzle-placeholder-message">{placeholder}</div>
        </div>
      ) : !draft && !completed ? (
        mobile ? (
          <div className="puzzle-zoom" data-zoomed={puzzleZoom.zoomed || undefined} {...puzzleZoom.viewportProps}>
            <div ref={puzzleZoom.content} className="puzzle-zoom-content">
              {puzzlePlayLayers}
            </div>
          </div>
        ) : (
          puzzlePlayLayers
        )
      ) : (
        livePuzzleStage
      )}
    </div>
  )
  const puzzleTopActions =
    puzzleControlsBelow && (puzzleZoom.zoomed || variant || grid || (!viewToggleBesideMenu && viewToggle)) ? (
      <div key="top-actions" className="puzzle-actions puzzle-top-actions">
        {puzzleUtilityActions}
      </div>
    ) : null
  const puzzlePanel = (
    <div ref={hintColumnRef} className="puzzle-column" data-reserve-badge-space={(!placeholder && !draft) || undefined}>
      <section
        ref={puzzleCardLayoutRef}
        className="puzzle puzzle-flat"
        data-resize-preview-content
        aria-label={game.title}
        data-placeholder={Boolean(placeholder) || undefined}
        data-puzzle-controls={puzzleControlsBelow ? 'bottom' : undefined}
        data-desktop-solved={(desktop && completed && !previewing) || undefined}
        style={
          {
            '--board-font-scale': appearance.gridTextScale,
            '--candidate-font-scale': appearance.candidateTextSize / 100,
          } as CSSProperties
        }
      >
        {puzzleControlsBelow
          ? [puzzleTopActions, puzzleStage, puzzleMetadata, puzzleActions]
          : mobile
            ? [
                <div key="toolbar" className="mobile-puzzle-toolbar" data-mobile-puzzle-toolbar data-no-panel-hold>
                  {puzzleMetadata}
                  {puzzleActions}
                </div>,
                puzzleStage,
              ]
            : [puzzleMetadata, puzzleActions, puzzleStage]}
        {game.practiceTechnique ? <div className="puzzle-caption">{techniqueLabel(game.practiceTechnique)}</div> : <PuzzleCollectionCredit game={game} />}
        {showKillerCombinations && <KillerCombos puzzle={game.variant?.puzzle} values={values} active={selected.at(-1) ?? -1} visible={selected.length > 0} />}
        <PinnedActionBar actions={visiblePinnedControls} disabled={disabled} />
        {presentationDraft && (
          <div className="draft-tip">
            <PencilLine size={16} /> Enter the givens, then save your puzzle.
          </div>
        )}
      </section>
    </div>
  )
  const inputPanel = (
    <div ref={inputRef} className="workspace-controls" data-show-completion={showMobileResults || undefined}>
      <Controls
        digits={{
          gridSize: gridSize,
          candidateDigitColors: candidateDigitColors,
          digitPaintColor: !hintAnnotations && !mobileHintPreview
            ? brush ?? (colorMode ? selectedColor ?? undefined : undefined)
            : undefined,
          mode: mode,
          pencil: pencilActive,
          candidateKind: candidateKind,
          setCandidateKind: setCandidateKind,
          selectedDigit: browsingStrongLinks || sketch.drawing ? (strongLinksVisible ? null : chainHighlightDigit) : selectedDigit,
          hasCellSelection: hasInputSelection,
          highlightedDigitMask: strongLinksVisible ? strongLinkMask : sketch.drawing || eraseMode ? 0 : highlightedDigitMask,
          onToggleDigitHighlight: strongLinksVisible ? toggleStrongLinkDigit : !sketch.drawing && !draft && !solved && !previewing ? toggleDigitHighlight : undefined,
          digitHighlightMatch: digitHighlight.match,
          onDigitHighlightMatchChange: !draft && !solved && !previewing ? changeDigitHighlightMatch : undefined,
          values: values,
          input: sketch.drawing || browsingStrongLinks ? toggleChainHighlight : input,
          onPaintDigit: digit => {
            const color = brush ?? (colorMode ? selectedColor : null)
            if (color !== null && !hintAnnotations && !mobileHintPreview) paintCandidateDigit(digit, color)
          },
          onSelectDigit: digit => {
            clearHighlightedDigits()
            setHighlightCandidatePairs(false)
            setSelectedDigit(current => current === digit ? null : digit)
          },
        }}
        tools={{
          togglePencil: () => switchPenPencil(gridInputMode !== 'pencil'),
          colorMode: colorMode,
          colorTarget: colorTarget,
          setColorTarget: changeColorTarget,
          toggleColorMode: mobile ? activateColorsShortcut : undefined,
          colorsActive: colorsActive,
          onSwitchShade: switchColorShade,
          paintCandidateGroupAvailable: colorTarget === 'candidate' && candidateBrush !== null && candidateCount(highlightedDigitMask) > 1,
          onPaintCandidateGroup: () => {
            if (candidateBrush !== null) paintSelectedCandidateDigits(candidateBrush)
          },
          clearDigitHighlightsAvailable: !sketch.drawing && !browsingStrongLinks && !eraseMode && candidateCount(highlightedDigitMask) > 1,
          onClearDigitHighlights: clearDigitSelection,
          highlightMode: highlightMode,
          toggleHighlightMode: toggleHighlightMode,
          eraseMode: eraseMode,
          toggleEraseMode: () => {
            setColorBrush(null)
            setSelected([])
            toggleInputToolOverride('erase')
          },
          chainDrawing: sketch.drawing || browsingStrongLinks,
          showMultiSelectButton: !advancedWorkspace,
          multi: multi,
          toggleMulti: toggleMulti,
        }}
        history={{
          undo: () => edit(undo),
          redo: () => edit(redo),
          canUndo: !!game.past.length,
          canRedo: !!game.future.length,
          historyDisabled: historyDisabled,
          hideUndo: completed,
        }}
        actions={{
          onCheck: presentationDraft || previewing ? undefined : () => checkCommand.run(),
          actionsButtonRef: actionsMenuButtonRef,
          actionsOpen: actionsOpen,
          reserveSolvingSlots: desktop && !advancedWorkspace && solved && !previewing,
          actionsMenu: !mobile && !advancedWorkspace ? desktopActionsMenu : undefined,
          inputTools:
            desktop && panelToggles.length > 0 ? (
              <InputToolsMenu
                disabled={game.paused}
                preferBelow
                onShow={(opener) => {
                  desktopToolsOpener.current = opener
                  setPuzzleMenuOpen(false)
                  setActionsOpen(false)
                }}
              >
                {panelToggles}
              </InputToolsMenu>
            ) : undefined,
          onActions:
            !presentationDraft && !solved && (mobile || !advancedWorkspace)
              ? () => {
                  setPuzzleMenuOpen(false)
                  setActionsOpen((open) => !open)
                }
              : undefined,
        }}
        layout={{
          advancedModes: advancedModes,
          compact: mobile,
          disabled: disabled || (solved && !showSolvedGrid),
          draft: presentationDraft,
          inputSize: inputSize,
          panelHeight: panelHeight,
          setPanelHeight: setPanelHeight,
          beginResize: beginResize,
        }}
      />
      {mobile && completed && (
        <section
          ref={completionActionsTargetRef}
          className="surface mobile-completion-actions"
          aria-label="Next puzzle options"
          hidden={!showMobileResults}
          data-no-panel-hold
        ></section>
      )}
    </div>
  )
  const advancedHintPanel = (
    <div className="dock-hint-content">
      <MotionSurface speed="tabs">{hintPanel}</MotionSurface>
      {!hintPanel && (
        <section className="advanced-spoiler-panel motion-surface" data-presence="open" aria-label="Hint">
          <span className="advanced-spoiler-icon" aria-hidden="true">
            <Lightbulb size={21} />
          </span>
          <div>
            <h2>Hint</h2>
            <p>Hint contents stay hidden until you choose to reveal them.</p>
          </div>
          <Button
            variant="primary"
            disabled={busy || solved || draft || game.paused}
            onClick={() => {
              void showHint()
            }}
          >
            <Eye size={17} /> {busy && hintRevealed ? 'Finding a hint…' : 'Reveal hint'}
          </Button>
          <Button
            disabled={busy || solved || draft || game.paused}
            onClick={() => {
              void showHint('all')
            }}
          >
            <ListFilter size={17} /> Analyze all moves
          </Button>
        </section>
      )}
    </div>
  )
  // An empty fragment keeps the dock slot mounted while the puzzle is paused.
  const pausedPanel = <></>
  const techniquesPanel = game.paused ? (
    pausedPanel
  ) : draft ? (
    <p className="analysis-empty">Available after starting the puzzle.</p>
  ) : (
    <PuzzleAnalysisContents game={game} onSelectTechnique={showTechniqueHints} />
  )
  const solutionPathPanel = game.paused ? (
    pausedPanel
  ) : solutionPathRevealed && solutionPath ? (
    <SolutionPath
      state={solutionPath}
      index={solutionStep}
      cellReferenceStyle={cellReferenceStyle}
      gridSize={gridSize}
      techniqueDifficulties={techniqueDifficulties}
      resizeOverflowRef={setSolutionStepsOverflowRef}
      onSelect={selectSolutionStep}
      onRetry={() => showSolutionPath(true)}
      onClose={closeSolutionPath}
      onReveal={markSolutionVisible}
      embedded={!advancedWorkspace}
    />
  ) : (
    <section className="advanced-spoiler-panel solution-spoiler-panel" aria-label="Solution">
      <span className="advanced-spoiler-icon" aria-hidden="true">
        <ListOrdered size={21} />
      </span>
      <div>
        <h2>Solution</h2>
        <p>The solving steps stay hidden until you choose to reveal them.</p>
      </div>
      <Button variant="primary" disabled={busy || draft} onClick={() => showSolutionPath()}>
        <Eye size={17} /> Reveal solution
      </Button>
    </section>
  )
  const clueCount = [...visibleGivens].filter((digit) => digit !== '0').length
  const placedDigitCount = [...game.position.entries].filter((digit) => digit !== '0').length
  const candidateTotal = game.position.center.reduce(
    (sum, mask, index) => (values[index] === '0' && (!fog || fog.cells.has(index)) ? sum + candidateCount(mask | game.position.corner[index]) : sum),
    0
  )
  const detailsPanel = (
    <PuzzleDetails
      items={[
        { label: 'Puzzle', value: game.title },
        {
          label: 'Status',
          value: placeholder ? 'Waiting for puzzle' : solved ? 'Solved' : game.paused ? 'Paused' : game.started ? 'In progress' : 'Not started',
        },
        {
          label: 'Difficulty',
          value: difficulty ? formatPuzzleRating(difficulty, score) : 'Unrated',
        },
        ...(!grid && !draft && !placeholder
          ? [
              {
                label: 'Original puzzle',
                value: originalSolutionStatus[nonUnique ? 'multiple' : verifiedOriginal ? 'unique' : 'unverified'],
              },
            ]
          : []),
        ...(showElapsedTime ? [{ label: 'Elapsed time', value: formatTime(game.elapsed) }] : []),
        { label: 'Givens', value: clueCount },
        { label: 'Placed digits', value: placedDigitCount },
        { label: 'Candidates', value: candidateTotal },
        { label: 'Undo steps', value: game.past.length },
      ]}
    />
  )
  const browserPanel = (
    <AdvancedPuzzleBrowser
      games={games}
      active={game.id}
      view={puzzleBrowserView}
      onViewChange={setPuzzleBrowserView}
      onSelect={onSelectPuzzle}
      onNew={onNewPuzzle}
      onImport={onImportPuzzle}
      onSave={onPublish}
      onSavePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, saved: true }))}
      onUnsavePuzzle={(id) =>
        roomStore.update(id, (puzzle) => ({
          ...puzzle,
          saved: false,
          savedForLater: undefined,
        }))
      }
      onArchivePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, archived: true }))}
      onRestorePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, archived: false }))}
    />
  )

  const rulesPanel = openPuzzlePanels.includes('rules') && (
    <section ref={rulesPanelRef} className="variant-rules-panel" aria-label="Puzzle rules" tabIndex={advancedWorkspace ? -1 : undefined}>
      {advancedWorkspace && (
        <div className="variant-rules-panel-actions">
          <IconButton variant="quiet" aria-label="Unpin rules" title="Unpin rules" onClick={() => closeToolPanel('rules')}>
            <PinOff size={17} aria-hidden="true" />
          </IconButton>
        </div>
      )}
      <VariantRules key={id} sections={ruleSections} onHighlight={setPinnedRule} />
    </section>
  )
  const bookmarksPanel = (
    <BookmarksPanel key={id} bookmarks={savedGame.bookmarks} disabled={historyDisabled} onSave={saveBookmark} onRestore={restoreBookmark} onDelete={deleteBookmark} />
  )
  const toolPanelContents: Record<ToolPanelTab, ReactNode> = {
    digits: inputPanel,
    colors: cellColorsPanel,
    chains: chainsPanel,
    bookmarks: bookmarksPanel,
    rules: rulesPanel,
    solution: solutionPathPanel,
    techniques: techniquesPanel,
  }
  const advancedToolContents = Object.fromEntries(TOOL_PANEL_ORDER.map((tool) => [tool, advancedPanelOpen(tool) ? toolPanelContents[tool] : undefined])) as Partial<
    Record<PuzzleTool, ReactNode>
  >
  const pinnedHint = mobile && mobileHintPinned ? hintPanel : undefined

  return (
    <CellReferenceHighlightProvider>
    <>
      <PlayLayout
        desktop={desktop}
        puzzle={puzzlePanel}
        hint={hintPanel}
        hintLayout={desktopHintLayout}
        input={
          desktop ? (
            inputPanel
          ) : (
            <MobileInputTabs
              active={activeToolPanel}
              open={openPuzzlePanels}
              panels={toolPanelContents}
              pinnedHint={pinnedHint}
              activeTabRef={activeMobileInputTabRef}
              layoutRefs={mobileInputTabsLayoutRefs}
              toolsDisabled={rearranging}
              toolToggles={panelToggles.length ? panelToggles : undefined}
              onShowTools={(opener) => {
                mobileToolsOpener.current = opener
              }}
              onSelect={selectToolPanel}
              onClose={closeToolPanel}
            />
          )
        }
        insights={
          activeDesktopTab
            ? {
                active: activeDesktopTab.id,
                tabs: openInsightTabs,
                tabListRef: insightTabsRef,
                onSelect: selectToolPanel,
                onClose: () => closeToolPanel(activeDesktopTab.id),
                content: toolPanelContents[activeDesktopTab.id],
              }
            : undefined
        }
        mobile={{
          puzzleId: game.id,
          rearranging,
          withHint: !pinnedHint && (mobileHintOpen || Boolean(solutionHintPanel) || rearranging),
          hintInTabs: Boolean(pinnedHint),
          fitContent: (pinnedActions.length > 0 && !placeholder && !draft) || Boolean(pinnedHint),
          resizableInput: mobileToolsAvailable || openPuzzlePanels.length > 0,
          inputTabCount: openPuzzlePanels.length + Number(Boolean(pinnedHint)),
          inputResizeRefs: mobileInputResizeRefs,
          savedInputHeight: toolPanels.height,
          puzzleTopSpace: appearance.mobilePuzzleTopSpace,
          puzzleShrink: appearance.mobilePuzzleShrink,
          onPuzzleTopSpaceChange: onMobilePuzzleTopSpaceChange,
          onInputHeightChange: (height) =>
            setPlaySessionState('toolPanels', (current) => {
              if (height !== undefined) return { ...current, height }
              return { open: current.open, active: current.active }
            }),
          hintSwipe: mobileHintOpen && !pinnedHint ? { dismiss: closeHint, apply: applyHintAction } : undefined,
          blocked:
            Boolean(placeholder) ||
            modalOpen ||
            puzzleMenuOpen ||
            actionsOpen ||
            variantRulesOpen ||
            chainColorsOpen ||
            dialogResult !== null ||
            resetOpen ||
            confirmCandidatesOpen ||
            cancelDraftOpen,
          onRearrangingChange: (active) => {
            setMobileRearranging(active)
            if (!active) return
            const paintPointerId = cellPaint.cancel()
            const gesturePointerId = resetBoardGestures()
            const pointerId = paintPointerId ?? gesturePointerId
            if (pointerId !== undefined && boardRef.current?.hasPointerCapture(pointerId)) boardRef.current.releasePointerCapture(pointerId)
          },
          inputTitle: openPuzzlePanels.length ? 'Input' : showMobileResults ? 'Next puzzle' : 'Keypad',
          hintPlaceholder: (
            <PlayHint mobile>
              <HintCard
                hint={{
                  title: 'Puzzle hints',
                  text: 'Hints will appear here.',
                }}
                onClose={() => {}}
              />
            </PlayHint>
          ),
        }}
        advanced={
          advancedWorkspace ? (
            <DesktopDockLayout
              puzzle={puzzlePanel}
              input={inputPanel}
              tools={advancedToolContents}
              details={detailsPanel}
              browser={browserPanel}
              showLeft={showLeftPanel}
              showRight={showRightPanel}
              showBottom={showBottomPanel}
              activeToolPanel={activeToolPanel}
              onSelectToolPanel={selectToolPanel}
              focusHintRequest={focusHintRequest}
              focusChainsRequest={focusChainsRequest}
              onToolVisibilityChange={{
                chains: setDesktopChainsVisible,
                colors: setDesktopColorsVisible,
                solution: setDesktopSolutionVisible,
              }}
              onInputVisibleChange={setDesktopInputVisible}
              hint={advancedHintPanel}
            />
          ) : undefined
        }
      />
      <Modal title="Actions" className="puzzle-actions-sheet" data-grid-click-away-controls open={mobile && actionsOpen} motionSpeed="overlay" onClose={() => setActionsOpen(false)}>
        {mobileActionsMenu}
      </Modal>
      <Modal title="Puzzle details" open={puzzleDetailsOpen} onClose={() => setPuzzleDetailsOpen(false)}>
        {detailsPanel}
      </Modal>
      <ChainColorsDialog
        open={chainColorsOpen}
        first={sketch.active.color}
        second={sketch.active.secondColor}
        onSelect={sketch.setColors}
        onClose={() => setChainColorsOpen(false)}
        onEdit={
          onEditChainColors &&
          (() => {
            setChainColorsOpen(false)
            onEditChainColors()
          })
        }
      />
      {variant && !grid && (
        <Modal
          title={mixedVariant ? <span className="sr-only">Puzzle rules</span> : `${variantName(variant)} rules`}
          className="variant-rules-dialog"
          open={variantRulesOpen}
          onClose={() => setVariantRulesOpen(false)}
          returnFocus={focusPinnedRules}
        >
          <div className="variant-rules-layout">
            <div className="variant-rules-preview">
              <Board
                content={{
                  variantPuzzle: variant.puzzle,
                  fog: game.paused ? fogView(variant) : fog,
                  whispersGuide: game.whispersGuide,
                  givens: givens,
                  values: game.paused ? EMPTY : values,
                }}
                appearance={{
                  highlightedRule: dialogRule,
                  label: 'Rule preview',
                  showGuides: false,
                }}
              />
            </div>
            <VariantRules key={id} sections={ruleSections} active={variantRulesOpen} onHighlight={setDialogRule} />
          </div>
          {panelAvailable('rules') && (
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  focusRulesAfterDialog.current = true
                  setVariantRulesOpen(false)
                  showRulesTab()
                }}
              >
                <Pin size={17} aria-hidden="true" /> Pin rules
              </Button>
            </div>
          )}
        </Modal>
      )}
      {grid && (
        <Modal title={`${sizedName} rules`} open={variantRulesOpen} onClose={() => setVariantRulesOpen(false)}>
          <div className="variant-rules-copy">
            {algebraic?.source?.author && <p>By {algebraic.source.author}</p>}
            {sized?.author && <p>By {sized.author}</p>}
            {(algebraic ? algebraicRules(algebraic) : sized ? sizedRuleDescriptions(grid, sized.rules) : [MINI_RULE]).map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </div>
        </Modal>
      )}
      {dialogResult && <PuzzleCheckResult result={dialogResult} onClose={() => setDialogResult(null)} />}
      <PuzzleSessionDialogs
        candidates={{
          open: confirmCandidatesOpen,
          returnFocus: () => candidateConfirmationOpener.current,
          onClose: () => setConfirmCandidatesOpen(false),
          onConfirm: () => {
            setConfirmCandidatesOpen(false)
            void generateCandidates(true)
          },
        }}
        reset={{
          open: resetOpen,
          removesTime: Boolean(completed || game.timeUntracked),
          onClose: () => setResetOpen(false),
          onConfirm: () => {
            if (completed)
              openSolvedGrid({
                ...restartGame(game),
                elapsed: savedGame.elapsed,
                timeUntracked: savedGame.timeUntracked,
              })
            else updateWorkingGame(restartGame)
            setSelected([])
            setColorBrush(null)
            setSelectedColor(null)
            setSelectedDigit(null)
            setDigitHighlight(defaultDigitHighlight)
            setHighlightCandidatePairs(false)
            setHint(null)
            setHintRevealed(false)
            setPlaySessionState('solutionView', null)
            setResetOpen(false)
          },
        }}
        draft={{
          open: cancelDraftOpen,
          editing: Boolean(game.editingId),
          onClose: () => setCancelDraftOpen(false),
          onDiscard: onCancelDraft,
        }}
      />
    </>
    </CellReferenceHighlightProvider>
  )
}
