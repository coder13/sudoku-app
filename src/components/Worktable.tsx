import { fogView, playVariantPuzzle } from '../sudoku/fog'
import { Button, IconButton } from './Button'
import {
  type CSSProperties, type ReactNode, type Dispatch, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import { ArrowRight, Bookmark, Braces, Check, CheckCheck, Clipboard, CloudUpload, Eraser, Eye, Info, Lightbulb, Link2, ListFilter, ListOrdered, LoaderCircle, LogOut, MonitorSmartphone, MoreHorizontal, Palette, Pause, PencilLine, Pin, PinOff, Play, Redo2, RotateCcw, Share2, Undo2, X, ZoomOut } from 'lucide-react'
import { explainCandidateRecovery, findCandidateRecovery, restoreCandidate, type CandidateRecovery } from '../sudoku/candidate-recovery'
import { recordAction, type ActionKind } from '../sudoku/action-history'
import { PINNABLE_ACTIONS, type PinnedAction } from '../sudoku/pinned-actions'
import { chainCandidate, chainNodeCandidates, makeChainGraph } from '../sudoku/chains'
import { applyChainDeduction } from '../sudoku/chain-sketch'
import { deviceSync } from '../sudoku/device-sync'
import { formatPuzzleRating, SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { createEngineSession, EngineError, replayStep, runEngine, type Candidate, type Deduction, type DeductionAction, type EngineRunner, type EngineSession, type HintChoice } from '../sudoku/engine'
import {
  COLORS, EMPTY, alternateColorShade, applyDeduction, candidateCount, clearCandidateColors, clearImportedDrawings, completeCandidateMasks, conflictsOf, createPuzzleBookmark, enter, fillEntries,
  formatTime, hasCandidate, hasCandidates, hasUniquenessProof, hintEliminations, isSolved, marksOf, markSolveUntimed, needsInitialCandidates, onlyCandidate, paintCandidate, paintCandidates, paintCandidateStroke, paintCells, puzzleIdentity, redo, replaceCandidates, restartGame, restorePuzzleBookmark, setGamePaused, singleFromCandidates, toggleCandidateGroup, undo, valuesOf, withCellColors,
  type ColorTarget, type EnterOptions, type ErrorMode, type Game, type Mode, type Position,
} from '../sudoku/game'
import { miniSingles, solveMini } from '../sudoku/mini-play'
import { sizedRulePosition, sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { sizedRuleSingles } from '../sudoku/sized-rule-play'
import { algebraicRules, analyzeAlgebraic, checkAlgebraicHintPosition } from '../sudoku/algebraic-play'
import { isAlgebraicCageList } from '../sudoku/algebraic-cages'
import { ALGEBRAIC_CAGES_NAME, MINI_NAME, MINI_RULE, sizedGridName } from '../sudoku/new-puzzle'
import { CLASSIC_GRID, sizedClassicPosition } from '../sudoku/grid'
import { cellReference, describeHint, describeHintDigits, describeHintRemovals, HINT_CANDIDATES_ERROR, HINT_ERROR, NO_HINT, moveHintIndex, moveHintStage, techniqueLabel, type CellReferenceStyle, type HintStage, type PuzzleHint } from '../sudoku/hints'
import { activeHighlightDigit, functionKeyDigit, givenDigitAt, nextIncompleteDigit, onlyGivensSelected, type DigitHighlightMatch } from '../sudoku/highlighting'
import { hintLocation, lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { practiceSearch } from '../sudoku/lesson-guidance'
import { lessonRoutes } from '../sudoku/lessons'
import { addRatingHints, addSinglesAssistance, hintKey } from '../sudoku/player-rating'
import { applyPuzzleGrade, needsPuzzleGrade, ratePuzzle } from '../sudoku/puzzle-rating'
import { originalSolutionStatus } from '../sudoku/puzzle-validation'
import { canApplyPuzzleResult } from '../sudoku/puzzle-revision'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'
import type { AdvancedModes, AppearancePreferences, HighlightPreferences, WorkspaceMode } from '../sudoku/preferences'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { canStartCellSelectionDrag, cellsOnDragPath, extendCellSelectionPath, rectangleSelection } from '../sudoku/selection'
import { togglePencilMode } from '../sudoku/puzzle-input-mode'
import { highlightedDigitShortcut, shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { roomStore } from '../sudoku/storage'
import { defaultDigitHighlight, defaultToolPanels, playSession, PUZZLE_TOOL_ORDER, TOOL_PANEL_ORDER, type ToolPanelTab, type PuzzleTool } from '../sudoku/play-session'
import { puzzleInputMode } from '../sudoku/puzzle-input-mode'
import { continueStrongLinkColors } from '../sudoku/strong-link-colors'
import { COLOR_GROUP_CONTINUATION_ENABLED } from '../sudoku/feature-flags'
import { markTechniqueSolution, observeTechniqueActions } from '../sudoku/technique-history'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { playerActions } from '../sudoku/technique-progress'
import { matchesHintPosition, puzzleHintPage, puzzleHints, puzzleSolution, type HintPosition } from '../sudoku/puzzle-help'
import { playCandidates } from '../sudoku/variant-play'
import { puzzleForVariantTools, variantName, variantRuleSections, type VariantRuleSectionId } from '../sudoku/variants'
import { Board, gridCellAtPoint } from './Board'
import { BookmarksPanel } from './BookmarksPanel'
import { AdvancedPuzzleBrowser, type PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { CellColorPalette } from './CellColorPalette'
import { ChainColorsDialog, ChainsPanel } from './ChainsPanel'
import { useStrongLinkOverlay } from './useStrongLinkOverlay'
import { CompletedPuzzle } from './CompletedPuzzle'
import { KillerCombos } from './KillerCombos'
import { Controls } from './Controls'
import { DesktopDockLayout } from './DesktopDockLayout'
import { ModeBadge } from './ModeBadge'
import { PuzzleCollectionCredit } from './PuzzleCollections'
import { HintCard } from './HintCard'
import { InputToolsMenu } from './InputToolsMenu'
import { MobileInputTabs } from './MobileInputTabs'
import { VariantRules } from './VariantRules'
import { PlayHint, PlayLayout } from './PlayLayout'
import { useMobileLayout } from './mobile-layout'
import { useGridClickAway } from './useGridClickAway'
import { Modal } from './Modal'
import { MotionSurface, usePresence } from './Presence'
import { PuzzleCheckResult, validation, type DialogResult } from './PuzzleCheckResult'
import { PuzzleAnalysisContents } from './PuzzleAnalysis'
import { SolutionPath, solutionEndIndex, solutionEndSummary, solutionStatus, verifiedSolutionSummary, type SolutionPathState } from './SolutionPath'
import { useChainSketch } from './useChainSketch'
import { useActionHistory } from './useActionHistory'
import { usePlayPreference } from './usePlayPreference'
import { usePuzzleSelection } from './usePuzzleSelection'
import { usePuzzleTimer } from './usePuzzleTimer'
import { usePuzzleZoom } from './usePuzzleZoom'
import { useTouchHold } from './useTouchHold'

const puzzleToolDetails = {
  colors: { label: 'Colors', Icon: Palette },
  chains: { label: 'Chains', Icon: Link2 },
  bookmarks: { label: 'Bookmarks', Icon: Bookmark },
}
const puzzleTools = PUZZLE_TOOL_ORDER.map(id => ({ id, ...puzzleToolDetails[id] }))

const desktopInsightTabs = [
  { id: 'solution', label: 'Solution', Icon: ListOrdered },
  { id: 'techniques', label: TECHNIQUE_FINDER_TITLE, Icon: ListFilter },
  ...puzzleTools,
  { id: 'rules', label: 'Rules', Icon: Info },
] as const

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}

function candidateToolMasks(notes: readonly number[] | null | undefined, values: string, displayed: readonly number[] | null, eliminations?: readonly number[]) {
  return notes?.map((mask, cell) => values[cell] === '0'
    ? mask & (displayed?.[cell] ?? mask) & ~(eliminations?.[cell] ?? 0) : 0) ?? null
}

async function solveSingleValues({ grid, variant, algebraic, sized, position }: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'sized'> & Partial<Pick<Game, 'position'>>, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[], run = runEngine, variantRules?: AdvancedModes['solveSinglesVariants']) {
  if (sized && grid) return sizedRuleSingles(sized, grid, values, eliminations, displayedCandidates, run)
  if (grid?.size === 4) {
    if (algebraic) checkAlgebraicHintPosition(algebraic, values, hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size))
    return miniSingles(values, eliminations, displayedCandidates, run)
  }
  // Always solve singles that follow from standard Sudoku rules first. Variant
  // candidates and houses must not hide those singles when the matching variant
  // rule is disabled for Solve Singles.
  const classicValues = await run({ type: 'solve-singles', values, eliminations,
    displayedCandidates: variant ? undefined : displayedCandidates })
  if (!variant || !variantRules?.length) return classicValues
  const puzzle = playVariantPuzzle(variant, position?.entries) ?? variant.puzzle
  const filteredPuzzle = puzzleForVariantTools(puzzle, variantRules)
  const entries = [...classicValues].map((digit, cell) => filteredPuzzle.givens[cell] === '0' ? digit : '0').join('')
  return run({ type: 'variant', operation: 'solve-singles',
    position: { puzzle: filteredPuzzle, entries, eliminations } })
}

export type WorktableActions = { check: () => void }
type SolvedGridSession = { current: Game }
type PuzzleTask = { origin: Game; engine: EngineSession; hint: boolean }

let nextHintCollection = 0

type HintState = {
  page?: { collection: number; offset: number; available: number }
  position: HintPosition
  choices: HintChoice[]
  candidates?: number[]
  index: number
  stage: HintStage
  visuals?: 'hint' | 'player'
  error?: PuzzleHint
  recovery?: CandidateRecovery
  reviewingRemoval?: boolean
}

type CandidateDrag = {
  pointerId: number
  previous: number
  initial: Game
  cells: Set<number>
  mode: 'candidate' | 'center' | 'corner'
  digit: number
  action: 'add' | 'remove'
  temporary: boolean
  moved: boolean
  controlClick?: boolean
}

type CellPaintStroke = { gameId: string; brush: number; color: number; cells: ReadonlySet<number> }
type CellPaintDrag = CellPaintStroke & { pointerId: number; previous: number; moved: boolean }

type CandidatePress = {
  pointerId: number
  cell: number
  mask: number
  mode: CandidateDrag['mode']
  cancelled: boolean
}

function isAltClick(event: Pick<MouseEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>) {
  return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
}

function isChainStep(step?: Deduction) {
  if (!step) return false
  const { evidence, technique } = step
  return 'chain' in evidence || 'inference' in evidence || 'single-digit-chain' in evidence || 'coloring' in evidence || 'multi-coloring' in evidence ||
    ['forcing-chain', 'als-chain', 'sk-loop'].includes(technique)
}

function withRatingHints(game: Game, keys: readonly string[], applied = false, request?: Parameters<typeof addRatingHints>[3]): Game {
  if (!game.ratingAttempt) return game
  const ratingAttempt = addRatingHints(game.ratingAttempt, keys, applied, request)
  return ratingAttempt === game.ratingAttempt ? game : { ...game, ratingAttempt }
}

export function Worktable({
  game: savedGame, games, placeholder, storageAvailable = true, preferredDifficulty, modalOpen, pauseShortcutsEnabled = true, advancedModes, appearance, highlighting, errorMode, multi, actionsRef, inputSize, panelHeight, setPanelHeight,
  beginResize, toggleMulti, onShare, onExport, onPublish, onCancelDraft, onNewPuzzle, onImportPuzzle, onEditCages, onEditSizedRules, onEditRegions, onEditChainColors, onStopPlaying, onSelectPuzzle = roomStore.select, sharedOnOtherDevice, catchUpPuzzle, onMobilePuzzleTopSpaceChange,
  pausedOnLaunch = false, onResumeLaunch, loadingPuzzle = false, cellReferenceStyle, workspaceMode, showLeftPanel, showRightPanel, showBottomPanel, onOpenHintPanel, onOpenRightPanel, puzzleBrowserView, setPuzzleBrowserView,
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
  // The saved solve still owns the results. Editing the grid uses a temporary session.
  const [solvedGrid, setSolvedGrid] = useState<{ session: SolvedGridSession; game: Game } | null>(null)
  const solvedGridSession = useRef<SolvedGridSession | null>(null)
  const focusGridAfterHistory = useRef(false)
  const completed = isSolved(savedGame)
  const playground = completed && solvedGrid?.game.id === savedGame.id ? solvedGrid : null
  const session = playground?.session
  // Opening a puzzle can pause this tab without changing its cloud save.
  const launchPaused = pausedOnLaunch && !completed && savedGame.source !== 'draft'
  const game = useMemo(() => playground?.game ?? (launchPaused && !savedGame.paused ? { ...savedGame, paused: true } : savedGame),
    [playground, launchPaused, savedGame])
  const playState = useSyncExternalStore(playSession.subscribe, playSession.getSnapshot, playSession.getServerSnapshot)
  const savedPlayState = playState.puzzleId === game.id ? playState : null
  const toolPanels = savedPlayState?.toolPanels ?? defaultToolPanels
  const grid = game.grid
  const gridSize = (grid ?? CLASSIC_GRID).size
  useActionHistory(savedGame)
  const fog = useMemo(() => fogView(game.variant, game.position.entries), [game.variant, game.position.entries])
  const visibleGivens = fog?.puzzle.givens ?? game.givens
  const start = fog && !fog.cells.has(40) ? [...fog.cells].find(cell => visibleGivens[cell] === '0') ?? 40
    : visibleGivens[40] === '0' ? 40 : Math.max(0, visibleGivens.indexOf('0'))
  const modeBadgeId = useId()
  const puzzleStageId = useId()
  const [modeBadgePosition, setModeBadgePosition] = usePlayPreference('cardModeBadgePosition')
  const [pinnedActions] = usePlayPreference('pinnedActions')
  const [showKillerCombinations] = usePlayPreference('showKillerCombinations')
  const [pointerFocusedCell, setPointerFocusedCell] = useState<number | null>(null)
  const { active, selected, anchor, setActive, setSelected, setAnchor } = usePuzzleSelection(game.id, start)
  const [preferredDigit, setSelectedDigit] = usePlayPreference('selectedDigit')
  const selectedDigit = preferredDigit !== null && preferredDigit <= gridSize ? preferredDigit : null
  const digitHighlight = savedPlayState?.digitHighlight ?? defaultDigitHighlight
  const setDigitHighlight = (value: SetStateAction<typeof digitHighlight>) => playSession.set(game.id, 'digitHighlight', value)
  const highlightedDigitMask = digitHighlight.mask
  const [selectedColor, setSelectedColor] = usePlayPreference('selectedColor')
  const [colorTarget, setColorTarget] = usePlayPreference('colorTarget')
  const [colorBrush, setColorBrush] = usePlayPreference('colorBrush')
  const [lastColoredCandidate, setLastColoredCandidate] = useState<{ gameId: string; candidate: Candidate } | null>(null)
  const [desktopColorsVisible, setDesktopColorsVisible] = useState(false)
  const [desktopChainsVisible, setDesktopChainsVisible] = useState(false)
  const [desktopInputVisible, setDesktopInputVisible] = useState(false)
  const showStrongLinks = savedPlayState?.showStrongLinks ?? false
  const setShowStrongLinks = (value: SetStateAction<boolean>) => playSession.set(game.id, 'showStrongLinks', value)
  const [startDrawingOnOpen, setStartDrawingOnOpen] = useState(false)
  const drawingReturn = useRef<{ gameId: string; tab: ToolPanelTab; highlight: boolean } | null>(null)
  const [failedChainActions, setFailedChainActions] = useState<readonly DeductionAction[] | null>(null)
  const [chainColorsOpen, setChainColorsOpen] = useState(false)
  const [highlightCandidatePairs, setHighlightCandidatePairs] = usePlayPreference('highlightCandidatePairs')
  const [savedHighlightMode, setSavedHighlightMode] = usePlayPreference('highlightMode')
  const [savedPencil, setPencil] = usePlayPreference('pencil')
  const [pencilModifier, setPencilModifier] = useState(false)
  const [candidatePreviewCell, setCandidatePreviewCell] = useState<number | null>(null)
  const [candidateKind, setCandidateKind] = usePlayPreference('candidateKind')
  const [savedColorMode, setColorMode] = usePlayPreference('colorMode')
  const [savedEraseMode, setEraseMode] = usePlayPreference('eraseMode')
  const [solution, setSolution] = useState<string | null>(null)
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
  const [notes, setNotes] = useState<{
    gameId: string; values: string; eliminations?: number[]; variant?: Game['variant']; algebraic?: Game['algebraic']; sized?: Game['sized']; masks: number[] | null; failed?: boolean
  }>()
  const [hintState, setHint] = useState<HintState | null>(null)
  const [hintRevealed, setHintRevealed] = useState(false)
  const mobile = useMobileLayout()
  const desktop = !mobile
  const wasMobile = useRef(mobile)
  const [mobileRearranging, setMobileRearranging] = useState(false)
  const rearranging = mobile && mobileRearranging
  const [solutionRetry, setSolutionRetry] = useState(0)
  const [loadedSolution, setLoadedSolution] = useState<{
    id: string; identity: string; retry: number; path: SolutionPathState
  } | null>(null)
  const [focusHintRequest, setFocusHintRequest] = useState(0)
  const [focusChainsRequest, setFocusChainsRequest] = useState(0)
  const [completionActionsTarget, setCompletionActionsTarget] = useState<HTMLElement | null>(null)
  const [ratingFailed, setRatingFailed] = useState(false)
  const [singlesCheck, setSinglesCheck] = useState<{ givens: string; variant: Game['variant']; needsMore: boolean }>()
  const boardRef = useRef<HTMLDivElement>(null)
  const puzzleStageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const restoreCellFocus = useRef<number | null>(null)
  const puzzleCardRef = useRef<HTMLElement>(null)
  const puzzleGridBorderRef = useRef<HTMLDivElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const rulesButtonRef = useRef<HTMLButtonElement>(null)
  const rulesPanelRef = useRef<HTMLElement>(null)
  const focusRulesAfterDialog = useRef(false)
  const puzzleMenuPopupRef = useRef<HTMLDivElement>(null)
  const insightTabsRef = useRef<HTMLDivElement>(null)
  const activeMobileInputTabRef = useRef<HTMLButtonElement>(null)
  const focusMobileInput = useRef(false)
  const mobileToolsOpener = useRef<HTMLButtonElement | null>(null)
  const desktopToolsOpener = useRef<HTMLButtonElement | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileHintPanelRef = useRef<HTMLDivElement>(null)
  const hintReturnFocus = useRef<HTMLElement | null>(null)
  const dragSelection = useRef<{ pointerId: number; start: number; previous: number; cells: Set<number>; base: number[]; additive: boolean; moved: boolean } | null>(null)
  const candidateDrag = useRef<CandidateDrag | null>(null)
  const cellPaintDrag = useRef<CellPaintDrag | null>(null)
  const [cellPaintPreview, setCellPaintPreview] = useState<CellPaintStroke | null>(null)
  const candidatePress = useRef<CandidatePress | null>(null)
  const hoveredCell = useRef<number | null>(null)
  const suppressCellClick = useRef(false)
  const pendingDoubleClickSingle = useRef<{ index: number; digit: number; game: Game } | null>(null)
  const techniqueHintRequest = useRef(0)
  const pageRequest = useRef(0)
  const puzzleTask = useRef<PuzzleTask | null>(null)
  const hintEngine = useRef<EngineSession | null>(null)
  const candidateRefreshKey = useRef({})
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries, game.variant])
  const coloringDigit = activeHighlightDigit(values, selected, active, selectedDigit)
  const { center, corner, eliminations } = game.position
  const displayedCandidates = useMemo(() => completeCandidateMasks(game), [values, center, corner])
  const candidateDigitColors = useMemo(() => Array.from({ length: gridSize }, (_, index) => {
    const shades = new Set<number>()
    for (const candidates of Object.values(game.position.candidateColors ?? {})) {
      const color = candidates[index + 1]
      if (color) shades.add(color)
    }
    return shades.size === 1 ? [...shades][0] : null
  }), [game.position.candidateColors, gridSize])
  const { id, givens, difficulty, score, variant, algebraic, sized, generatedWithAuto, nonUnique } = game
  const puzzle = fog?.puzzle ?? variant?.puzzle
  const hintPosition = useMemo<HintPosition>(() => ({
    gameId: id, givens, values, puzzle: variant?.puzzle, grid, algebraic, sized, center, corner, eliminations,
  }), [id, givens, values, variant?.puzzle, grid, algebraic, sized, center, corner, eliminations])
  useEffect(() => () => { techniqueHintRequest.current++ }, [hintPosition])
  const conflicts = useMemo(() => conflictsOf(values, puzzle, grid, game.sized?.rules), [values, puzzle, grid, game.sized])
  const draft = game.source === 'draft'
  const mixedVariant = !grid && variant?.id === 'mixed'
  const ruleSections = useMemo(() => puzzle ? variantRuleSections(puzzle, variant?.fog) : [], [puzzle, variant?.fog])
  const solutionIdentity = useMemo(() => puzzleIdentity({ givens, variant, algebraic, grid, sized }), [givens, variant, algebraic, grid, sized])
  const { source, uniquenessProof } = game
  const verifiedOriginal = useMemo(() => hasUniquenessProof({ givens, variant, grid, source, uniquenessProof }),
    [givens, variant, grid, source, uniquenessProof])
  const savedSolution = savedPlayState?.solutionView
  const solutionView = !draft && savedSolution?.identity === solutionIdentity ? savedSolution : null
  const solutionPathRevealed = solutionView !== null && !solutionView.hidden
  const cachedSolution = loadedSolution?.id === id && loadedSolution.identity === solutionIdentity &&
    loadedSolution.retry === solutionRetry ? loadedSolution.path : null
  const solutionPath: SolutionPathState | null = solutionPathRevealed ? cachedSolution ?? { status: 'loading' } : null
  const solutionHintOpen = !game.paused && (solutionView?.hintOpen ?? false)
  // A loading draft skips solver effects but reserves the regular play UI.
  const presentationDraft = draft && !placeholder
  const candidateMode = advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
  const solved = playground ? isSolved(game) : completed
  const mobileHintOpen = mobile && hintRevealed && !draft && !solved
  const hint = hintState?.position === hintPosition ? hintState : null
  const visibleHint = hintRevealed ? hint : null
  const hintLoading = hintRevealed && busy && !visibleHint
  const hintOpen = mobileHintOpen || hintLoading || visibleHint !== null || solutionHintOpen
  const deduction = visibleHint?.choices[visibleHint.index - (visibleHint.page?.offset ?? 0)]
  const hintCount = visibleHint?.page?.available ?? visibleHint?.choices.length ?? 0
  const hintStage = visibleHint?.stage
  const recovery = visibleHint?.recovery
  const recoveryCell = recovery && cellReference(recovery.cell, cellReferenceStyle, game.difficulty ?? undefined, gridSize)
  const recoveryLocationVisible = recovery && hintStage !== 'technique'
  const recoveryHistory = visibleHint?.reviewingRemoval && recovery?.movesAgo
    ? recovery.movesAgo === 1 ? 'Your last move removed this candidate.'
      : `You removed this candidate ${recovery.movesAgo} moves ago.`
    : undefined
  const fullHint = hintStage === 'explanation'
  const hintDifficulty = deduction && techniqueDifficulties[deduction.technique]
  const hintCandidates = visibleHint?.candidates
  const techniqueStartClue = useMemo(() => {
    if (!deduction?.pattern || !deduction.actions.length || !hintCandidates || hintStage !== 'technique' || recovery || variant || grid || algebraic || sized) return undefined
    return practiceSearch({ deduction, candidates: hintCandidates, pattern: deduction.pattern }).start.text
  }, [deduction, hintCandidates, hintStage, recovery, variant, grid, algebraic, sized])
  const locationClue = useMemo(() => deduction && hintStage === 'location'
    ? hintLocation(deduction, cellReferenceStyle, hintDifficulty, grid) : undefined, [deduction, hintStage, cellReferenceStyle, hintDifficulty, grid])
  const endpointMarks = locationClue?.annotations.candidates
  const hintBoardPosition = useMemo(() => {
    if (!endpointMarks) return { center, corner }
    const hintCorner = [...corner]
    for (const [cell, marks] of endpointMarks) {
      for (const digit of marks.keys()) {
        if (!hasCandidate(center[cell], digit)) hintCorner[cell] |= 1 << (digit - 1)
      }
    }
    return { center, corner: hintCorner }
  }, [endpointMarks, center, corner])
  const hintDiagram = useMemo(() => {
    if (!fullHint || !deduction || !hintCandidates) return undefined
    return lessonDiagram({ deduction, candidates: hintCandidates }, deduction.pattern, { cellReferenceStyle, difficulty: hintDifficulty, grid })
  }, [fullHint, deduction, hintCandidates, cellReferenceStyle, hintDifficulty, grid])
  const availableHintAnnotations = hintDiagram?.annotations ?? locationClue?.annotations ?? (recoveryLocationVisible
    ? { cells: new Map([[recovery.cell, { fill: 'var(--lesson-pattern-fill)', label: 'Check candidates' }]]) }
    : undefined)
  const playerVisualsSelected = visibleHint?.visuals === 'player'
  const hintVisualsActive = !playerVisualsSelected && Boolean(deduction || recovery)
  const hintAnnotations = hintVisualsActive ? availableHintAnnotations : undefined
  const hintCopy = recovery ? {
    title: HINT_CANDIDATES_ERROR.title,
    text: hintStage === 'technique' ? 'Your placed digits match the solution. A required candidate is missing.'
      : [`Check ${recoveryCell}.`, recoveryHistory].filter(Boolean).join(' '),
  } : !deduction ? visibleHint?.error ?? NO_HINT
    : fullHint ? describeHint(deduction, { difficulty: hintDifficulty, cellReferenceStyle, gridSize })
    : {
      title: techniqueLabel(deduction.technique),
      text: hintStage === 'technique' ? techniqueStartClue ?? (lessonRoutes.get(deduction.technique)?.summary ?? '') : endpointMarks ? locationClue.text
        : [describeHintDigits(deduction), locationClue?.text].filter(Boolean).join(' '),
    }
  const showResults = completed && !playground
  const showSolvedGrid = Boolean(playground)
  const draftCages = game.position.draftCages
  const cages = algebraic?.rules ?? draftCages
  const sizedRules = sized?.rules ?? game.position.draftSizedRules
  const sizedName = cages ? ALGEBRAIC_CAGES_NAME : grid ? sizedGridName(grid) : MINI_NAME
  const needsRating = needsPuzzleGrade(game)
  const needsAttempt = !grid && !completed && !game.practiceTechnique && !game.ratingAttempt && (!variant?.fog || game.score !== null)
  const ratingPending = !draft && needsRating && !ratingFailed
  const advancedWorkspace = desktop && workspaceMode === 'advanced'
  const panelSupported = (panel: PuzzleTool) => !placeholder && !draft &&
    (panel !== 'chains' || !grid) && (panel !== 'rules' || mixedVariant)
  const panelAvailable = (panel: PuzzleTool) => panelSupported(panel) &&
    (!solved || panel === 'solution' || panel === 'techniques' || panel === 'rules' || panel === 'bookmarks')
  const openPuzzlePanels = toolPanels.open.filter(desktop ? panelSupported : panelAvailable)
  const activeToolPanel = toolPanels.active !== 'digits' && openPuzzlePanels.includes(toolPanels.active) ? toolPanels.active : 'digits'
  const advancedPanelOpen = (panel: PuzzleTool) => openPuzzlePanels.includes(panel)
  const { mounted: desktopActionsMounted, exiting: desktopActionsExiting } = usePresence(desktop && !advancedWorkspace && actionsOpen)
  const { mounted: puzzleMenuMounted, exiting: puzzleMenuExiting } = usePresence(puzzleMenuOpen)
  const openInsightTabs = desktop && !advancedWorkspace
    ? desktopInsightTabs.filter(({ id }) => openPuzzlePanels.includes(id))
    : []
  const activeDesktopTab = openInsightTabs.find(({ id }) => id === activeToolPanel) ??
    openInsightTabs.find(({ id }) => id === 'techniques') ?? openInsightTabs[0]
  const puzzleToolsAvailable = !placeholder && !draft && !solved
  const mobileToolsAvailable = mobile && puzzleToolsAvailable
  const previewing = !game.paused && !draft && !savedHighlightMode && solutionPathRevealed && solutionPath !== null &&
    (mobile ? activeToolPanel === 'solution' : advancedWorkspace ? desktopSolutionVisible : activeDesktopTab?.id === 'solution')
  const showMobileResults = mobile && showResults && !previewing
  const historyDisabled = Boolean(placeholder) || previewing || rearranging || (!showResults && game.paused)
  const disabled = historyDisabled || game.paused
  const cellColorsDisabled = draft || disabled || (solved && !showSolvedGrid)
  const puzzleControlsBelow = appearance.puzzleControlsPosition === 'bottom' && !draft && !placeholder
  const floatingPuzzleMenu = mobile || puzzleControlsBelow
  const chainsVisible = !grid && (mobile ? activeToolPanel === 'chains'
    : advancedWorkspace ? showRightPanel && desktopChainsVisible : activeDesktopTab?.id === 'chains')
  const colorsPanelOpen = openPuzzlePanels.includes('colors')
  const colorsVisible = mobile ? activeToolPanel === 'colors'
    : advancedWorkspace ? showRightPanel && desktopColorsVisible : activeDesktopTab?.id === 'colors'
  const canPaint = !cellColorsDisabled
  const mobileHintPreview = mobileHintOpen && !playerVisualsSelected
  const brush = canPaint && !hintAnnotations && !mobileHintPreview ? colorBrush : null
  const colorMode = brush === null && savedColorMode
  const eraseMode = brush === null && savedEraseMode
  const highlightMode = brush === null && savedHighlightMode
  const pencil = savedPencil && !savedHighlightMode
  const cellBrush = colorTarget === 'cell' && canPaint && !hintAnnotations && !mobileHintPreview
    ? brush ?? (colorMode ? selectedColor : null) : null
  const boardPosition = useMemo(() => {
    const position = game.position
    if (!cellPaintPreview || cellPaintPreview.gameId !== id || cellPaintPreview.brush !== cellBrush) return position
    return withCellColors(position, Array.from(cellPaintPreview.cells, cell => ({ cell, color: cellPaintPreview.color })))
  }, [game.position, cellPaintPreview, cellBrush, id])
  const chainsPanelOpen = openPuzzlePanels.includes('chains')
  const drawingIntent = savedPlayState?.drawingIntent ?? null
  const chainDrawingRequested = drawingIntent ?? (game.chainSketch?.pending != null)
  const colorsActive = brush !== null || colorMode
  // Strong-link highlighting also works directly from the puzzle footer, without opening Chains.
  const chainsActive = !colorsActive && !grid && (chainDrawingRequested || startDrawingOnOpen || showStrongLinks)
  const variantEliminations = (variant || grid) && eliminations
  const puzzleNotes = notes?.gameId === id && notes.variant === variant && notes.algebraic === algebraic && notes.sized === sized ? notes : undefined
  const currentNotes = puzzleNotes?.values === values && puzzleNotes.eliminations === variantEliminations ? puzzleNotes : undefined
  const masks = currentNotes?.masks
  const toolMasks = useMemo(() => candidateToolMasks(masks, values, displayedCandidates, eliminations),
    [masks, values, displayedCandidates, eliminations])
  const autoGenerateCandidates = advancedModes.autoGenerateCandidates && !draft && !solved && needsInitialCandidates(game)
  const hasSingles = useMemo(() => !draft && !solved && Boolean(masks &&
    singleFromCandidates(values, displayedCandidates ?? masks, eliminations, puzzle, grid, sized?.rules)),
    [draft, solved, masks, values, displayedCandidates, eliminations, puzzle, grid, sized])
  const needsSinglesCheck = !grid && !generatedWithAuto && difficulty !== 'easy'
  const offerSingles = !draft && !solved && (grid || generatedWithAuto || (
    !ratingPending && needsSinglesCheck && singlesCheck?.givens === givens && singlesCheck.variant === variant && singlesCheck.needsMore
  ))
  const showChainSketches = !colorsActive && (chainsActive || !grid && Boolean(game.chainSketch))
  const chainMasks = useMemo(() => {
    if (!showChainSketches || draft || solved) return null
    return currentNotes ? toolMasks : candidateToolMasks(puzzleNotes?.masks, values, displayedCandidates, eliminations)
  }, [showChainSketches, draft, solved, currentNotes, toolMasks, puzzleNotes, values, displayedCandidates, eliminations])
  const missingChainCandidates = chainMasks?.some((mask, cell) => !mask && values[cell] === '0')
  const chainGraph = useMemo(() => chainMasks ? makeChainGraph(chainMasks, puzzle) : null, [chainMasks, puzzle])
  const canAnalyzeChains = Boolean(masks && !missingChainCandidates && !disabled)
  const playerHighlightMask = colorMode || eraseMode ? 0 : highlightedDigitMask
  const startHighlightDigit = playerHighlightMask ? onlyCandidate(playerHighlightMask) : coloringDigit
  const sketch = useChainSketch(game, chainGraph, {
    canDraw: chainsActive && !completed, graphCurrent: Boolean(masks), canAnalyze: canAnalyzeChains, startHighlightDigit,
    drawingIntent: savedHighlightMode || colorsActive ? false : drawingIntent,
    setDrawingIntent: intent => playSession.set(id, 'drawingIntent', intent),
  })
  const selectedChainCandidates = useMemo(() => sketch.grouping ? sketch.groupSelection.map(chainCandidate)
    : sketch.pending === null ? [] : chainNodeCandidates(sketch.pending), [sketch.grouping, sketch.groupSelection, sketch.pending])
  const canApplyChainEdits = chainsPanelOpen && Boolean(chainMasks && canAnalyzeChains && sketch.allActions.length)
  const canApplyHintEdit = fullHint && !recovery && Boolean(deduction && hintCandidates) && (!advancedWorkspace || showBottomPanel)
  const chainHighlightDigit = sketch.active.highlightedDigit
  const strongLinkMask = highlightedDigitMask || (coloringDigit === null ? 0 : 1 << (coloringDigit - 1))
  const strongLinksVisible = !savedHighlightMode && brush === null && showStrongLinks && chainsActive && canAnalyzeChains && !hintVisualsActive
  const strongLinks = useStrongLinkOverlay(strongLinksVisible ? chainGraph : null, strongLinkMask, sketch.annotations,
    sketch.colorPairs, sketch.usedColorPairs, sketch.assignedColors)
  const browsingStrongLinks = strongLinksVisible && !sketch.drawing
  const candidateBrush = colorTarget === 'candidate' && !cellColorsDisabled && !sketch.drawing && !hintAnnotations && !mobileHintPreview
    ? colorMode ? selectedColor : brush : null
  const paintingCandidates = candidateBrush !== null
  const colorPreviewColor = colorTarget === 'cell' ? cellBrush : candidateBrush
  const colorPreview = colorPreviewColor !== null && colorPreviewColor > 0 && !sketch.drawing && !browsingStrongLinks
    ? { target: colorTarget, color: colorPreviewColor } : undefined
  const colorLinkMasks = displayedCandidates && toolMasks &&
    !toolMasks.some((mask, cell) => values[cell] === '0' && !mask) ? toolMasks : null
  const paintedStart = lastColoredCandidate?.gameId === id && lastColoredCandidate.candidate.cell === active
    ? lastColoredCandidate.candidate : null
  const colorStartCell = selected.length > 1 ? null : selected[0] ?? active
  const colorStartDigit = colorTarget === 'candidate' && !selected.length && paintedStart ? paintedStart.digit : coloringDigit
  const colorStart = useMemo(() => colorStartCell !== null && colorStartDigit
    ? { cell: colorStartCell, digit: colorStartDigit } : null, [colorStartCell, colorStartDigit])
  const colorContinuation = useMemo(() => COLOR_GROUP_CONTINUATION_ENABLED && !grid && colorsVisible && colorLinkMasks && colorStart
    ? continueStrongLinkColors(colorLinkMasks, colorStart, game.position, colorTarget, puzzle) : null,
  [COLOR_GROUP_CONTINUATION_ENABLED, colorsVisible, colorLinkMasks, colorStart, game.position, colorTarget, puzzle, grid])
  const colorStartLocation = colorStart && cellReference(colorStart.cell, cellReferenceStyle, game.difficulty ?? undefined, gridSize)
  const colorConflict = colorContinuation?.conflicts[0]
  const colorConflictLocation = colorConflict && cellReference(colorConflict.cell, cellReferenceStyle, game.difficulty ?? undefined, gridSize)
  const remainingColors = colorContinuation?.marks.length ?? 0
  const colorSubject = colorTarget === 'cell' ? 'cell' : 'candidate'
  const canContinueColorGroup = colorContinuation?.status === 'ready'
  const colorGroupMessage = selected.length > 1 ? 'Select one starting cell to continue its group.'
    : !colorStart ? colorTarget === 'candidate' ? 'Color a starting candidate, then continue its group.' : undefined
    : !displayedCandidates ? 'Generate candidates in every empty cell first.'
    : masks === undefined ? 'Loading candidates…'
    : !colorLinkMasks ? 'Check the grid and candidates before coloring links.'
    : colorContinuation?.status === 'uncolored' ? colorTarget === 'cell'
      ? `Color ${colorStartLocation} to start a group for ${colorStart.digit}.`
      : `Color ${colorStart.digit} in ${colorStartLocation} to start a group.`
    : colorContinuation?.status === 'missing-candidate' ? undefined
    : colorContinuation?.status === 'no-links' ? undefined
    : colorContinuation?.status === 'link-conflict' ? 'This group cannot alternate shades. Check its candidates.'
    : colorConflict ? `The color at ${colorConflictLocation} conflicts with this group. Adjust or erase that color.`
    : colorContinuation?.status === 'complete' ? `The group for ${colorStart.digit} at ${colorStartLocation} is fully colored.`
    : `Continue ${colorStart.digit} from ${colorStartLocation}: ${remainingColors} more ${colorSubject}${remainingColors === 1 ? '' : 's'}.`
  const canActivateTemporaryPencil = !pencil && !highlightMode && !colorMode && !eraseMode &&
    !disabled && !draft && !solved && !sketch.drawing && brush === null && !modalOpen && !mobileHintPreview &&
    !puzzleMenuOpen && !actionsOpen && !dialogResult && !resetOpen && !confirmCandidatesOpen && !variantRulesOpen
  const temporaryPencil = pencilModifier && canActivateTemporaryPencil
  const pencilActive = (pencil || temporaryPencil) && brush === null && !colorMode && !eraseMode
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencilActive ? candidateMode : 'value'
  const penOrPencil = !draft && !highlightMode && !colorMode && !eraseMode && brush === null
  const givenHighlightSelection = penOrPencil && onlyGivensSelected(visibleGivens, selected)
  const hasInputSelection = selected.length > 0 && !givenHighlightSelection
  const cellDrivenHighlight = givenHighlightSelection || (penOrPencil && !selectedDigit && !highlightedDigitMask &&
    selected.length === 1 && values[selected[0]] !== '0')
  const canEditPencil = !disabled && !draft && pencilActive && !highlightMode &&
    !paintingCandidates && !sketch.drawing && !browsingStrongLinks && !hintAnnotations
  const pencilGroup = canEditPencil ? highlightedDigitMask & ((1 << gridSize) - 1) : 0
  const canDragCandidates = canEditPencil && !pencilGroup && !multi && selectedDigit !== null && selectedDigit > 0
  const canSelectCellsByDrag = canStartCellSelectionDrag({
    highlightMode, penOrPencil: penOrPencil && !sketch.drawing && !browsingStrongLinks && !hintAnnotations, selectedDigit,
  })
  const pencilPreviewMask = pencilGroup || (canDragCandidates && selectedDigit ? 1 << (selectedDigit - 1) : 0)
  const canPreviewCandidates = Boolean(pencilPreviewMask) && (Boolean(pencilGroup) || selected.length === 0) && !solved &&
    !modalOpen && !mobileHintPreview && !puzzleMenuOpen && !actionsOpen && !dialogResult && !resetOpen && !confirmCandidatesOpen &&
    !variantRulesOpen
  const canHighlightCellCandidates = !disabled && !draft && !solved && !colorMode && !eraseMode && !sketch.drawing && brush === null &&
    !paintingCandidates && !modalOpen && !hintAnnotations && !mobileHintPreview && !puzzleMenuOpen && !actionsOpen && !dialogResult &&
    !resetOpen && !confirmCandidatesOpen && !variantRulesOpen
  const cellHold = useTouchHold(mobile && canHighlightCellCandidates)
  const cancelCellHold = cellHold.cancel
  useLayoutEffect(() => cancelCellHold, [cancelCellHold, hintPosition])
  const puzzleZoom = usePuzzleZoom(mobile && !draft && !disabled && !solved, id, () => {
    cancelCellHold()
    candidatePress.current = null
    dragSelection.current = null
    pendingDoubleClickSingle.current = null
    setCandidatePreviewCell(null)
  })
  const trace = solutionPath?.status === 'ready' ? solutionPath.trace : undefined
  const solutionStep = Math.min(solutionView?.step ?? 0, trace ? solutionEndIndex(trace) : 0)
  const exactPosition = trace && 'exactPosition' in trace && solutionStep > trace.steps.length ? trace.exactPosition : undefined
  const previewPosition = exactPosition ?? trace?.positions?.[solutionStep]
  const exactFogSolution = trace && 'exact' in trace && trace.exact && solutionStep === trace.steps.length
  const solutionFog = previewing && !exactFogSolution ? fogView(variant, previewPosition?.entries) : undefined
  const replayedSolutionStep = useMemo(() => trace && replayStep(trace, solutionStep), [trace, solutionStep])
  const solutionStepDifficulty = replayedSolutionStep ? techniqueDifficulties[replayedSolutionStep.deduction.technique] : undefined
  const stepDiagram = useMemo(() => {
    const step = replayedSolutionStep
    if (!step?.before.candidates || !step.before.pattern) return undefined
    return lessonDiagram({ deduction: step.deduction, candidates: step.before.candidates }, step.before.pattern,
      { cellReferenceStyle, difficulty: solutionStepDifficulty, grid })
  }, [replayedSolutionStep, cellReferenceStyle, solutionStepDifficulty, grid])
  const chainInspection = previewing && replayedSolutionStep && isChainStep(replayedSolutionStep.deduction)
    ? { deduction: replayedSolutionStep.deduction, links: stepDiagram?.annotations.links ?? [], explanation: stepDiagram?.reason,
      cellReferenceStyle, difficulty: solutionStepDifficulty }
    : undefined
  const solutionHintCopy = replayedSolutionStep
    ? describeHint(replayedSolutionStep.deduction, {
      difficulty: solutionStepDifficulty, cellReferenceStyle, gridSize,
    })
    : exactPosition ? verifiedSolutionSummary
      : trace && solutionStep === trace.steps.length
        ? solutionEndSummary(solutionStatus(trace), exactFogSolution || undefined)
        : null

  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  const showElapsedTime = timing.showTimer && !game.timeUntracked && (timing.trackTime || completed)
  usePuzzleTimer(game.id, !rearranging && timing.trackTime && !game.timeUntracked && !draft && game.started && !game.paused && !completed && !modalOpen && !puzzleMenuOpen && !actionsOpen && !previewing && dialogResult === null &&
    !resetOpen && !confirmCandidatesOpen && !cancelDraftOpen && !variantRulesOpen && !chainColorsOpen, (seconds, puzzleId) => {
    roomStore.advanceElapsed(puzzleId, seconds)
  }, puzzleId => roomStore.flushElapsed(puzzleId))

  function openSolvedGrid(position = savedGame) {
    const game = { ...position, paused: false }
    const session = { current: game }
    solvedGridSession.current = session
    setSolvedGrid({ session, game })
  }

  function toggleSolvedView() {
    if (showSolvedGrid) {
      solvedGridSession.current = null
      setSolvedGrid(null)
    } else openSolvedGrid()
  }

  function readWorkingGame() {
    if (session) return solvedGridSession.current === session ? session.current : undefined
    return roomStore.getSnapshot().games.find(item => item.id === id)
  }

  const updateWorkingGame = useCallback((transform: (current: Game) => Game) => {
    if (session) {
      if (solvedGridSession.current !== session) return
      const next = transform(session.current)
      if (next !== session.current) {
        session.current = next
        setSolvedGrid({ session, game: next })
      }
    } else if (!completed) {
      roomStore.update(id, current => isSolved(current) ? current : transform(current), {
        chainCandidates(current) {
          if (!puzzleNotes?.masks || current.grid || current.givens !== givens || current.variant !== variant ||
            (variant && current.position.eliminations !== puzzleNotes.eliminations)) return null
          const currentValues = valuesOf(current)
          if (currentValues !== puzzleNotes.values) return null
          return candidateToolMasks(puzzleNotes.masks, currentValues, completeCandidateMasks(current), current.position.eliminations)
        },
      })
    }
  }, [completed, givens, id, puzzleNotes, session, variant])

  const cancelHintWork = useCallback(() => {
    techniqueHintRequest.current++
    pageRequest.current++
    hintEngine.current?.close()
    hintEngine.current = null
    if (puzzleTask.current?.hint) {
      puzzleTask.current.engine.close()
      puzzleTask.current = null
      setBusy(false)
    }
  }, [])

  const cancelPendingPuzzleWork = useCallback(() => {
    const task = puzzleTask.current
    if (!task) return
    if (task.hint) {
      cancelHintWork()
      setHintRevealed(false)
    } else {
      task.engine.close()
      puzzleTask.current = null
      setBusy(false)
    }
  }, [cancelHintWork])

  const cancelPuzzleWork = useCallback(() => {
    cancelPendingPuzzleWork()
    cancelHintWork()
  }, [cancelPendingPuzzleWork, cancelHintWork])

  // Pending actions belong to the full board revision, including colors and
  // undo history. Clock ticks and rating metadata do not invalidate them.
  useLayoutEffect(() => cancelPendingPuzzleWork, [cancelPendingPuzzleWork, id, game.source, givens, variant, grid, algebraic, sized,
    game.position, game.past, game.future, session])
  // Completed hint pages remain valid after color-only edits. Their worker is
  // retained only while the hint inputs, puzzle rules, and play session match.
  useLayoutEffect(() => () => {
    cancelHintWork()
    setHint(null)
    setHintRevealed(false)
  }, [cancelHintWork, id, game.source, givens, variant, grid, algebraic, sized, hintPosition, session])
  useLayoutEffect(() => {
    if (!hintRevealed) cancelHintWork()
  }, [hintRevealed, cancelHintWork])
  useLayoutEffect(() => {
    if (!disabled) return
    cancelPuzzleWork()
    setHintRevealed(false)
  }, [disabled, cancelPuzzleWork])

  function beginPuzzleTask(hint = false, isolated = true): PuzzleTask {
    if (hint) cancelHintWork()
    const abort = new AbortController()
    const engine: EngineSession = isolated ? createEngineSession() : {
      run: (request, options) => runEngine(request, { ...options, signal: abort.signal }),
      close: () => abort.abort(),
    }
    const task = { origin: game, engine, hint }
    puzzleTask.current = task
    if (hint) hintEngine.current = engine
    setBusy(true)
    return task
  }

  function currentTaskGame(task: PuzzleTask) {
    const current = readWorkingGame()
    return puzzleTask.current === task && canApplyPuzzleResult(task.origin, current) ? current : undefined
  }

  function finishPuzzleTask(task: PuzzleTask, keepHintCollection = false) {
    if (!keepHintCollection || puzzleTask.current !== task) {
      task.engine.close()
      if (hintEngine.current === task.engine) hintEngine.current = null
    }
    if (puzzleTask.current === task) {
      puzzleTask.current = null
      setBusy(false)
    }
  }

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
      roomStore.update(id, (current) => isSolved(current) ? current : markSolveUntimed(current))
    }
  }, [completed, draft, game.started, game.timeUntracked, id, timing.trackTime])

  const markHintVisible = useCallback(() => {
    if (!deduction || previewing || completed) return
    roomStore.update(id, (current) => {
      if (isSolved(current) || !matchesHintPosition(current, hintPosition)) return current
      const removals = hintEliminations(hintPosition.values, completeCandidateMasks(current), current.position.eliminations)
      void observeTechniqueActions(current, deduction.actions, 'hint', removals)
      return withRatingHints(current, [hintKey(deduction.actions)], false, {
        at: Date.now(), position: `${hintPosition.values}:${removals?.join(',') ?? ''}`,
      })
    })
  }, [completed, deduction, hintPosition, id, previewing])

  const markSolutionVisible = useCallback(() => {
    if (completed) return
    if (!grid) markTechniqueSolution({ givens, variant })
    roomStore.finishRatingAttempt(id, 'solution')
  }, [completed, givens, id, variant, grid])

  useLayoutEffect(() => {
    puzzleCardRef.current?.closest<HTMLElement>('.dock-puzzle-panel')?.scrollTo(0, 0)
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
    setHintRevealed(false)
    hintReturnFocus.current = null
    setStartDrawingOnOpen(false)
    solvedGridSession.current = null
    setSolvedGrid(null)
    setRatingFailed(false)
    dragSelection.current = null
    candidateDrag.current = null
    cellPaintDrag.current = null
    setCellPaintPreview(null)
    candidatePress.current = null
    hoveredCell.current = null
    setCandidatePreviewCell(null)
    suppressCellClick.current = false
  }, [game.id, game.source])

  useGridClickAway(boardRef, () => { if (!rearranging) setSelected([]) }, (target) => Boolean(
    target.closest('[data-panel-editor], .desktop-layout-edge, .desktop-layout-divider, .puzzle-mode-tab, .desktop-insight-panel, .mobile-input-toolbar, .mobile-input-resize, .input-tools, .chains-panel, .bookmarks-panel')
      || target.closest('.puzzle-menu-wrap, .desktop-dock .dv-tab')
      || target.closest('.controls, .cell-color-palette, .hint-dock, .solution-path, .puzzle-actions-sheet, .desktop-actions-menu, .puzzle-quick-actions')
      && target.closest('button, input, select, textarea, a, [role="separator"]'),
  ))

  useLayoutEffect(() => {
    const menu = actionsMenuRef.current
    const button = actionsMenuButtonRef.current
    if (mobile || advancedWorkspace || !desktopActionsMounted || !menu || !button) return

    // Use the browser's top layer so the input stack cannot clip the menu.
    menu.showPopover?.()
    const position = () => {
      const anchor = button.getBoundingClientRect()
      // The anchor is measured in viewport pixels, while fixed offsets inherit the page zoom.
      const scale = Number(getComputedStyle(menu).getPropertyValue('--desktop-layout-scale')) || 1
      const width = menu.offsetWidth * scale
      const gap = 8
      const right = Math.min(anchor.right, window.innerWidth - gap)
      const left = Math.max(gap, right - width)
      const top = Math.min(anchor.top, window.innerHeight - gap)
      menu.style.left = `${left / scale}px`
      menu.style.top = `${top / scale}px`
      menu.style.maxHeight = `${Math.max(0, window.innerHeight - top - gap) / scale}px`
      menu.style.transformOrigin = 'top right'
    }
    position()
    const workspace = menu.closest('main')
    const inputPanel = menu.closest('.standard-input-stack')
    const observer = new ResizeObserver(position)
    if (workspace) observer.observe(workspace)
    if (inputPanel) observer.observe(inputPanel)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [desktopActionsMounted, mobile, advancedWorkspace, offerSingles])

  useLayoutEffect(() => {
    const menu = puzzleMenuPopupRef.current
    const button = puzzleMenuButtonRef.current
    if (!floatingPuzzleMenu || !puzzleMenuMounted || !menu || !button) return

    menu.showPopover?.()
    const position = () => {
      const anchor = button.getBoundingClientRect()
      const gap = 8
      const scale = Number(getComputedStyle(menu).getPropertyValue('--desktop-layout-scale')) || 1
      const below = window.innerHeight - anchor.bottom - 2 * gap
      const above = anchor.top - 2 * gap
      const menuHeight = (menu.scrollHeight + 2) * scale
      const opensAbove = puzzleControlsBelow ? above > 0 && above >= Math.min(below, menuHeight) : menuHeight > below && above > below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below) / scale}px`
      const right = Math.min(anchor.right, window.innerWidth - gap)
      const height = menu.offsetHeight * scale
      const top = opensAbove ? anchor.top - gap - height : anchor.bottom + gap
      menu.style.left = `${Math.max(gap, right - menu.offsetWidth * scale) / scale}px`
      menu.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - height - gap)) / scale}px`
      menu.style.transformOrigin = opensAbove ? 'bottom right' : 'top right'
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      menu.removeAttribute('style')
    }
  }, [floatingPuzzleMenu, puzzleControlsBelow, puzzleMenuMounted])

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

  const requestSolution = useEffectEvent((run: EngineRunner) => puzzleSolution(game, run))
  useEffect(() => {
    if (game.paused || !solutionPathRevealed || cachedSolution) return
    let current = true
    const engine = createEngineSession()
    const finish = (path: SolutionPathState) => {
      if (current) setLoadedSolution({ id, identity: solutionIdentity, retry: solutionRetry, path })
    }
    void requestSolution(engine.run).then(result => {
      if (result.positions?.length !== result.steps.length + 1) throw new Error('Missing solution positions')
      finish({ status: 'ready', trace: result })
    }).catch((error: unknown) => finish({
      status: 'unavailable',
      message: error instanceof EngineError && error.code === 'search-limit'
        ? 'The solver reached its search limit before finding a path.'
        : 'The solution couldn’t load.',
    })).finally(() => engine.close())
    return () => { current = false; engine.close() }
  }, [id, game.paused, solutionIdentity, solutionPathRevealed, solutionRetry, cachedSolution])

  useEffect(() => {
    if (draft || game.paused || !needsRating && !needsAttempt) return
    let current = true
    const engine = createEngineSession()
    void ratePuzzle(givens, variant, engine.run, nonUnique).then((grade) => {
      if (!current) return
      roomStore.update(id, (latest) => latest.givens === givens && latest.variant === variant ? applyPuzzleGrade(latest, grade) : latest, { derived: true })
    }).catch(() => {
      if (current) setRatingFailed(true)
    }).finally(() => engine.close())
    return () => { current = false; engine.close() }
  }, [id, givens, draft, game.paused, needsAttempt, needsRating, nonUnique, variant])

  useEffect(() => {
    if (draft || solved || game.paused || !needsSinglesCheck) return
    let current = true
    const engine = createEngineSession()
    const check = variant
      ? solveSingleValues({ variant }, givens, undefined, undefined, engine.run, advancedModes.solveSinglesVariants).then((board) => board.includes('0'))
      : engine.run({ type: 'rate', values: givens, techniqueOrder: SINGLE_TECHNIQUES }).then(({ status }) => status === 'stalled')
    void check.then((needsMore) => {
      if (current) setSinglesCheck({ givens, variant, needsMore })
    }).catch(() => { /* Leave the action hidden when the starting puzzle cannot be checked. */ }).finally(() => engine.close())
    return () => { current = false; engine.close() }
  }, [advancedModes.solveSinglesVariants, draft, game.paused, givens, needsSinglesCheck, solved, variant])

  useEffect(() => {
    if (!autoGenerateCandidates || !masks || disabled) return
    updateWorkingGame((current) => !current.paused && current.givens === givens && valuesOf(current) === values && needsInitialCandidates(current)
      ? replaceCandidates(current, masks, { recordHistory: false })
      : current)
  }, [advancedModes.generateCandidateVariants, autoGenerateCandidates, disabled, givens, masks, updateWorkingGame, values])

  useEffect(() => {
    let current = true
    if (draft || solved || game.paused) return
    const abort = new AbortController()
    const run: EngineRunner = (request, options) => runEngine(request, {
      ...options, latestKey: candidateRefreshKey.current, signal: abort.signal,
    })

    void playCandidates(game, run, advancedModes.generateCandidateVariants).then((masks) => {
      if (current) setNotes({ gameId: id, values, eliminations: variantEliminations, variant, algebraic, sized, masks })
    }).catch(() => {
      if (current) setNotes({ gameId: id, values, eliminations: variantEliminations, variant, algebraic, sized, masks: null, failed: true })
    })

    return () => { current = false; abort.abort() }
  }, [id, draft, solved, game.paused, values, variant, algebraic, sized, variantEliminations, grid])

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
    if (!focusMobileInput.current) return
    focusMobileInput.current = false
    const opener = mobileToolsOpener.current
    const target = activeMobileInputTabRef.current ?? (opener?.isConnected ? opener : puzzleMenuButtonRef.current)
    target?.focus({ preventScroll: true })
  }, [toolPanels])

  useLayoutEffect(() => {
    if (!mobile) return
    const stage = puzzleStageRef.current
    const markPointer = () => stage?.setAttribute('data-pointer-input', '')
    const markKeyboard = () => stage?.removeAttribute('data-pointer-input')
    document.addEventListener('pointerdown', markPointer, true)
    document.addEventListener('keydown', markKeyboard, true)
    return () => {
      document.removeEventListener('pointerdown', markPointer, true)
      document.removeEventListener('keydown', markKeyboard, true)
      markKeyboard()
    }
  }, [mobile])

  useLayoutEffect(() => {
    if (paintingCandidates) {
      if (!puzzleMenuOpen && !puzzleStageRef.current?.hasAttribute('data-pointer-input') &&
        !document.activeElement?.closest('.hint-card-visuals, .input-tools-menu')) {
        boardRef.current?.querySelector<HTMLElement>('.paint-candidate[tabindex="0"]')?.focus({ preventScroll: true })
      }
    } else if (restoreCellFocus.current !== null) {
      boardRef.current?.querySelector<HTMLElement>(`[data-cell="${restoreCellFocus.current}"]`)?.focus({ preventScroll: true })
      restoreCellFocus.current = null
    }
  }, [paintingCandidates])

  useEffect(() => {
    techniqueHintRequest.current++
    setHint(null)
    setHintRevealed(false)
  }, [hintPosition])

  useEffect(() => {
    if (!hintOpen) return
    function closeHint(event: KeyboardEvent) {
      if (rearranging || event.defaultPrevented || event.key !== 'Escape' ||
        (event.target instanceof HTMLElement && event.target.closest('dialog[open]'))) return
      if (solutionHintOpen) setSolutionHintOpen(false)
      else setHintRevealed(false)
    }
    window.addEventListener('keydown', closeHint)
    return () => window.removeEventListener('keydown', closeHint)
  }, [hintOpen, solutionHintOpen, rearranging])

  useEffect(() => {
    if (mobileHintOpen) {
      mobileHintPanelRef.current?.querySelector<HTMLButtonElement>('.hint-card-close')?.focus({ preventScroll: true })
    } else if (hintReturnFocus.current) {
      const opener = hintReturnFocus.current
      hintReturnFocus.current = null
      if (!solved) {
        const target = opener.isConnected && !opener.closest('[inert]') ? opener
          : activeMobileInputTabRef.current ?? actionsMenuButtonRef.current
        target?.focus({ preventScroll: true })
      }
    }
  }, [mobileHintOpen, solved])

  useEffect(() => {
    if (!completed) {
      solvedGridSession.current = null
      setSolvedGrid(null)
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
    function clearPencilModifier() { setPencilModifier(false) }

    window.addEventListener('keyup', releasePencilModifier)
    window.addEventListener('blur', clearPencilModifier)
    return () => {
      window.removeEventListener('keyup', releasePencilModifier)
      window.removeEventListener('blur', clearPencilModifier)
    }
  }, [])

  const finishCellPaint = useEffectEvent((stroke: CellPaintDrag, canceled: boolean) => {
    setCellPaintPreview(null)
    if (canceled || !stroke.moved || stroke.gameId !== id || stroke.brush !== cellBrush) return
    edit((current) => paintCells(current, [...stroke.cells].map(cell => ({ cell, color: stroke.color }))))
  })

  useEffect(() => {
    function finishGridPointer(event: PointerEvent) {
      const press = candidatePress.current
      if (press?.pointerId === event.pointerId) {
        press.cancelled ||= event.type === 'pointercancel' || gridCellAtPoint(boardRef.current, event) !== press.cell
        setCandidatePreviewCell(null)
      }
      let suppressClick = false
      if (cellPaintDrag.current?.pointerId === event.pointerId) {
        const stroke = cellPaintDrag.current
        cellPaintDrag.current = null
        suppressClick = stroke.moved
        finishCellPaint(stroke, event.type === 'pointercancel')
      }
      if (dragSelection.current?.pointerId === event.pointerId) {
        suppressClick = dragSelection.current.moved
        dragSelection.current = null
      }
      if (candidateDrag.current?.pointerId === event.pointerId) {
        const { moved, temporary } = candidateDrag.current
        suppressClick ||= moved || (temporary && !event.ctrlKey && !event.metaKey)
        candidateDrag.current = null
      }
      if (!suppressClick) return
      suppressCellClick.current = true
      window.setTimeout(() => { suppressCellClick.current = false }, 100)
    }

    window.addEventListener('pointerup', finishGridPointer)
    window.addEventListener('pointercancel', finishGridPointer)
    return () => {
      window.removeEventListener('pointerup', finishGridPointer)
      window.removeEventListener('pointercancel', finishGridPointer)
    }
  }, [])

  useEffect(() => {
    const press = candidatePress.current
    if (canPreviewCandidates && (!press || (press.mask === pencilPreviewMask && press.mode === candidateMode))) {
      if (temporaryPencil && !press) setCandidatePreviewCell(hoveredCell.current)
      return
    }
    if (press) press.cancelled = true
    setCandidatePreviewCell(null)
  }, [canPreviewCandidates, candidateMode, pencilPreviewMask, temporaryPencil])

  const showSolutionErrors = errorMode === 'all' || errorMode === 'incorrect'
  useEffect(() => {
    let current = true
    const engine = createEngineSession()
    setSolution(showSolutionErrors ? sized?.solution ?? algebraic?.solution ?? variant?.solution ?? null : null)
    if (!draft && !game.paused && showSolutionErrors && !variant && !algebraic && !sized) {
      void (grid ? solveMini(game.givens, engine.run) : engine.run({ type: 'solve', values: game.givens }))
        .then((result) => { if (current) setSolution(result) })
        .catch(() => { /* Checking still works if the solution cannot be loaded. */ }).finally(() => engine.close())
    }
    return () => { current = false; engine.close() }
  }, [draft, game.givens, game.paused, showSolutionErrors, variant, algebraic, sized, grid])

  const errors = useMemo(() => {
    const result = new Set<number>()
    if (errorMode === 'none' || draft) return result
    if (errorMode === 'conflicts') return conflicts
    if (errorMode === 'all') conflicts.forEach((index) => result.add(index))
    if (showSolutionErrors && solution && !nonUnique) {
      for (let index = 0; index < game.position.entries.length; index++) {
        if (game.position.entries[index] !== '0' && values[index] !== solution[index]) result.add(index)
      }
    }
    return result
  }, [conflicts, draft, errorMode, game.position.entries, nonUnique, showSolutionErrors, solution, values])

  const nakedSinglesRequest = useRef(0)
  const nakedSinglesAbort = useRef<AbortController | null>(null)
  useLayoutEffect(() => () => {
    nakedSinglesRequest.current++
    nakedSinglesAbort.current?.abort()
    nakedSinglesAbort.current = null
  }, [advancedModes.autoPlaceNakedSingles, advancedModes.autoRemoveCandidates, advancedModes.autoRemoveCandidateVariants, disabled, id, modalOpen, session])

  function edit(transform: (current: Game) => Game, kind: ActionKind = transform === undo ? 'undo' : transform === redo ? 'redo' : 'edit',
    options?: { technique?: string; actions?: readonly DeductionAction[] }) {
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

  function saveBookmark(name: string) {
    const bookmark = createPuzzleBookmark({ ...game, bookmarks: savedGame.bookmarks }, name)
    const identity = puzzleIdentity(game)
    roomStore.update(id, current => current.source !== 'draft' && puzzleIdentity(current) === identity &&
      !current.bookmarks?.some(item => item.id === bookmark.id)
      ? { ...current, bookmarks: [bookmark, ...(current.bookmarks ?? [])] } : current)
  }

  function deleteBookmark(bookmarkId: string) {
    roomStore.update(id, current => {
      if (!current.bookmarks) return current
      const bookmarks = current.bookmarks.filter(bookmark => bookmark.id !== bookmarkId)
      return bookmarks.length === current.bookmarks.length ? current
        : { ...current, bookmarks: bookmarks.length ? bookmarks : undefined }
    })
  }

  function restoreBookmark(bookmarkId: string) {
    if (session || showResults) {
      const bookmark = savedGame.bookmarks?.find(item => item.id === bookmarkId)
      if (!bookmark) return
      if (session) edit(current => restorePuzzleBookmark(current, bookmark), 'bookmark')
      else {
        const next = restorePuzzleBookmark(savedGame, bookmark)
        focusGridAfterHistory.current = true
        openSolvedGrid(recordAction(savedGame, next, 'bookmark'))
      }
    } else edit(current => {
      const bookmark = current.bookmarks?.find(item => item.id === bookmarkId)
      return bookmark && !current.paused ? restorePuzzleBookmark(current, bookmark) : current
    }, 'bookmark')
  }

  function enterFromInput(cells: number[], digit: number, inputMode: Mode, options?: EnterOptions) {
    if (inputMode === 'color') changeHintVisuals('player')
    let placement: Game | undefined
    edit((current) => {
      const origin = current
      const next = enter(origin, cells, inputMode, digit, {
        removeCandidates: advancedModes.autoRemoveCandidates,
        variantRules: advancedModes.autoRemoveCandidateVariants,
        ...options,
      })
      const actions = playerActions(origin, next, cells, inputMode, digit)
      if (actions.length && !completed) void observeTechniqueActions(origin, actions, 'independent',
        hintEliminations(valuesOf(origin), completeCandidateMasks(origin), origin.position.eliminations, gridSize))
      if (advancedModes.autoPlaceNakedSingles && !draft && !completed && !next.paused && inputMode === 'value' && digit &&
        cells.some(cell => next.position.entries[cell] === String(digit) && origin.position.entries[cell] !== String(digit))) placement = next
      return next
    })
    if (placement) void placeNakedSingles(placement)
  }

  async function placeNakedSingles(origin: Game) {
    const request = ++nakedSinglesRequest.current
    nakedSinglesAbort.current?.abort()
    const abort = new AbortController()
    nakedSinglesAbort.current = abort
    const entered = valuesOf(origin)
    if (isSolved(origin) || conflictsOf(entered, playVariantPuzzle(origin.variant, origin.position.entries), origin.grid, origin.sized?.rules).size) return
    try {
      const run: EngineRunner = (request, options) => runEngine(request, { ...options, signal: abort.signal })
      const available = await playCandidates(origin, run, advancedModes.solveSinglesVariants)
      if (request !== nakedSinglesRequest.current || !available || available.some((mask, cell) => entered[cell] === '0' && !mask)) return
      const placements = available.flatMap((mask, cell) => {
        const digit = entered[cell] === '0' ? onlyCandidate(mask) : null
        return digit === null ? [] : [{ place: { cell, digit } }]
      })
      if (!placements.length) return
      const result = [...entered]
      for (const { place } of placements) result[place.cell] = String(place.digit)
      const filled = result.join('')
      if (conflictsOf(filled, playVariantPuzzle(origin.variant, origin.position.entries), origin.grid, origin.sized?.rules).size) return
      updateWorkingGame((current) => {
        if (!canApplyPuzzleResult(origin, current)) return current
        const next = recordAction(current, fillEntries(current, filled, advancedModes.autoRemoveCandidates,
          advancedModes.autoRemoveCandidateVariants), 'singles')
        void observeTechniqueActions(current, placements, 'automated')
        return current.ratingAttempt ? { ...next, ratingAttempt: addSinglesAssistance(current.ratingAttempt, 'partial') } : next
      })
    } catch { /* The player's move remains saved if the engine cannot find candidates. */ }
    finally { if (nakedSinglesAbort.current === abort) nakedSinglesAbort.current = null }
  }

  function setStrongLinkHighlights(mask: number) {
    setSelected([])
    setColorBrush(null)
    setColorMode(false)
    showDigitHighlights(mask, 'any')
  }

  function toggleStrongLinks() {
    if (!showStrongLinks) {
      setColorBrush(null)
      setColorMode(false)
      setEraseMode(false)
      if (savedHighlightMode) setSavedHighlightMode(false)
      changeHintVisuals('player')
    }
    setStartDrawingOnOpen(false)
    if (sketch.drawing) sketch.suspend()
    setShowStrongLinks(current => !current)
  }

  function toggleStrongLinkDigit(digit: number) {
    setStrongLinkHighlights(strongLinkMask ^ (1 << (digit - 1)))
  }

  function selectStrongLinkCandidate(candidate: Candidate) {
    if (sketch.drawing && !sketch.active.hidden && (sketch.grouping || sketch.pending !== null || sketch.contains(candidate))) sketch.select(candidate)
    else startStrongLinkChain(candidate)
  }

  function startStrongLinkChain(candidate: Candidate) {
    sketch.beginAt(candidate, strongLinks.component(candidate))
  }

  function toggleChainHighlight(digit: number) {
    if (strongLinksVisible) {
      const mask = digit === 0 ? 0 : 1 << (digit - 1)
      setStrongLinkHighlights(strongLinkMask === mask ? 0 : mask)
      return
    }
    sketch.setHighlightedDigit(digit === 0 || chainHighlightDigit === digit ? null : digit)
  }

  function rememberInputBeforeDrawing() {
    drawingReturn.current = { gameId: id, tab: activeToolPanel, highlight: savedHighlightMode }
    if (savedHighlightMode) setSavedHighlightMode(false)
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

  function input(digit: number, inputMode = highlightMode ? 'value' : mode, cells = selected, placeInSelection = false) {
    if (inputMode !== 'color' && digit > gridSize) return
    if (brush !== null && (inputMode === 'value' || colorTarget === 'candidate')) {
      if (colorTarget === 'candidate') {
        if (digit > 0) {
          const paintHighlightedGroup = candidateCount(highlightedDigitMask) > 1
          paintCandidateDigits(paintHighlightedGroup ? digitsInMask(highlightedDigitMask) : [digit], brush)
        }
        return
      }
      highlightColorDigit(digit === 0 || digit === coloringDigit ? null : digit)
      return
    }
    if (colorBrush !== null) setColorBrush(null)
    if (inputMode === 'color') {
      leaveChainInput(false)
      clearHighlightedDigits()
      if (digit > COLORS.length) return
      changeHintVisuals('player')
      if (colorTarget === 'candidate') {
        setSelectedColor((current) => current === digit ? null : digit)
        return
      }
      if (digit > 0) setEraseMode(false)
      if (!cells.length) {
        setSelectedColor((current) => digit === 0 || current === digit ? null : digit)
        return
      }
      edit((current) => enter(current, cells, inputMode, digit))
      return
    }
    if (digit > 0 && givenHighlightSelection) {
      setSelected([])
      cells = []
    }
    if (!cells.length || digit === 0) clearHighlightedDigits()
    if (digit > 0) setEraseMode(false)
    if (cells.length && (highlightMode || placeInSelection || multi)) {
      if (highlightMode && !placeInSelection && inputMode === 'value' && digit > 0 && onlyGivensSelected(visibleGivens, cells)) {
        clearHighlightedDigits()
        setSelected([])
        setHighlightCandidatePairs(false)
        setSelectedDigit(digit)
        return
      }
      enterFromInput(cells, digit, inputMode, { allowMultipleValues: inputMode === 'value' })
      return
    }
    if (highlightMode && inputMode !== 'value') return
    if (!cells.length) {
      setHighlightCandidatePairs(false)
      const wasHighlighted = digit > 0 && highlightedDigitMask === (1 << (digit - 1))
      setSelectedDigit((current) => digit === 0 || current === digit || wasHighlighted ? null : digit)
      return
    }
    enterFromInput(cells, digit, inputMode)
  }

  function clearHighlightedDigits() {
    setDigitHighlight((current) => current.mask ? { ...defaultDigitHighlight, match: current.match } : current)
  }

  function clearDigitSelection() {
    clearHighlightedDigits()
    setSelectedDigit(null)
    setHighlightCandidatePairs(false)
  }

  function showDigitHighlights(mask: SetStateAction<number>, match: DigitHighlightMatch) {
    setDigitHighlight((current) => ({
      mask: typeof mask === 'function' ? mask(current.mask) : mask,
      match,
    }))
    setSelectedDigit(null)
    setHighlightCandidatePairs(false)
    setColorBrush(null)
    setEraseMode(false)
  }

  function toggleDigitHighlight(digit: number, match: DigitHighlightMatch) {
    if (cellDrivenHighlight) setSelected([])
    const previous = selectedDigit ? 1 << (selectedDigit - 1) : 0
    if (brush !== null && colorTarget === 'candidate') {
      const currentMask = highlightedDigitMask || previous
      const digitBit = 1 << (digit - 1)
      const mask = currentMask ^ digitBit
      setDigitHighlight({ mask, match })
      setSelectedDigit(null)
      setHighlightCandidatePairs(false)
      setEraseMode(false)
      return
    }
    showDigitHighlights((current) => (current || previous) ^ (1 << (digit - 1)), match)
  }

  function digitsInMask(mask: number) {
    return Array.from({ length: gridSize }, (_, index) => index + 1)
      .filter((digit) => hasCandidate(mask, digit))
  }

  function paintCandidateDigits(digits: readonly number[], color: number) {
    if (!canPaint || colorTarget !== 'candidate' || !digits.length) return
    const selected = new Set(digits.filter((digit) => Number.isInteger(digit) && digit >= 1 && digit <= gridSize))
    if (!selected.size) return
    edit((current) => {
      const marks: (Candidate & { color: number })[] = []
      for (let cell = 0; cell < current.position.entries.length; cell++) {
        if (current.givens[cell] !== '0' || current.position.entries[cell] !== '0') continue
        const candidates = current.position.center[cell] | current.position.corner[cell]
        for (const digit of selected) {
          if (hasCandidate(candidates, digit)) marks.push({ cell, digit, color })
        }
      }
      if (!marks.length) return current
      const removeColor = color > 0 && marks.every(({ cell, digit }) =>
        current.position.candidateColors?.[cell]?.[digit] === color)
      return paintCandidates(current, marks.map((mark) => ({ ...mark, color: removeColor ? 0 : color })))
    })
  }

  function paintSelectedCandidateDigits(color: number) {
    const mask = highlightedDigitMask || (selectedDigit === null ? 0 : 1 << (selectedDigit - 1))
    if (mask) paintCandidateDigits(digitsInMask(mask), color)
  }

  function changeDigitHighlightMatch(match: DigitHighlightMatch) {
    setDigitHighlight((current) => ({ ...current, match }))
  }

  function highlightCellCandidates(mask: number) {
    candidatePress.current = null
    dragSelection.current = null
    pendingDoubleClickSingle.current = null
    setCandidatePreviewCell(null)
    setSelected([])
    showDigitHighlights(mask, 'any')
  }

  function cellHighlightMask(index: number) {
    return canHighlightCellCandidates && values[index] === '0' ? center[index] | corner[index] : 0
  }

  function changeColorTarget(target: ColorTarget) {
    if (target === colorTarget) return
    setColorTarget(target)
    changeHintVisuals('player')
  }

  function chooseColor(color: number) {
    if (!canPaint) return
    leaveChainInput(false)
    if (brush === color) {
      setColorBrush(null)
      return
    }
    setEraseMode(false)
    setSavedHighlightMode(false)
    if (color > 0) setSelectedColor(color)
    if (colorTarget === 'cell' && selected.length) {
      edit((current) => enter(current, selected, 'color', color))
      setSelected([])
      setSelectedDigit(coloringDigit)
    }
    changeHintVisuals('player')
    setColorBrush(color)
  }

  function highlightColorDigit(digit: number | null) {
    setSelected([])
    clearHighlightedDigits()
    setHighlightCandidatePairs(false)
    setSelectedDigit(digit)
  }

  function switchColorShade() {
    if (cellColorsDisabled || sketch.drawing) return
    const color = colorMode ? selectedColor : brush
    const alternate = color === null ? null : alternateColorShade(color)
    if (alternate === null) return
    if (colorMode) setSelectedColor(alternate)
    else {
      setColorBrush(alternate)
      setSelectedColor(alternate)
    }
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
    setEraseMode(false)
    setColorMode(false)
    setPencilModifier(false)
    setSavedHighlightMode(enable)
  }

  function switchPenPencil(pencil: boolean) {
    leaveChainInput()
    setColorBrush(null)
    setEraseMode(false)
    setColorMode(false)
    setSavedHighlightMode(false)
    setPencilModifier(false)
    setPencil(pencil)
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
    setColorMode(false)
    setEraseMode(false)
    setShowStrongLinks(false)
    rememberInputBeforeDrawing()
    setStartDrawingOnOpen(true)
  }

  function continueColorGroup() {
    if (!canPaint || colorContinuation?.status !== 'ready') return
    const { marks } = colorContinuation
    edit((current) => current.position !== game.position ? current
      : colorTarget === 'cell' ? paintCells(current, marks) : paintCandidates(current, marks))
  }

  function clearColors() {
    edit(colorTarget === 'candidate' ? clearCandidateColors
      : (current) => enter(current, current.position.colors.map((_, index) => index), 'color', 0))
    setColorBrush(null)
    setSelectedColor(null)
  }

  function colorCandidate(candidate: Candidate) {
    if (candidateBrush === null) return
    setActive(candidate.cell)
    setSelected([])
    setLastColoredCandidate({ gameId: id, candidate })
    edit((current) => {
      const currentColor = current.position.candidateColors?.[candidate.cell]?.[candidate.digit] ?? 0
      const color = candidateBrush > 0 && currentColor === candidateBrush ? 0 : candidateBrush
      return paintCandidate(current, candidate, color)
    })
  }

  const canDoubleClickSingle = advancedModes.doubleClickSingles && !draft && !solved && !pencilActive &&
    !highlightMode && !colorMode && !eraseMode && brush === null && selectedDigit === null && !hintAnnotations

  function clickCell(index: number, event: MouseEvent) {
    if (cellHold.suppressClick(event)) return
    if (desktop && isAltClick(event)) {
      event.preventDefault()
      const mask = cellHighlightMask(index)
      if (mask) highlightCellCandidates(mask)
      return
    }
    const press = candidatePress.current
    if (press && event.detail > 0) {
      // Touch generates a click after pointerup, even after leaving an implicitly captured cell.
      candidatePress.current = null
      if (press.cancelled || press.cell !== index || !canPreviewCandidates || values[index] !== '0' ||
        press.mask !== pencilPreviewMask || press.mode !== candidateMode) return
    }
    const doubleClickEligible = canDoubleClickSingle && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
    if (!doubleClickEligible || pendingDoubleClickSingle.current?.index !== index) pendingDoubleClickSingle.current = null
    if (event.detail === 1) {
      const digit = doubleClickEligible
        ? onlyCandidate(game.position.center[index] | game.position.corner[index]) : null
      pendingDoubleClickSingle.current = advancedModes.doubleClickSingles && digit !== null
        ? { index, digit, game } : null
    }
    if (event.detail > 1 && doubleClickEligible && pendingDoubleClickSingle.current) return
    if (suppressCellClick.current && event.detail > 0) {
      suppressCellClick.current = false
      return
    }
    setActive(index)
    if (cellBrush !== null && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => enter(current, [index], 'color', cellBrush))
      setSelected([])
      return
    }
    const givenDigit = givenDigitAt(visibleGivens, index)
    const armedInput = colorMode ? colorTarget === 'cell' ? selectedColor : null : selectedDigit
    if (eraseMode && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => enter(current, [index], 'value', 0))
      setSelected([])
      return
    }
    if (pencilGroup && !givenDigit && values[index] === '0' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => {
        const next = toggleCandidateGroup(current, index, candidateMode, pencilGroup)
        const actions = marksOf(pencilGroup).flatMap(digit => playerActions(current, next, [index], candidateMode, digit))
        if (actions.length && !completed) void observeTechniqueActions(current, actions, 'independent',
          hintEliminations(valuesOf(current), completeCandidateMasks(current), current.position.eliminations, gridSize))
        return next
      })
      return
    }
    const selectingMultiple = multi || !pencilActive && (event.metaKey || event.ctrlKey)
    if (!givenDigit && !highlightMode && !selected.length && armedInput !== null && !highlightedDigitMask && !event.shiftKey && !selectingMultiple) {
      enterFromInput([index], armedInput, mode, { toggleValue: !draft && mode === 'value' })
      return
    }
    if (givenDigit && highlightMode) toggleDigitHighlight(givenDigit, digitHighlight.match)
    else if (!highlightedDigitMask) {
      if (givenDigit) setSelectedDigit(givenDigit)
      else if (!highlightMode) setSelectedDigit(null)
    }
    if (event.shiftKey && selected.length) setSelected(rectangleSelection(anchor, index, gridSize))
    else {
      setAnchor(index)
      setSelected((current) => (multi || event.metaKey || event.ctrlKey)
        ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
        : current.length === 1 && current[0] === index ? [] : [index])
    }
  }

  function doubleClickCell(index: number, event: MouseEvent) {
    if (!canDoubleClickSingle ||
      event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
    const pending = pendingDoubleClickSingle.current?.index === index ? pendingDoubleClickSingle.current : null
    pendingDoubleClickSingle.current = null
    if (!pending || pending.game.position !== game.position) return
    const origin = pending.game
    if (valuesOf(origin)[index] !== '0') return
    const digit = pending.digit
    event.preventDefault()
    setActive(index)
    setAnchor(index)
    setSelected([index])
    enterFromInput([index], digit, 'value')
  }

  function startCellDrag(index: number, event: ReactPointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    setPointerFocusedCell(index)
    suppressCellClick.current = false
    candidatePress.current = null
    if (desktop && isAltClick(event)) return
    if (cellBrush !== null) {
      if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
        cellPaintDrag.current = { gameId: id, pointerId: event.pointerId, previous: index,
          cells: new Set([index]), brush: cellBrush, color: cellBrush, moved: false }
      }
      return
    }
    const maskToHighlight = mobile ? cellHighlightMask(index) : 0
    cellHold.start(event, maskToHighlight ? () => highlightCellCandidates(maskToHighlight) : undefined)
    if (canSelectCellsByDrag) {
      dragSelection.current = {
        pointerId: event.pointerId,
        start: index,
        previous: index,
        cells: new Set([index]),
        base: [...selected],
        additive: multi || event.metaKey || event.ctrlKey,
        moved: false,
      }
      return
    }
    if (event.pointerType === 'touch' || pencilGroup) {
      if (canPreviewCandidates && values[index] === '0' && !event.shiftKey && (!pencilGroup || !event.metaKey && !event.ctrlKey)) {
        candidatePress.current = { pointerId: event.pointerId, cell: index, mask: pencilPreviewMask, mode: candidateMode, cancelled: false }
        setCandidatePreviewCell(index)
      }
      return
    }
    if (!canDragCandidates || values[index] !== '0') return
    const initial = readWorkingGame() ?? game
    const digit = selectedDigit!
    const mask = candidateMode === 'candidate'
      ? initial.position.center[index] | initial.position.corner[index]
      : initial.position[candidateMode][index]
    candidateDrag.current = {
      pointerId: event.pointerId, previous: index, initial, cells: new Set(),
      mode: candidateMode, digit, action: hasCandidate(mask, digit) ? 'remove' : 'add', temporary: temporaryPencil, moved: false,
    }
  }

  function continueCellDrag(index: number | null, event: ReactPointerEvent) {
    cellHold.move(event)
    const press = candidatePress.current
    if (press?.pointerId === event.pointerId && index !== press.cell) {
      press.cancelled = true
      setCandidatePreviewCell(null)
    }
    if (event.pointerType !== 'touch' && event.buttons === 0) {
      hoveredCell.current = event.shiftKey ? null : index
      setCandidatePreviewCell(canPreviewCandidates && !event.shiftKey ? index : null)
    }
    if (index === null) return
    const pressed = event.pointerType === 'touch' || Boolean(event.buttons & 1)
    const paint = cellPaintDrag.current
    if (paint) {
      if (paint.pointerId !== event.pointerId || !pressed || paint.previous === index || paint.brush !== cellBrush) return
      event.preventDefault()
      if (!paint.moved) {
        paint.moved = true
        setSelected([])
        boardRef.current?.setPointerCapture(event.pointerId)
      }
      paint.cells = new Set([...paint.cells, ...cellsOnDragPath(paint.previous, index, gridSize)])
      paint.previous = index
      setActive(index)
      setAnchor(index)
      setCellPaintPreview({ gameId: paint.gameId, brush: paint.brush, color: paint.color, cells: paint.cells })
      return
    }
    const stroke = candidateDrag.current
    if (stroke) {
      if (stroke.pointerId !== event.pointerId || !pressed || stroke.previous === index ||
        (stroke.temporary && !temporaryPencil)) return
      event.preventDefault()
      if (!stroke.moved) {
        stroke.moved = true
        setCandidatePreviewCell(null)
        setSelected([])
        boardRef.current?.setPointerCapture(event.pointerId)
      }
      for (const cell of cellsOnDragPath(stroke.previous, index, gridSize)) {
        if (stroke.initial.givens[cell] === '0' && stroke.initial.position.entries[cell] === '0') stroke.cells.add(cell)
      }
      stroke.previous = index
      setActive(index)
      setAnchor(index)
      edit((current) => paintCandidateStroke(
        current, stroke.initial, [...stroke.cells], stroke.mode, stroke.digit, stroke.action,
      ))
      return
    }
    const drag = dragSelection.current
    if (!drag || drag.pointerId !== event.pointerId || !pressed || index === drag.previous) return
    event.preventDefault()
    drag.moved = true
    drag.cells = extendCellSelectionPath(drag.cells, drag.previous, index, gridSize)
    drag.previous = index
    setActive(index)
    setAnchor(drag.start)
    setSelected(drag.additive ? [...new Set([...drag.base, ...drag.cells])] : [...drag.cells])
  }

  function preventControlClickMenu(event: MouseEvent) {
    // On macOS, a Control-click can open the context menu in place of a click.
    const stroke = candidateDrag.current
    if (!canPreviewCandidates || !event.ctrlKey || event.shiftKey || event.button !== 0 ||
      !stroke || stroke.previous !== gridCellAtPoint(boardRef.current, event)) return
    event.preventDefault()
    stroke.controlClick = true
  }

  function finishControlClick(event: ReactPointerEvent) {
    const stroke = candidateDrag.current
    if (!stroke?.controlClick || stroke.pointerId !== event.pointerId || stroke.moved || !canPreviewCandidates ||
      (stroke.temporary && !temporaryPencil) || stroke.previous !== gridCellAtPoint(boardRef.current, event)) return
    clickCell(stroke.previous, event)
    suppressCellClick.current = true
  }

  useEffect(() => {
    function pauseOnSpace(event: KeyboardEvent) {
      if (!pauseShortcutsEnabled || draft || placeholder || event.key !== ' ' || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(target.type))) return

      // Handle Space before focused controls can activate or change the play layout.
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      setPointerFocusedCell(null)
      if (completed) toggleSolvedView()
      else togglePause()
    }

    function keydown(event: KeyboardEvent) {
      if (event.key === 'Shift') setCandidatePreviewCell(null)
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ' || ARROWS[event.key]) setPointerFocusedCell(null)
      const target = event.target
      const key = event.key.toLowerCase()
      const shortcut = event.ctrlKey || event.metaKey
      const shortcutDigit = shortcut && !event.shiftKey && !event.isComposing
        ? Number(/^[1-9]$/.test(key) ? key : /^Digit([1-9])$/.exec(event.code)?.[1]) || null : null
      const shiftDigit = event.isComposing ? null : highlightedDigitShortcut(event)
      const solvingDigitShortcuts = !draft && !disabled && !solved
      const digitShortcut = shortcutDigit ?? shiftDigit
      const drawLinksShortcut = !event.isComposing && shortcutMatches(event, shortcuts, 'chainDrawing')
      const applyEditsShortcut = !event.isComposing && shortcutMatches(event, shortcuts, 'applyEdits')
      const checkboxShortcut = target instanceof HTMLInputElement && target.type === 'checkbox' &&
        (drawLinksShortcut || applyEditsShortcut || ((strongLinksVisible || solvingDigitShortcuts && !sketch.drawing) && digitShortcut !== null))
      if (event.defaultPrevented || rearranging || modalOpen || puzzleMenuOpen || actionsOpen || chainColorsOpen || dialogResult !== null || resetOpen || confirmCandidatesOpen || cancelDraftOpen || event.altKey ||
        (target instanceof HTMLElement && !checkboxShortcut && (target.isContentEditable || target.closest('input, select, textarea, a')))) return
      if (pauseShortcutsEnabled && !draft && !placeholder && !previewing && !variantRulesOpen &&
        event.key !== ' ' && !event.isComposing && shortcutMatches(event, shortcuts, 'pauseOrSwitchView') &&
        !(target instanceof HTMLElement && target.closest('dialog[open]'))) {
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
      const cancelTool = key === 'escape' && !variantRulesOpen &&
        !(target instanceof HTMLElement && target.closest('dialog[open], [popover]:popover-open'))
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
      if (historyShortcut && (sketch.drawing || browsingStrongLinks ||
        (chainsVisible && target instanceof HTMLElement && target.closest('.chains-panel')))) {
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
      const cycleDigit = key === '`' && !shortcut && !event.shiftKey && !event.isComposing &&
        solvingDigitShortcuts && !variantRulesOpen &&
        !(target instanceof HTMLElement && target.closest('dialog[open]'))
      let highlightedDigit = shiftDigit ?? functionKeyDigit(event.key)
      if (cycleDigit) {
        event.preventDefault()
        if (event.repeat) return
        const current = strongLinksVisible ? onlyCandidate(strongLinkMask)
          : sketch.drawing ? chainHighlightDigit : selectedDigit ?? onlyCandidate(highlightedDigitMask) ?? coloringDigit
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
        const cell = target instanceof HTMLElement ? target.closest<HTMLElement>('.paint-candidate')?.closest<HTMLElement>('[data-cell]') : null
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
        if (shortcutDigit && hasInputSelection && !(brush !== null && colorTarget === 'candidate')) input(shortcutDigit, candidateMode)
        else toggleDigitHighlight(digitShortcut, shortcutDigit ? 'all' : 'any')
      } else if (!draft && !shortcut && highlightedDigit) {
        event.preventDefault()
        if (cellDrivenHighlight) setSelected([])
        clearHighlightedDigits()
        setHighlightCandidatePairs(false)
        setSelectedDigit(highlightedDigit)
      } else if (!draft && brush === null && !colorMode && shortcut && !event.shiftKey && !event.isComposing) {
        if (!shortcutDigit || shortcutDigit > gridSize) return
        const cells = !selected.length && target instanceof HTMLButtonElement &&
          target.matches('[role="gridcell"][data-cell]') && boardRef.current?.contains(target)
          ? [Number(target.dataset.cell)] : selected
        if (!cells.some((cell) => values[cell] === '0')) return
        event.preventDefault()
        if (!event.repeat) input(shortcutDigit, candidateMode, cells)
      } else if (!shortcut && ARROWS[event.key] && (target === document.body || boardRef.current?.contains(target as Node))) {
        event.preventDefault()
        const [dy, dx] = ARROWS[event.key]
        const row = Math.min(gridSize - 1, Math.max(0, Math.floor(active / gridSize) + dy))
        const col = Math.min(gridSize - 1, Math.max(0, active % gridSize + dx))
        const next = row * gridSize + col
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
        boardRef.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus({ preventScroll: true })
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
      } else if (!draft && shortcutMatches(event, shortcuts, 'generateCandidates') && !solved && !busy) {
        event.preventDefault()
        void generateCandidates()
      } else if (!draft && shortcutMatches(event, shortcuts, 'solveSingles') && !solved && hasSingles && !busy) {
        event.preventDefault()
        void solveAllSingles()
      } else if (!draft && shortcutMatches(event, shortcuts, 'colorMode') && (desktop || mobileToolsAvailable)) {
        event.preventDefault()
        if (!event.repeat) activateColorsShortcut()
      } else if (!draft && shortcutMatches(event, shortcuts, 'eraseMode')) {
        event.preventDefault()
        setColorBrush(null)
        setColorMode(false)
        setSavedHighlightMode(false)
        setSelected([])
        setEraseMode((current) => !current)
      }
    }
    window.addEventListener('keydown', pauseOnSpace, true)
    window.addEventListener('keydown', keydown)
    return () => {
      window.removeEventListener('keydown', pauseOnSpace, true)
      window.removeEventListener('keydown', keydown)
    }
  })

  async function runCheck() {
    if (busy || puzzleTask.current || game.paused || placeholder) return
    if (previewing) closeSolutionPath()
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    const task = beginPuzzleTask()
    const run = task.engine.run
    setDialogResult(null)
    try {
      if (draftCages && !isAlgebraicCageList(draftCages)) throw new Error('Add at least one cage with a letter before checking.')
      const status = variant?.fog
        ? [...values].every((digit, cell) => digit === '0' || digit === variant.solution[cell]) ? 'unique' : 'conflict'
        : sizedRules?.length && grid
        ? await run({ type: 'sized-variant', position: sizedRulePosition(grid, { rules: sizedRules }, values), operation: 'analyze' })
        : cages ? await analyzeAlgebraic({ rules: cages }, values, run) : grid
        ? await run({ type: 'sized-classic', position: sizedClassicPosition(grid, values), operation: 'analyze' }) : variant
        ? await run({ type: 'variant', operation: 'analyze', position: { puzzle: variant.puzzle, entries: game.position.entries } })
        : await run({ type: 'analyze', values })
      if (!currentTaskGame(task)) return
      if (!draft && status === 'multiple') {
        setDialogResult({ title: 'Puzzle check', text: 'This grid has more than one solution.', tone: 'neutral' })
      } else if (!draft && status !== 'search-limit') {
        setDialogResult(status === 'unique'
          ? { title: 'Puzzle check', text: solved ? 'This puzzle is correct.' : 'Every placed digit is correct so far.', tone: 'success' }
          : { title: 'Puzzle check', text: 'This puzzle is not correct yet.', tone: 'error' })
      } else {
        setDialogResult({ title: 'Puzzle check', ...validation[status] })
      }
    } catch (error) {
      if (!currentTaskGame(task)) return
      const conflict = error instanceof EngineError && (error.code === 'conflict' || error.code === 'unsolvable')
      setDialogResult({ title: 'Puzzle check', text: conflict ? 'This puzzle is not correct yet.' : (error as Error).message,
        tone: conflict ? 'error' : 'neutral' })
    } finally {
      finishPuzzleTask(task)
    }
  }

  async function generateCandidates(confirmed = false) {
    if (busy || puzzleTask.current || solved || disabled) return
    if (!confirmed && hasCandidates(game.position)) {
      candidateConfirmationOpener.current = puzzleMenuOpen ? puzzleMenuButtonRef.current
        : actionsOpen ? actionsMenuButtonRef.current : null
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
      setConfirmCandidatesOpen(true)
      return
    }
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    const task = beginPuzzleTask(false, false)
    try {
      const masks = await playCandidates(game, task.engine.run, advancedModes.generateCandidateVariants)
      if (!currentTaskGame(task)) return
      if (!masks) {
        setDialogResult({ title: 'Puzzle action', text: 'Candidates cannot be generated until the grid conflicts are resolved.', tone: 'error' })
        return
      }
      updateWorkingGame((latest) => canApplyPuzzleResult(task.origin, latest)
        ? recordAction(latest, replaceCandidates(latest, masks), 'candidates') : latest)
    } catch (error) {
      if (!currentTaskGame(task)) return
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      finishPuzzleTask(task)
    }
  }

  async function solveAllSingles() {
    if (busy || puzzleTask.current || solved || draft || disabled || !hasSingles) return
    if (previewing) closeSolutionPath()
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    const task = beginPuzzleTask(false, false)
    try {
      const result = await solveSingleValues(game, values, eliminations, displayedCandidates ?? undefined, task.engine.run,
        advancedModes.solveSinglesVariants)
      if (!currentTaskGame(task)) return
      if (result === values) {
        setDialogResult({ title: 'Puzzle action', text: 'There are no singles to solve right now.', tone: 'neutral' })
        return
      }
      const removedCandidates = eliminations?.some(Boolean) || (displayedCandidates && masks?.some((mask, cell) =>
        values[cell] === '0' && (mask & ~displayedCandidates[cell]) !== 0))
      const assistance = values === givens && !removedCandidates && !result.includes('0') ? 'all' : 'partial'
      updateWorkingGame((latest) => {
        if (!canApplyPuzzleResult(task.origin, latest)) return latest
        const next = recordAction(latest, fillEntries(latest, result, advancedModes.autoRemoveCandidates,
          advancedModes.autoRemoveCandidateVariants), 'singles')
        if (completed) return next
        const placements = [...result].flatMap((digit, cell) => digit !== '0' && values[cell] !== digit ? [{ place: { cell, digit: Number(digit) } }] : [])
        void observeTechniqueActions(latest, placements, 'automated')
        return latest.ratingAttempt ? { ...next, ratingAttempt: addSinglesAssistance(latest.ratingAttempt, assistance) } : next
      })
    } catch (error) {
      if (!currentTaskGame(task)) return
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      finishPuzzleTask(task)
    }
  }

  async function showHint(limit: 10 | 'all' = 10) {
    if (busy || puzzleTask.current || solved || draft || disabled) return
    if (sketch.drawing) sketch.suspend()
    if (mobile) hintReturnFocus.current = actionsMenuButtonRef.current
    if (advancedWorkspace) {
      if (!showBottomPanel) onOpenHintPanel()
      setFocusHintRequest((request) => request + 1)
    }
    setHint(null)
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setHintRevealed(true)
    const task = beginPuzzleTask(true)
    const run = task.engine.run
    const requestId = ++techniqueHintRequest.current
    let result: HintState | undefined
    const removals = hintEliminations(values, displayedCandidates, eliminations, gridSize)
    try {
      const collection = limit === 'all' && !grid ? ++nextHintCollection : undefined
      const { choices, candidates, available, offset } = await puzzleHints(game, limit, undefined, collection, run)
      const page = collection === undefined ? undefined : { collection, offset: offset ?? 0, available }
      if (!candidates) throw new Error('Missing hint candidates')
      result = { position: hintPosition, choices, candidates, page, index: 0, stage: 'technique' }
    } catch (error) {
      if (!currentTaskGame(task)) return
      const incorrectCandidates = error instanceof EngineError && (error.code === 'invalid-eliminations' ||
        (error.code === 'unsolvable' && variant && [...values].every((digit, cell) => digit === '0' || digit === variant.solution[cell])))
      const copy = incorrectCandidates ? HINT_CANDIDATES_ERROR : HINT_ERROR
      result = { position: hintPosition, choices: [], index: 0, stage: 'technique', error: copy }
      if (incorrectCandidates && removals) {
        try {
          const answer = sized?.solution ?? algebraic?.solution ?? variant?.solution ??
            (grid ? await solveMini(values, run) : await run({ type: 'solve', values }))
          if (answer) result.recovery = findCandidateRecovery(game, answer, removals)
        } catch { /* Keep the general candidate warning if recovery cannot be verified. */ }
      }
    } finally {
      if (result && requestId === techniqueHintRequest.current && currentTaskGame(task)) setHint(result)
      finishPuzzleTask(task, Boolean(result?.page && currentTaskGame(task)))
    }
  }

  async function showTechniqueHints(technique: string) {
    if (disabled || busy || puzzleTask.current || solved || draft) return
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (sketch.drawing) sketch.suspend()
    if (mobile) hintReturnFocus.current = activeMobileInputTabRef.current
    if (advancedWorkspace) {
      if (!showBottomPanel) onOpenHintPanel()
      setFocusHintRequest((request) => request + 1)
    }
    const position = hintPosition
    setHint(null)
    setHintRevealed(true)
    const task = beginPuzzleTask(true)
    const request = ++techniqueHintRequest.current
    let result: HintState | undefined
    try {
      const { choices, candidates } = await puzzleHints(game, 'all', technique, undefined, task.engine.run)
      if (!candidates) throw new Error('Missing candidates for the selected technique.')
      result = {
        position, choices, candidates, index: 0, stage: 'technique',
        ...(choices.length ? {} : { error: { title: techniqueLabel(technique), text: 'No patterns are available in the current grid.' } }),
      }
    } catch (error) {
      if (!currentTaskGame(task)) return
      result = {
        position, choices: [], index: 0, stage: 'technique',
        error: error instanceof EngineError && error.code === 'invalid-eliminations'
          ? HINT_CANDIDATES_ERROR : HINT_ERROR,
      }
    } finally {
      if (result && request === techniqueHintRequest.current && currentTaskGame(task)) setHint(result)
      finishPuzzleTask(task)
    }
  }

  async function moveHint(offset: -1 | 1) {
    if (!visibleHint || !hintCount) return
    const request = ++pageRequest.current
    const { page } = visibleHint
    const index = moveHintIndex(visibleHint.index, hintCount, offset)
    if (index === visibleHint.index) return
    if (!page || (index >= page.offset && index < page.offset + visibleHint.choices.length)) {
      setHint(current => current === visibleHint ? { ...current, index, stage: 'technique' } : current)
      return
    }
    const engine = hintEngine.current
    if (!engine) return
    try {
      const next = await puzzleHintPage(variant, page.collection, index, engine.run, game.position.entries)
      if (request !== pageRequest.current || hintEngine.current !== engine) return
      setHint(current => current?.page?.collection === page.collection
        ? { ...current, choices: next.choices, page: { ...page, offset: next.offset }, index, stage: 'technique' } : current)
    } catch (error) {
      if (request === pageRequest.current && hintEngine.current === engine) setHint(current => current?.page?.collection === page.collection
        ? { ...current, choices: [], page: undefined, index: 0, error: { title: 'Could not load hint', text: (error as Error).message } }
        : current)
    }
  }

  function changeHintVisuals(visuals: 'hint' | 'player') {
    if (visuals === 'hint' && sketch.drawing) sketch.suspend()
    setHint(current => current && current.visuals !== visuals ? { ...current, visuals } : current)
  }

  function changeHintDetail(offset: -1 | 1) {
    setHint((current) => {
      if (!current) return current
      const stage = moveHintStage(current.stage, offset, Boolean(current.recovery))
      return stage === current.stage ? current
        : { ...current, stage, reviewingRemoval: stage === 'technique' ? false : current.reviewingRemoval }
    })
  }

  function applyCandidateRecovery() {
    if (!recovery || !visibleHint) return
    edit((current) => matchesHintPosition(current, visibleHint.position) ? restoreCandidate(current, recovery) : current, 'recovery')
    setHint(null)
    setHintRevealed(false)
    if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }

  function applyToCurrentPosition(actions: readonly DeductionAction[], candidates: readonly number[], {
    hintSnapshot, technique, chainIds,
  }: { hintSnapshot?: HintPosition; technique?: string; chainIds?: readonly number[] } = {}) {
    let applied = false
    edit((current) => {
      const currentPosition = matchesHintPosition(current, hintSnapshot ?? hintPosition)
      if (!currentPosition || (chainIds && current.chainSketch !== savedGame.chainSketch)) return current
      const next = chainIds ? applyChainDeduction(current, chainIds, actions, candidates, advancedModes.autoRemoveCandidates,
        advancedModes.autoRemoveCandidateVariants)
        : applyDeduction(current, actions, candidates, advancedModes.autoRemoveCandidates,
          advancedModes.autoRemoveCandidateVariants)
      applied = next !== current
      if (applied && !hintSnapshot && !completed) void observeTechniqueActions(current, actions, 'independent',
        hintEliminations(valuesOf(current), completeCandidateMasks(current), current.position.eliminations))
      return applied && hintSnapshot && !completed ? withRatingHints(next, [hintKey(actions)], true) : next
    }, hintSnapshot ? 'hint' : 'edit', { technique, actions })
    return applied
  }

  function applyChainEdits() {
    if (!canApplyChainEdits || !chainMasks) return
    const actions = sketch.allActions
    const applied = applyToCurrentPosition(actions, chainMasks, { chainIds: sketch.appliedChainIds })
    setFailedChainActions(applied ? null : actions)
    if (applied) sketch.suspend()
  }

  function applyHint() {
    if (!deduction || !hintCandidates || !visibleHint) return
    applyToCurrentPosition(deduction.actions, hintCandidates, { hintSnapshot: visibleHint.position, technique: deduction.technique })
    setHint(null)
    setHintRevealed(false)
    if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }

  function showSolutionPath(force = false) {
    if (game.paused || draft || busy) return
    if (savedHighlightMode) setSavedHighlightMode(false)
    setPuzzleMenuOpen(false)
    if (desktop) selectToolPanel('solution')
    setHintRevealed(false)
    setActionsOpen(false)
    if (!solutionPathRevealed || force) {
      playSession.set(id, 'solutionView', { identity: solutionIdentity, step: force ? 0 : solutionView?.step ?? 0, hintOpen: false })
    }
    if (force) setSolutionRetry(retry => retry + 1)
  }

  function setSolutionHintOpen(hintOpen: boolean) {
    playSession.set(id, 'solutionView', current => current?.identity === solutionIdentity && current.hintOpen !== hintOpen
      ? { ...current, hintOpen } : current)
  }

  function hideSolutionPath() {
    playSession.set(id, 'solutionView', current => current?.identity === solutionIdentity && !current.hidden
      ? { ...current, hintOpen: false, hidden: true } : current)
  }

  function closeSolutionPath() {
    setPuzzleMenuOpen(false)
    closeToolPanel('solution')
  }

  function selectSolutionStep(index: number) {
    if (game.paused) return
    if (savedHighlightMode) setSavedHighlightMode(false)
    playSession.set(id, 'solutionView', { identity: solutionIdentity, step: index, hintOpen: true })
    setFocusHintRequest((request) => request + 1)
    if (isChainStep(trace?.steps[index])) setFocusChainsRequest((request) => request + 1)
  }

  useEffect(() => {
    actionsRef.current = placeholder || previewing || (solved && !showSolvedGrid) ? null : { check: () => { void runCheck() } }
    return () => { actionsRef.current = null }
  })

  const solutionHintPanel = previewing && solutionHintOpen && solutionHintCopy
  const hintTechnique = solutionHintPanel ? replayedSolutionStep?.deduction.technique
    : visibleHint && !recovery ? deduction?.technique : undefined
  const hintLesson = hintTechnique ? lessonRoutes.get(hintTechnique) : undefined
  const applyHintAction = solutionHintPanel ? undefined
    : recovery ? { label: 'Restore candidate', onClick: applyCandidateRecovery }
      : deduction && hintCandidates ? { label: 'Apply hint', onClick: applyHint, shortcut: shortcutLabel(shortcuts.applyEdits) } : undefined
  const closeHint = () => solutionHintPanel ? setSolutionHintOpen(false) : setHintRevealed(false)
  const explanation = solutionHintPanel ? stepDiagram : hintDiagram
  const revealedDeduction = solutionHintPanel ? replayedSolutionStep?.deduction : fullHint && !recovery ? deduction : undefined
  const recoveryExplanation = !solutionHintPanel && recovery && fullHint
    ? explainCandidateRecovery(game, recovery, cellReferenceStyle) : undefined
  const hintPanel = (solutionHintPanel || visibleHint || hintLoading || mobileHintOpen) && (
    <PlayHint mobile={mobile} panelRef={mobile ? mobileHintPanelRef : undefined}>
      <HintCard compact={!mobile} hint={solutionHintPanel ? solutionHintCopy
        : hintLoading ? { title: 'Finding a hint…', text: '' } : hintCopy}
        lesson={hintLesson && hintTechnique ? { id: hintTechnique, title: hintLesson.title } : undefined}
        removals={revealedDeduction ? describeHintRemovals(revealedDeduction, {
          difficulty: techniqueDifficulties[revealedDeduction.technique], cellReferenceStyle, gridSize,
        }) : undefined}
        onClose={closeHint}
        onShown={!solutionHintPanel && deduction ? markHintVisible : undefined}
        visuals={availableHintAnnotations && !disabled && !solved ? {
          visible: !playerVisualsSelected,
          onToggle: () => changeHintVisuals(playerVisualsSelected ? 'hint' : 'player'),
        } : undefined}
        reserveVisuals={Boolean(applyHintAction && !disabled && !solved)}
        action={applyHintAction}
        detailNavigation={applyHintAction ? { first: hintStage === 'technique', last: fullHint, onMove: changeHintDetail } : undefined}
        secondaryAction={!solutionHintPanel && recovery?.movesAgo
          ? { label: 'Review move', reserved: !recoveryLocationVisible, expanded: visibleHint?.reviewingRemoval ?? false,
            onClick: () => setHint((current) => current?.recovery ? { ...current, reviewingRemoval: !current.reviewingRemoval } : current) }
          : undefined}
        explanation={recoveryExplanation ?? (explanation?.description
          ? [explanation.description, ...(explanation.reasonSteps ? [] : [explanation.reason])].filter(Boolean) : undefined)}
        explanationSteps={recoveryExplanation ? undefined : explanation?.reasonSteps}
        collapseExplanation={Boolean(solutionHintPanel)}
        trace={solutionHintPanel
          ? replayedSolutionStep && 'variant' in replayedSolutionStep.deduction.evidence ? stepDiagram?.trace : undefined
          : hintDiagram?.trace}
        navigation={!solutionHintPanel && visibleHint && hintCount > 0
          ? { index: visibleHint.index, count: hintCount, onMove: moveHint }
          : undefined} />
    </PlayHint>
  )
  const cellColorsPanel = (
    <CellColorPalette target={colorTarget} onTarget={changeColorTarget} brush={brush}
      hasColors={colorTarget === 'cell' ? Boolean(game.position.importedCellColors) || game.position.colors.some(Boolean) : Boolean(game.position.candidateColors || game.position.importedCandidateColors)}
      canContinueGroup={canContinueColorGroup} groupMessage={colorGroupMessage} onContinueGroup={continueColorGroup}
      disabled={cellColorsDisabled} onColor={chooseColor} onSwitchShade={switchColorShade}
      onStop={() => { setColorBrush(null); setColorMode(false) }} onClear={clearColors} />
  )
  const chainUnavailable = chainGraph && canAnalyzeChains ? undefined
    : previewing ? 'Select a chain step in Solution.'
    : draft || solved ? 'Chains are available while solving.'
    : game.paused ? 'Resume the puzzle to mark chains.'
    : missingChainCandidates ? 'Restore candidates in empty cells before you mark chains.'
    : currentNotes?.failed ? 'The candidates did not load.'
    : currentNotes?.masks === null ? 'Resolve the grid conflicts to draw links.'
    : 'Loading candidates…'
  const chainsPanel = grid ? <p className="analysis-empty">Open Techniques to explore deductions on this grid.</p>
    : <ChainsPanel sketch={sketch} onToggleDrawing={toggleChainDrawing} onApply={applyChainEdits} applyFailed={failedChainActions === sketch.allActions} onChooseColors={() => setChainColorsOpen(true)}
      shortcuts={shortcuts} unavailable={chainUnavailable} inspection={chainInspection} compact={mobile}
      eliminations={{ shown: sketch.showEliminations, toggle: sketch.toggleEliminations }}
    strongLinks={{ shown: showStrongLinks, hasHighlights: strongLinkMask !== 0, count: strongLinks.count,
      toggle: toggleStrongLinks }} />
  const completionPanel = showResults || (mobile && showSolvedGrid) ? (
    <CompletedPuzzle game={savedGame} games={games} catchUpPuzzle={catchUpPuzzle} preferredDifficulty={preferredDifficulty}
      ratingPending={ratingPending} shortcutEnabled={showResults && !rearranging && !modalOpen && !puzzleMenuOpen && !actionsOpen && !cancelDraftOpen && !variantRulesOpen}
      actionsTarget={mobile ? completionActionsTarget : null}
      showGuides={appearance.showGuides} cellReferenceStyle={cellReferenceStyle} onResumePuzzle={onSelectPuzzle}
      onChooseDifficulty={() => onNewPuzzle('difficulty')} onChooseVariant={() => onNewPuzzle()} />
  ) : null
  const solveSinglesAction = <button onClick={() => { void solveAllSingles() }} disabled={busy || !hasSingles}
    aria-keyshortcuts={shortcutLabel(shortcuts.solveSingles)}>
    <CheckCheck size={17} /> Solve all singles <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.solveSingles)}</kbd>
  </button>
  function selectToolPanel(tab: ToolPanelTab, alsoOpen?: PuzzleTool) {
    if (tab !== 'digits') {
      if (!openPuzzlePanels.includes(tab) && !panelAvailable(tab)) return
      if (tab !== 'rules') changeHintVisuals('player')
      if (advancedWorkspace && !showRightPanel) onOpenRightPanel()
    }
    if (tab === 'solution' || tab === 'techniques') setHintRevealed(false)
    playSession.set(id, 'toolPanels', current => {
      const requested = [tab, alsoOpen].filter((tool): tool is PuzzleTool => tool !== undefined && tool !== 'digits')
      const open = current.open
      const missing = TOOL_PANEL_ORDER.filter(tool => requested.includes(tool) && !open.includes(tool))
      const openChanged = open.length !== current.open.length || open.some((tool, index) => tool !== current.open[index])
      if (!missing.length && current.active === tab && !openChanged) return current
      return { ...current, open: missing.length ? TOOL_PANEL_ORDER.filter(tool => open.includes(tool) || missing.includes(tool)) : open,
        active: tab }
    })
  }

  function closeToolPanel(tool: PuzzleTool, fromMenu = false) {
    if (tool === 'solution') hideSolutionPath()
    if (mobile && !fromMenu) focusMobileInput.current = openPuzzlePanels.length === 1 || tool === 'rules'
    playSession.set(id, 'toolPanels', (current) => {
      const open = current.open.filter((tab) => tab !== tool)
      return open.length ? { ...current, open, active: current.active === tool ? 'digits' : current.active } : defaultToolPanels
    })
    if (mobile || fromMenu) return
    const remaining = openInsightTabs.filter(({ id }) => id !== tool)
    const next = remaining.find(({ id }) => id === activeDesktopTab?.id) ?? remaining.find(({ id }) => id === 'techniques') ?? remaining[0]
    const opener = tool === 'rules' ? rulesButtonRef.current : desktopToolsOpener.current
    const focus = next ? insightTabsRef.current?.querySelector<HTMLButtonElement>(`[data-insight-tab="${next.id}"]`)
      : opener?.isConnected ? opener : puzzleMenuButtonRef.current
    focus?.focus({ preventScroll: true })
  }

  function showRulesTab() {
    if (mobile) {
      mobileToolsOpener.current = rulesButtonRef.current
      focusMobileInput.current = true
    }
    selectToolPanel('rules')
  }

  function focusPinnedRules() {
    if (!focusRulesAfterDialog.current) return null
    focusRulesAfterDialog.current = false
    if (mobile) return activeMobileInputTabRef.current
    if (advancedWorkspace) return rulesPanelRef.current
    return insightTabsRef.current?.querySelector<HTMLButtonElement>('[data-insight-tab="rules"]') ?? null
  }

  function showPuzzleTool(tool: PuzzleTool, alsoOpen?: PuzzleTool) {
    if (!panelAvailable(tool) || (mobile && disabled && !(tool === 'chains' && previewing))) return
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (mobile) {
      mobileToolsOpener.current = puzzleMenuButtonRef.current
      focusMobileInput.current = true
    }
    selectToolPanel(tool, alsoOpen)
  }

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
    setEraseMode(false)
    setSavedHighlightMode(false)
    if (selectedColor === null || selectedColor <= 0) {
      if (paletteOpen) changeColorTarget(colorTarget === 'cell' ? 'candidate' : 'cell')
      return
    }
    changeHintVisuals('player')
    if (mobile) {
      setColorMode(false)
      setColorBrush(selectedColor)
    } else {
      setColorBrush(null)
      setColorMode(true)
    }
  }

  function enterColorsMode() {
    if (!panelAvailable('colors') || disabled) return
    leaveChainInput(false)
    if (!colorMode && colorBrush === null) {
      changeHintVisuals('player')
      setEraseMode(false)
      setSavedHighlightMode(false)
      if (mobile && selectedColor !== null && selectedColor > 0) setColorBrush(selectedColor)
      else {
        setColorBrush(null)
        setColorMode(true)
      }
    }
  }

  function enterChainsMode() {
    if (grid || !panelAvailable('chains')) return
    setColorBrush(null)
    setColorMode(false)
    setEraseMode(false)
    setSavedHighlightMode(false)
    setShowStrongLinks(false)
    changeHintVisuals('player')
    setStartDrawingOnOpen(true)
  }

  function showChains() {
    if (grid) return
    if (advancedWorkspace && !previewing) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
    showPuzzleTool('chains')
    if (desktop && !advancedWorkspace) setFocusChainsRequest(request => request + 1)
  }

  function togglePuzzlePanel(panel: PuzzleTool) {
    if (openPuzzlePanels.includes(panel)) closeToolPanel(panel, true)
    else showPuzzleTool(panel)
  }

  const panelToggles = desktopInsightTabs.filter(({ id }) => openPuzzlePanels.includes(id) || panelAvailable(id)).map(({ id, label, Icon }) => (
    <button key={id} type="button" disabled={rearranging || game.paused}
      aria-pressed={openPuzzlePanels.includes(id)} onClick={() => togglePuzzlePanel(id)}>
      <Icon size={17} aria-hidden="true" /> {label}
    </button>
  ))
  const hintMenuAction = !draft && !solved && <button onClick={() => { void showHint() }} disabled={busy}>
    <Lightbulb size={17} /> View hint
  </button>
  const commonSolvingMenuItems = <>
    <button onClick={() => { void generateCandidates() }} disabled={busy || solved}
      aria-keyshortcuts={shortcutLabel(shortcuts.generateCandidates)}>
      <PencilLine size={17} /> Generate candidates
      <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.generateCandidates)}</kbd>
    </button>
    <button aria-pressed={highlightCandidatePairs} disabled={solved} onClick={() => {
      if (sketch.drawing) sketch.setHighlightedDigit(null)
      else setSelectedDigit(null)
      clearHighlightedDigits()
      setHighlightCandidatePairs((current) => !current)
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
    }}>
      <Braces size={17} /> Highlight {'{x,y}'} cells
    </button>
    {hintMenuAction}
  </>
  const syncStatus = useSyncExternalStore(deviceSync.subscribePuzzle, () => deviceSync.puzzleStatus(game.id), () => 'none')
  const showPuzzleSync = syncStatus !== 'none' && !placeholder && !draft
  const syncWarning = showPuzzleSync && storageAvailable && (
    syncStatus === 'offline' ? 'Offline. Changes saved on this device.' :
    syncStatus === 'failed' ? 'Couldn’t sync. Changes saved on this device.' : ''
  )
  const syncMenuStatus = !storageAvailable ? 'Local storage is unavailable.' : {
    none: '',
    checking: 'Checking cloud save…',
    pending: 'Cloud save pending.',
    saving: 'Saving to the cloud…',
    saved: '',
    offline: 'Offline. Changes saved on this device.',
    'offline-clean': 'Offline. Connect to sync this puzzle.',
    failed: 'Couldn’t sync. Changes saved on this device.',
    'check-failed': 'Couldn’t verify the cloud save.',
    conflict: 'Your changes are in a conflict copy.',
  }[syncStatus]
  const puzzleOptionItems = <>
    {hintMenuAction}
    <button onClick={() => { void runCheck() }} disabled={busy}>
      <Check size={17} /> Check puzzle
    </button>
    {!grid && !advancedWorkspace && !draft && !placeholder && <button onClick={() => {
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
      setPuzzleDetailsOpen(true)
    }}><Info size={17} aria-hidden="true" /> Puzzle details</button>}
    {advancedWorkspace && generatedWithAuto && offerSingles && solveSinglesAction}
    <button onClick={() => { setPuzzleMenuOpen(false); onShare() }}>
      <Share2 size={17} /> Share puzzle
    </button>
    {!draft && <button onClick={() => { setPuzzleMenuOpen(false); onExport?.() }}>
      <Clipboard size={17} aria-hidden="true" /> Export puzzle
    </button>}
    {showPuzzleSync && <>
      <button type="button" disabled={!storageAvailable || syncStatus === 'saving' || syncStatus === 'offline' || syncStatus === 'offline-clean'}
        onClick={() => { void deviceSync.syncPuzzle(game.id) }}>
        <CloudUpload size={17} aria-hidden="true" /> Sync now
      </button>
      {syncMenuStatus && <p className="puzzle-sync-menu-status" role="status">{syncMenuStatus}</p>}
    </>}
    {game.position.importedDrawings && <button type="button" disabled={disabled}
      onClick={() => { setPuzzleMenuOpen(false); edit(clearImportedDrawings) }}>
      <Eraser size={17} aria-hidden="true" /> Clear imported drawings
    </button>}
    <button onClick={() => { setPuzzleMenuOpen(false); setResetOpen(true) }}>
      <RotateCcw size={17} /> Reset puzzle
    </button>
    {!completed && <>
      <div className="app-menu-separator" role="separator" />
      <button onClick={() => { setPuzzleMenuOpen(false); onStopPlaying() }} disabled={busy}>
        <LogOut size={17} /> Stop playing
      </button>
    </>}
  </>
  const mobileActionsMenu = <div className="app-menu puzzle-menu" id="mobile-actions-menu">
    {offerSingles && solveSinglesAction}
    {commonSolvingMenuItems}
  </div>
  const desktopActionsMenu = desktopActionsMounted && (
    <div ref={actionsMenuRef} className="app-menu puzzle-menu desktop-actions-menu" id="input-actions-menu" popover="manual"
      data-presence={desktopActionsExiting ? 'exit' : 'open'}
      aria-hidden={desktopActionsExiting || undefined} inert={desktopActionsExiting || undefined}>
      {commonSolvingMenuItems}
      {offerSingles && <>
        <div className="app-menu-separator" role="separator" />
        {solveSinglesAction}
      </>}
    </div>
  )
  const puzzleMenu = puzzleMenuMounted && (
    <div ref={puzzleMenuPopupRef} className={`app-menu puzzle-menu${floatingPuzzleMenu ? ' floating-puzzle-menu' : ''}`} id="puzzle-menu"
      popover={floatingPuzzleMenu ? 'manual' : undefined} data-presence={puzzleMenuExiting ? 'exit' : 'open'}
      aria-hidden={puzzleMenuExiting || undefined} inert={puzzleMenuExiting || undefined}
      onClickCapture={() => puzzleMenuButtonRef.current?.focus({ preventScroll: true })}>
      {puzzleOptionItems}
    </div>
  )
  const canSelectCell = !game.paused && !showMobileResults && !rearranging
  // Input mode is independent of the visible tool tab and never falls into a "no mode" state.
  // Paused/preview/finished puzzles retain their mode without showing editable controls.
  const gridInputMode = puzzleInputMode({
    drawingLinks: sketch.drawing, browsingStrongLinks,
    erasing: eraseMode, coloring: colorMode || brush !== null,
    highlighting: highlightMode, penciling: pencilActive,
  })
  const badgeMode = disabled || showResults || draft || (solved && !showSolvedGrid) ? undefined : gridInputMode
  const modeBadge = badgeMode && <ModeBadge mode={badgeMode} descriptionId={modeBadgeId} cardRef={puzzleGridBorderRef} boundaryLabel="puzzle edge"
          position={modeBadgePosition} onPosition={setModeBadgePosition} onActivate={() => {
            if (badgeMode === 'chain') {
              if (sketch.drawing) stopDrawingAndFocusGrid()
              else if (browsingStrongLinks) setShowStrongLinks(false)
              return
            }
            leaveChainInput()
            setColorBrush(null)
            setEraseMode(false)
            setColorMode(false)
            setPencilModifier(false)
            if (badgeMode === 'pen') setPencil(true)
            setSavedHighlightMode(badgeMode === 'pencil')
          }} />
  const showPlayerColors = colorsPanelOpen || colorBrush !== null || colorMode || hintOpen
  const visibleChainAnnotations = !colorsActive && chainsPanelOpen && !hintVisualsActive && (sketch.annotations.links?.length || sketch.annotations.candidates?.size)
    ? sketch.annotations : undefined
  const highlightedRule = variantRulesOpen ? dialogRule : pinnedRule
  const solutionGrid = (
    <Board highlightedRule={highlightedRule} grid={grid} variantPuzzle={variant?.puzzle} fog={solutionFog} whispersGuide={game.whispersGuide} algebraicCages={cages} sizedRules={sizedRules} givens={givens} values={previewPosition ? lessonValues(previewPosition) : solutionFog?.puzzle.givens ?? givens}
      givenCellColors={game.givenCellColors} authoredArtwork={game.authoredArtwork}
      candidates={previewPosition?.candidates} annotations={stepDiagram?.annotations}
      label="Solution preview" showGuides={appearance.showGuides} highlighting={highlighting} />
  )
  const livePuzzleStage = previewing ? solutionGrid : !mobile && completionPanel ? completionPanel
  : (sketch.drawing || browsingStrongLinks) && chainMasks ? (
    <Board highlightedRule={highlightedRule} grid={grid} variantPuzzle={variant?.puzzle} fog={fog} whispersGuide={game.whispersGuide} algebraicCages={cages} sizedRules={sizedRules} givens={givens} values={values} position={game.position} errors={errors}
      givenCellColors={game.givenCellColors} authoredArtwork={game.authoredArtwork}
      candidates={chainMasks} annotations={strongLinksVisible ? strongLinks.annotations : sketch.annotations} showPlayerColors={showPlayerColors} showImportedAnnotations={!hintVisualsActive}
      label={sketch.drawing ? 'Sudoku grid for drawing links' : 'Sudoku grid with strong links'}
      descriptionId={badgeMode ? modeBadgeId : undefined}
      modeBorder={badgeMode} modeBoundaryRef={puzzleGridBorderRef}
      modeBadge={modeBadge}
      highlightedDigit={strongLinksVisible ? null : chainHighlightDigit} highlightedDigitMask={strongLinksVisible ? strongLinkMask : 0}
      highlightedDigitMatch="any" highlighting={highlighting} highlightCandidateCells fullCandidateCellHighlight
      highlightCandidateCount={!strongLinksVisible && highlightCandidatePairs ? 2 : null}
      showGuides={appearance.showGuides} boardRef={boardRef} linkDrawing={sketch.drawing}
      onCandidate={strongLinksVisible ? selectStrongLinkCandidate : sketch.select}
      onGiven={strongLinksVisible ? (digit) => setStrongLinkHighlights(1 << (digit - 1)) : undefined}
      onLinkSelect={strongLinksVisible ? startStrongLinkChain : undefined}
      onCandidateHover={sketch.drawing ? sketch.hover : undefined}
      isLinkTarget={sketch.isLinkTarget}
      selectedCandidates={selectedChainCandidates} />
  ) : (
    <Board highlightedRule={highlightedRule} grid={grid} variantPuzzle={variant?.puzzle} fog={fog} whispersGuide={game.whispersGuide} algebraicCages={cages} sizedRules={sizedRules} givens={game.givens} values={values} position={hintAnnotations ? hintBoardPosition : boardPosition} errors={errors} candidateLayout={advancedModes.candidateLayout}
      givenCellColors={game.givenCellColors} authoredArtwork={game.authoredArtwork}
      candidates={hintAnnotations && hintDiagram ? hintCandidates : undefined}
      annotations={hintAnnotations ?? visibleChainAnnotations}
      annotationsOnTop={Boolean(hintAnnotations)}
      showAnnotatedCandidates={Boolean(visibleChainAnnotations)} showPlayerColors={showPlayerColors} showImportedAnnotations
      candidateGroupPreview={!hintVisualsActive && canPreviewCandidates && candidatePreviewCell !== null
        ? { cell: candidatePreviewCell, mask: pencilPreviewMask, mode: candidateMode } : undefined}
      descriptionId={badgeMode ? modeBadgeId : undefined}
      modeBorder={badgeMode} modeBoundaryRef={puzzleGridBorderRef}
      modeBadge={modeBadge}
      label={cages ? 'Algebraic Cages Sudoku grid' : variant ? `${variantName(variant)} Sudoku grid` : undefined}
      showGuides={appearance.showGuides}
      highlighting={highlighting}
      overlay={mobile && completionPanel ? { content: completionPanel, visible: showMobileResults } : undefined}
      highlightedDigit={selectedDigit ?? (visibleChainAnnotations ? chainHighlightDigit : null)}
      highlightedDigitMask={hintOpen ? highlightedDigitMask : playerHighlightMask}
      highlightedDigitMatch={digitHighlight.match}
      colorPreview={colorPreview}
      highlightCandidateCells={!eraseMode}
      selected={selected} active={active}
      pointerFocusedCell={pointerFocusedCell}
      highlightCandidateCount={highlightCandidatePairs ? 2 : null}
      boardRef={boardRef} onCell={canSelectCell && !paintingCandidates ? clickCell : undefined}
      onCellDoubleClick={canSelectCell && !paintingCandidates && !hintAnnotations ? doubleClickCell : undefined}
      onPaintCandidate={paintingCandidates ? colorCandidate : undefined}
      dragSelect={canSelectCell && (cellBrush !== null || canSelectCellsByDrag || canDragCandidates)}
      onCellPointerDown={canSelectCell && !paintingCandidates ? startCellDrag : undefined}
      onCellPointerMove={canSelectCell && !paintingCandidates ? continueCellDrag : undefined}
      onGridPointerLeave={() => {
        hoveredCell.current = null
        setCandidatePreviewCell(null)
      }} />
  )
  const pausedPuzzleStage = (
    <div className={`board-frame puzzle-paused-frame ${appearance.showGuides ? '' : 'guides-hidden'}`}>
      <div className="puzzle-paused" role="status" aria-label="Puzzle paused">
        <span className="puzzle-paused-icon" aria-hidden="true"><Pause size={25} /></span>
        <h2>Puzzle paused</h2>
        <Button type="button" variant="primary" onClick={resumePuzzle}><Play size={17} aria-hidden="true" /> Resume puzzle</Button>
      </div>
    </div>
  )
  const puzzlePlayLayers = (
    <div className="puzzle-play-layers" data-paused={game.paused || undefined}>
      <div className="puzzle-play-layer puzzle-live-layer" aria-hidden={game.paused || undefined} inert={game.paused}>
        {livePuzzleStage}
      </div>
      <div className="puzzle-play-layer puzzle-pause-layer" aria-hidden={!game.paused || undefined} inert={!game.paused}>
        {pausedPuzzleStage}
      </div>
    </div>
  )

  const quickActions: Record<PinnedAction, {
    Icon: typeof PencilLine; run: () => void; disabled?: boolean; pressed?: boolean
  }> = {
    candidates: { Icon: PencilLine, run: () => { void generateCandidates() }, disabled: busy },
    singles: { Icon: CheckCheck, run: () => { void solveAllSingles() }, disabled: busy || !hasSingles },
    chain: {
      Icon: Link2,
      run: enterChainsMode,
      disabled: !panelAvailable('chains'),
      pressed: chainsActive,
    },
    colors: { Icon: Palette, run: enterColorsMode, disabled: !panelAvailable('colors'), pressed: colorsActive },
    'strong-links': {
      Icon: Link2,
      run: toggleStrongLinks,
      disabled: !panelAvailable('chains'),
      pressed: showStrongLinks,
    },
    techniques: { Icon: ListFilter, run: () => showPuzzleTool('techniques'),
      disabled: !panelAvailable('techniques'), pressed: activeToolPanel === 'techniques' },
    hint: { Icon: Lightbulb, run: () => { void showHint() }, disabled: busy },
    check: { Icon: Check, run: () => { void runCheck() }, disabled: busy },
    undo: { Icon: Undo2, run: () => edit(undo), disabled: !game.past.length },
    redo: { Icon: Redo2, run: () => edit(redo), disabled: !game.future.length },
  }
  const visiblePinnedActions = !placeholder && !draft && !completed ? pinnedActions : []
  useLayoutEffect(() => {
    const puzzle = puzzleCardRef.current
    const puzzleStack = puzzle?.closest<HTMLElement>('.standard-puzzle-stack')
    const inputStack = inputRef.current?.closest<HTMLElement>('.standard-input-stack')
    const stage = puzzleStageRef.current
    if (!desktop || advancedWorkspace || !puzzle || !puzzleStack || !inputStack || !stage) return
    const gridBoundary = () => stage.querySelector(game.paused && !placeholder
      ? '.puzzle-paused' : '.board-body, .completion-frame > .completion') ?? stage
    const alignInput = () => {
      const page = puzzleStack.closest<HTMLElement>('.standard-workspace-page')
      const previewScale = page?.closest('.desktop-play-resizable')?.hasAttribute('data-layout-resizing')
        ? Number(page.style.scale) || 1 : 1
      const scale = (Number(getComputedStyle(puzzleStack).getPropertyValue('--desktop-layout-scale')) || 1) * previewScale
      const top = (gridBoundary().getBoundingClientRect().top - puzzleStack.getBoundingClientRect().top) / scale
      inputStack.style.setProperty('--puzzle-grid-offset', `${top + puzzleStack.scrollTop}px`)
    }
    alignInput()
    const observer = new ResizeObserver(alignInput)
    observer.observe(puzzle, { box: 'border-box' })
    observer.observe(stage, { box: 'border-box' })
    observer.observe(gridBoundary(), { box: 'border-box' })
    return () => { observer.disconnect(); inputStack.style.removeProperty('--puzzle-grid-offset') }
  }, [desktop, advancedWorkspace, game.paused, placeholder, appearance.showGuides, puzzleControlsBelow,
    previewing, showResults, sketch.drawing, browsingStrongLinks])

  const puzzleMetadata = (!draft || placeholder) && <div key="metadata" className="puzzle-metadata" aria-hidden={Boolean(placeholder) || undefined}>
    {difficulty && <span className="puzzle-difficulty">
      <span className="sr-only">Puzzle difficulty </span>{formatPuzzleRating(difficulty, score)}
    </span>}
    {game.generatedWithAuto && <span className="puzzle-auto-mode">Auto</span>}
    {showElapsedTime && <span className="duration-counter" role="timer" aria-label={`Elapsed time ${formatTime(game.elapsed)}${game.paused ? ', paused' : ''}`}>
      {formatTime(game.elapsed)}
    </span>}
    {!placeholder && sharedOnOtherDevice && <span className="puzzle-peer-status" role="img"
      aria-label="Open on another linked device" title="Open on another linked device">
      <MonitorSmartphone size={16} aria-hidden="true" />
    </span>}
    {showPuzzleSync && (loadingPuzzle || syncStatus === 'saving') && (
      <span className="puzzle-sync-loading" role="status" title="Syncing puzzle progress…">
        <LoaderCircle size={15} className="loading-spinner" aria-hidden="true" />
        <span className="sr-only">Syncing puzzle progress…</span>
      </span>
    )}
    {syncWarning && <span className="puzzle-sync-warning" role="status">{syncWarning}</span>}
    {catchUpPuzzle && !placeholder && !draft && <Button variant="quiet" className="puzzle-catch-up"
      style={showResults ? { visibility: 'hidden' } : undefined}
      onClick={() => onSelectPuzzle(catchUpPuzzle.id)} title={`Open ${catchUpPuzzle.title} from another linked device`}>
      Catch up <ArrowRight size={14} aria-hidden="true" />
    </Button>}
  </div>
  const viewToggleBesideMenu = desktop && !advancedWorkspace && puzzleControlsBelow
  const viewToggle = completed && !previewing && <Button variant="quiet" className="puzzle-view-toggle"
    aria-pressed={showSolvedGrid} aria-controls={puzzleStageId} aria-keyshortcuts={pauseKeys.join(' ')} onClick={toggleSolvedView}>
    {showSolvedGrid ? 'View results' : 'View grid'}
  </Button>
  const puzzleUtilityActions = <>
    {puzzleZoom.zoomed && <IconButton variant="quiet" className="puzzle-zoom-reset"
      aria-label="Reset grid zoom" title="Reset grid zoom" onClick={puzzleZoom.reset}>
      <ZoomOut size={18} aria-hidden="true" />
    </IconButton>}
    {nonUnique && <span className="non-unique-chip">Multiple Solutions</span>}
    {mixedVariant ? <IconButton ref={rulesButtonRef} variant="quiet" className="variant-rules-button"
      aria-label="Puzzle rules" title="Puzzle rules" aria-haspopup={openPuzzlePanels.includes('rules') ? undefined : 'dialog'}
      onClick={() => openPuzzlePanels.includes('rules') ? showRulesTab() : setVariantRulesOpen(true)}>
      <Info size={16} aria-hidden="true" />
    </IconButton> : (variant || grid) && <Button variant="quiet" className="variant-rules-button" onClick={() => setVariantRulesOpen(true)}
      aria-label={grid ? `${sizedName} rules` : `${variantName(variant)} Sudoku rules`} aria-haspopup="dialog">
      <Info size={16} aria-hidden="true" />{grid ? sizedName : variantName(variant)}
    </Button>}
    {!viewToggleBesideMenu && viewToggle}
  </>
  const puzzleActions = <div key="actions" className="puzzle-actions">
    {presentationDraft ? (
      <>
        <Button onClick={() => setCancelDraftOpen(true)}><X size={17} /> Cancel</Button>
        {grid && 'regions' in grid && onEditRegions && <Button onClick={onEditRegions} aria-haspopup="dialog">Edit regions</Button>}
        {grid && !draftCages && onEditSizedRules && <Button onClick={onEditSizedRules} aria-haspopup="dialog">Edit rules</Button>}
        {draftCages && onEditCages && <Button onClick={onEditCages} aria-haspopup="dialog">Edit cages</Button>}
        <Button variant="primary" className="publish-button" onClick={onPublish}><Check size={17} /> Save puzzle</Button>
      </>
    ) : (
      <>
        {!puzzleControlsBelow && puzzleUtilityActions}
        {viewToggleBesideMenu && viewToggle}
        {timing.trackTime && timing.showPause && !draft && !completed && (mobile || game.started || game.paused) && !previewing && <IconButton type="button" variant="quiet" className="puzzle-pause-trigger"
          aria-label={game.paused ? 'Resume puzzle' : 'Pause puzzle'}
          title={`${game.paused ? 'Resume puzzle' : 'Pause puzzle'} (${pauseKeys.join(' / ')})`}
          aria-pressed={game.paused} aria-keyshortcuts={pauseKeys.join(' ')} onClick={togglePause}>
          <span className="pause-toggle-icons" aria-hidden="true">
            <Pause className="pause-toggle-pause" size={18} />
            <Play className="pause-toggle-play" size={18} />
          </span>
        </IconButton>}
        <div className="puzzle-menu-wrap" ref={puzzleMenuRef}>
          <IconButton ref={puzzleMenuButtonRef} variant="quiet" className="puzzle-menu-trigger" aria-label="Open puzzle options"
            title="Puzzle options" disabled={Boolean(placeholder)} aria-expanded={puzzleMenuOpen} aria-controls={puzzleMenuOpen ? 'puzzle-menu' : undefined}
            onClick={(event) => {
              if (mobile) event.currentTarget.focus({ preventScroll: true })
              setActionsOpen(false)
              setPuzzleMenuOpen((open) => !open)
            }}>
            <MoreHorizontal size={20} />
          </IconButton>
          {puzzleMenu}
        </div>
      </>
    )}
  </div>
  const puzzleStage = <div key="grid" id={puzzleStageId} ref={puzzleStageRef} data-no-panel-hold={mobile || undefined} className={`puzzle-stage${previewing ? ' solution-preview' : sketch.drawing || browsingStrongLinks || visibleChainAnnotations ? ' chain-sketch' : hintAnnotations ? ' hint-preview' : ''}`}
    onContextMenu={(event) => { if (!cellHold.suppressContextMenu(event)) preventControlClickMenu(event) }} onPointerUp={finishControlClick}
    onBlur={(event) => {
      const cell = event.target.dataset.cell
      if (cell !== undefined) setPointerFocusedCell((current) => current === Number(cell) ? null : current)
    }}>
    {placeholder ? <div className="puzzle-placeholder-stage">
      <div className="puzzle-grid-reservation" aria-hidden="true" inert>
        <Board grid={grid} fog={fog} algebraicCages={cages} sizedRules={sizedRules} givens={givens} values={values}
          givenCellColors={game.givenCellColors} authoredArtwork={game.authoredArtwork} showGuides={appearance.showGuides} />
      </div>
      <div className="puzzle-placeholder-message">{placeholder}</div>
    </div> : !draft && !completed ? (
      mobile ? <div className="puzzle-zoom" data-zoomed={puzzleZoom.zoomed || undefined} {...puzzleZoom.viewportProps}>
        <div ref={puzzleZoom.content} className="puzzle-zoom-content">{puzzlePlayLayers}</div>
      </div> : puzzlePlayLayers
    ) : livePuzzleStage}
  </div>
  const puzzleTopActions = puzzleControlsBelow && (puzzleZoom.zoomed || variant || grid || (!viewToggleBesideMenu && viewToggle))
    ? <div key="top-actions" className="puzzle-actions puzzle-top-actions">{puzzleUtilityActions}</div> : null
  const puzzlePanel = (
      <div className="puzzle-column" data-reserve-badge-space={!placeholder && !draft || undefined}>
        <section ref={puzzleCardRef} className="puzzle puzzle-flat" aria-label={game.title} data-placeholder={Boolean(placeholder) || undefined}
          data-puzzle-controls={puzzleControlsBelow ? 'bottom' : undefined}
          data-desktop-solved={desktop && completed && !previewing || undefined}
          style={{ '--board-font-scale': appearance.gridTextScale, '--candidate-font-scale': appearance.candidateTextSize / 100 } as CSSProperties}>
          {puzzleControlsBelow
            ? [puzzleTopActions, puzzleStage, puzzleMetadata, puzzleActions]
            : mobile ? [
                <div key="toolbar" className="mobile-puzzle-toolbar" data-no-panel-hold>
                  {puzzleMetadata}{puzzleActions}
                </div>, puzzleStage,
              ] : [puzzleMetadata, puzzleActions, puzzleStage]}
        {game.practiceTechnique
          ? <div className="puzzle-caption">{techniqueLabel(game.practiceTechnique)}</div>
          : <PuzzleCollectionCredit game={game} />}
        {showKillerCombinations && <KillerCombos puzzle={game.variant?.puzzle} values={values}
          active={selected.at(-1) ?? -1} visible={selected.length > 0} />}
        {visiblePinnedActions.length > 0 && <nav className="puzzle-quick-actions" aria-label="Pinned puzzle actions" data-no-panel-hold>
          {visiblePinnedActions.map(id => {
            const action = quickActions[id]
            const label = PINNABLE_ACTIONS.find(item => item.id === id)!
            const Icon = action.Icon
            return <Button key={id} variant="quiet" disabled={disabled || action.disabled}
              aria-pressed={action.pressed} title={label.label} onClick={action.run}>
              <Icon size={16} aria-hidden="true" /><span>{label.shortLabel}</span>
            </Button>
          })}
        </nav>}
        {presentationDraft && <div className="draft-tip"><PencilLine size={16} /> Enter the givens, then save your puzzle.</div>}
        </section>
      </div>
  )
  const inputPanel = (
      <div ref={inputRef} className="workspace-controls" data-show-completion={showMobileResults || undefined}>
        <Controls gridSize={gridSize} candidateDigitColors={candidateDigitColors}
          candidatePaintColor={candidateBrush !== null && candidateBrush > 0 ? candidateBrush : undefined}
          mode={mode} pencil={pencilActive} togglePencil={() => switchPenPencil(gridInputMode !== 'pencil')}
          candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes}
          colorMode={colorMode} colorTarget={colorTarget} setColorTarget={changeColorTarget} toggleColorMode={mobile ? activateColorsShortcut : undefined}
          colorsActive={colorsActive} onSwitchShade={switchColorShade}
          paintCandidateGroupAvailable={colorTarget === 'candidate' && candidateBrush !== null && candidateCount(highlightedDigitMask) > 1}
          onPaintCandidateGroup={() => { if (candidateBrush !== null) paintSelectedCandidateDigits(candidateBrush) }}
          clearDigitHighlightsAvailable={!sketch.drawing && !browsingStrongLinks && !eraseMode && candidateCount(highlightedDigitMask) > 1}
          onClearDigitHighlights={clearDigitSelection}
          highlightMode={highlightMode} toggleHighlightMode={toggleHighlightMode}
          eraseMode={eraseMode} toggleEraseMode={() => {
            setColorBrush(null)
            setColorMode(false); setSavedHighlightMode(false); setSelected([]); setEraseMode((current) => !current)
          }}
          selectedDigit={browsingStrongLinks || sketch.drawing ? (strongLinksVisible ? null : chainHighlightDigit) : colorMode ? selectedColor : selectedDigit} hasCellSelection={hasInputSelection}
          highlightedDigitMask={strongLinksVisible ? strongLinkMask : sketch.drawing || eraseMode ? 0 : highlightedDigitMask}
          onToggleDigitHighlight={strongLinksVisible ? toggleStrongLinkDigit : !sketch.drawing && !draft && !solved && !previewing ? toggleDigitHighlight : undefined}
          digitHighlightMatch={digitHighlight.match} onDigitHighlightMatchChange={!draft && !solved && !previewing ? changeDigitHighlightMatch : undefined}
          values={values} input={sketch.drawing || browsingStrongLinks ? toggleChainHighlight : input} chainDrawing={sketch.drawing || browsingStrongLinks}
          undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
          historyDisabled={historyDisabled}
          hideUndo={completed}
          onCheck={presentationDraft || previewing ? undefined : () => { void runCheck() }}
          compact={mobile} actionsButtonRef={actionsMenuButtonRef} actionsOpen={actionsOpen}
          reserveSolvingSlots={desktop && !advancedWorkspace && solved && !previewing}
          actionsMenu={!mobile && !advancedWorkspace ? desktopActionsMenu : undefined}
          inputTools={desktop && panelToggles.length > 0 ? <InputToolsMenu disabled={game.paused} preferBelow onShow={opener => {
            desktopToolsOpener.current = opener
            setPuzzleMenuOpen(false)
            setActionsOpen(false)
          }}>{panelToggles}</InputToolsMenu> : undefined}
          onActions={!presentationDraft && !solved && (mobile || !advancedWorkspace) ? () => {
            setPuzzleMenuOpen(false)
            setActionsOpen((open) => !open)
          } : undefined}
          disabled={disabled || (solved && !showSolvedGrid)} draft={presentationDraft} inputSize={inputSize} panelHeight={panelHeight}
          setPanelHeight={setPanelHeight} beginResize={beginResize} showMultiSelectButton={!advancedWorkspace} multi={multi} toggleMulti={toggleMulti} />
        {mobile && completed && <section ref={setCompletionActionsTarget} className="surface mobile-completion-actions"
          aria-label="Next puzzle options" hidden={!showMobileResults} data-no-panel-hold>
        </section>}
      </div>
  )
  const advancedHintPanel = <div className="dock-hint-content">
    <MotionSurface>{hintPanel}</MotionSurface>
    {!hintPanel && <section className="advanced-spoiler-panel motion-surface" data-presence="open" aria-label="Hint">
      <span className="advanced-spoiler-icon" aria-hidden="true"><Lightbulb size={21} /></span>
      <div><h2>Hint</h2><p>Hint contents stay hidden until you choose to reveal them.</p></div>
      <Button variant="primary" disabled={busy || solved || draft || game.paused} onClick={() => { void showHint() }}>
        <Eye size={17} /> {busy && hintRevealed ? 'Finding a hint…' : 'Reveal hint'}
      </Button>
      <Button disabled={busy || solved || draft || game.paused} onClick={() => { void showHint('all') }}>
        <ListFilter size={17} /> Analyze all moves
      </Button>
    </section>}
  </div>
  // An empty fragment keeps the dock slot mounted while the puzzle is paused.
  const pausedPanel = <></>
  const techniquesPanel = game.paused ? pausedPanel : draft
    ? <p className="analysis-empty">Available after starting the puzzle.</p>
    : <PuzzleAnalysisContents game={game} onSelectTechnique={showTechniqueHints} />
  const solutionPathPanel = game.paused ? pausedPanel : solutionPathRevealed && solutionPath ? (
    <SolutionPath state={solutionPath} index={solutionStep}
      cellReferenceStyle={cellReferenceStyle} gridSize={gridSize} techniqueDifficulties={techniqueDifficulties}
      onSelect={selectSolutionStep} onRetry={() => showSolutionPath(true)} onClose={closeSolutionPath}
      onReveal={!mobile || activeToolPanel === 'solution' ? markSolutionVisible : undefined} embedded={!advancedWorkspace} />
  ) : (
    <section className="advanced-spoiler-panel solution-spoiler-panel" aria-label="Solution">
      <span className="advanced-spoiler-icon" aria-hidden="true"><ListOrdered size={21} /></span>
      <div><h2>Solution</h2><p>The solving steps stay hidden until you choose to reveal them.</p></div>
      <Button variant="primary" disabled={busy || draft} onClick={() => showSolutionPath()}>
        <Eye size={17} /> Reveal solution
      </Button>
    </section>
  )
  const clueCount = [...visibleGivens].filter((digit) => digit !== '0').length
  const placedDigitCount = [...game.position.entries].filter((digit) => digit !== '0').length
  const candidateTotal = game.position.center.reduce((sum, mask, index) => (
    values[index] === '0' && (!fog || fog.cells.has(index)) ? sum + candidateCount(mask | game.position.corner[index]) : sum
  ), 0)
  const detailsPanel = (
    <section className="advanced-details" aria-label="Puzzle details">
      <dl>
        <div><dt>Puzzle</dt><dd>{game.title}</dd></div>
        <div><dt>Status</dt><dd>{placeholder ? 'Waiting for puzzle' : solved ? 'Solved' : game.paused ? 'Paused' : game.started ? 'In progress' : 'Not started'}</dd></div>
        <div><dt>Difficulty</dt><dd>{difficulty ? formatPuzzleRating(difficulty, score) : 'Unrated'}</dd></div>
        {!grid && !draft && !placeholder && <div><dt>Original puzzle</dt>
          <dd>{originalSolutionStatus[nonUnique ? 'multiple' : verifiedOriginal ? 'unique' : 'unverified']}</dd></div>}
        {showElapsedTime && <div><dt>Elapsed time</dt><dd>{formatTime(game.elapsed)}</dd></div>}
        <div><dt>Givens</dt><dd>{clueCount}</dd></div>
        <div><dt>Placed digits</dt><dd>{placedDigitCount}</dd></div>
        <div><dt>Candidates</dt><dd>{candidateTotal}</dd></div>
        <div><dt>Undo steps</dt><dd>{game.past.length}</dd></div>
      </dl>
    </section>
  )
  const browserPanel = (
    <AdvancedPuzzleBrowser games={games} active={game.id} view={puzzleBrowserView} onViewChange={setPuzzleBrowserView} onSelect={onSelectPuzzle}
      onNew={onNewPuzzle} onImport={onImportPuzzle} onSave={onPublish}
      onSavePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, saved: true }))}
      onUnsavePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, saved: false, savedForLater: undefined }))}
      onArchivePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, archived: true }))}
      onRestorePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, archived: false }))} />
  )

  const rulesPanel = openPuzzlePanels.includes('rules') && <section ref={rulesPanelRef} className="variant-rules-panel"
    aria-label="Puzzle rules" tabIndex={advancedWorkspace ? -1 : undefined}>
    {advancedWorkspace && <div className="variant-rules-panel-actions">
      <IconButton variant="quiet" aria-label="Unpin rules" title="Unpin rules" onClick={() => closeToolPanel('rules')}>
        <PinOff size={17} aria-hidden="true" />
      </IconButton>
    </div>}
    <VariantRules key={id} sections={ruleSections} active={!mobile || activeToolPanel === 'rules'} onHighlight={setPinnedRule} />
  </section>
  const bookmarksPanel = <BookmarksPanel key={id} bookmarks={savedGame.bookmarks} disabled={historyDisabled}
    onSave={saveBookmark} onRestore={restoreBookmark} onDelete={deleteBookmark} />
  const toolPanelContents = {
    colors: cellColorsPanel, chains: chainsPanel, bookmarks: bookmarksPanel, rules: rulesPanel,
    solution: solutionPathPanel, techniques: techniquesPanel,
  }

  return (
    <>
      <PlayLayout desktop={desktop} puzzle={puzzlePanel} hint={hintPanel}
        input={desktop ? inputPanel : <MobileInputTabs active={activeToolPanel} open={openPuzzlePanels}
          panels={{ digits: inputPanel, ...toolPanelContents }} activeTabRef={activeMobileInputTabRef}
          toolsDisabled={rearranging} toolToggles={panelToggles.length ? panelToggles : undefined}
          onShowTools={opener => { mobileToolsOpener.current = opener }}
          onSelect={selectToolPanel} onClose={closeToolPanel} />}
        insights={activeDesktopTab ? {
          active: activeDesktopTab.id, tabs: openInsightTabs, tabListRef: insightTabsRef, onSelect: selectToolPanel,
          onClose: () => closeToolPanel(activeDesktopTab.id),
          content: toolPanelContents[activeDesktopTab.id],
        } : undefined}
        mobile={{
          puzzleId: game.id, rearranging, withHint: mobileHintOpen || Boolean(solutionHintPanel) || rearranging,
          fitContent: pinnedActions.length > 0 && !placeholder && !draft,
          resizableInput: mobileToolsAvailable || openPuzzlePanels.length > 0, inputTabCount: openPuzzlePanels.length,
          savedInputHeight: toolPanels.height,
          puzzleTopSpace: appearance.mobilePuzzleTopSpace,
          puzzleShrink: appearance.mobilePuzzleShrink,
          onPuzzleTopSpaceChange: onMobilePuzzleTopSpaceChange,
          onInputHeightChange: height => playSession.set(id, 'toolPanels', current => {
            if (height !== undefined) return { ...current, height }
            return { open: current.open, active: current.active }
          }),
          hintSwipe: mobileHintOpen ? { dismiss: closeHint, apply: applyHintAction } : undefined,
          blocked: Boolean(placeholder) || modalOpen || puzzleMenuOpen || actionsOpen || variantRulesOpen || chainColorsOpen ||
            dialogResult !== null || resetOpen || confirmCandidatesOpen || cancelDraftOpen,
          onRearrangingChange: active => {
            setMobileRearranging(active)
            if (!active) return
            const pointerId = cellPaintDrag.current?.pointerId ?? candidateDrag.current?.pointerId ?? dragSelection.current?.pointerId
            candidateDrag.current = null
            cellPaintDrag.current = null
            setCellPaintPreview(null)
            dragSelection.current = null
            pendingDoubleClickSingle.current = null
            if (pointerId !== undefined && boardRef.current?.hasPointerCapture(pointerId)) boardRef.current.releasePointerCapture(pointerId)
          },
          inputTitle: openPuzzlePanels.length ? 'Input' : showMobileResults ? 'Next puzzle' : 'Keypad',
          hintPlaceholder: <PlayHint mobile><HintCard hint={{ title: 'Puzzle hints', text: 'Hints will appear here.' }} onClose={() => {}} /></PlayHint>,
        }}
        advanced={advancedWorkspace ? <DesktopDockLayout puzzle={puzzlePanel} input={inputPanel}
          chains={advancedPanelOpen('chains') ? chainsPanel : undefined}
          bookmarks={advancedPanelOpen('bookmarks') ? bookmarksPanel : undefined}
          cellColors={advancedPanelOpen('colors') ? cellColorsPanel : undefined} rules={rulesPanel || undefined}
          hint={advancedHintPanel} solutionPath={advancedPanelOpen('solution') ? solutionPathPanel : undefined}
          techniques={advancedPanelOpen('techniques') ? techniquesPanel : undefined}
          details={detailsPanel} browser={browserPanel} showLeft={showLeftPanel} showRight={showRightPanel} showBottom={showBottomPanel}
          activeToolPanel={activeToolPanel} onSelectToolPanel={selectToolPanel}
          focusHintRequest={focusHintRequest} focusChainsRequest={focusChainsRequest}
          onColorsVisibleChange={setDesktopColorsVisible}
          onChainsVisibleChange={setDesktopChainsVisible} onInputVisibleChange={setDesktopInputVisible}
          onSolutionVisibleChange={setDesktopSolutionVisible} /> : undefined} />
      <Modal title="Actions" className="puzzle-actions-sheet" open={mobile && actionsOpen} motionSpeed="overlay"
        onClose={() => setActionsOpen(false)}>{mobileActionsMenu}</Modal>
      <Modal title="Puzzle details" open={puzzleDetailsOpen} onClose={() => setPuzzleDetailsOpen(false)}>{detailsPanel}</Modal>
      <ChainColorsDialog open={chainColorsOpen} first={sketch.active.color} second={sketch.active.secondColor}
        onSelect={sketch.setColors} onClose={() => setChainColorsOpen(false)} onEdit={onEditChainColors && (() => {
          setChainColorsOpen(false)
          onEditChainColors()
        })} />
      {variant && !grid && <Modal title={mixedVariant ? <span className="sr-only">Puzzle rules</span> : `${variantName(variant)} rules`}
        className="variant-rules-dialog" open={variantRulesOpen} onClose={() => setVariantRulesOpen(false)} returnFocus={focusPinnedRules}>
        <div className="variant-rules-layout">
          <div className="variant-rules-preview">
            <Board variantPuzzle={variant.puzzle} fog={game.paused ? fogView(variant) : fog} whispersGuide={game.whispersGuide} highlightedRule={dialogRule} givens={givens} values={game.paused ? EMPTY : values}
              label="Rule preview" showGuides={false} />
          </div>
          <VariantRules key={id} sections={ruleSections} active={variantRulesOpen} onHighlight={setDialogRule} />
        </div>
        {panelAvailable('rules') && <div className="dialog-actions">
          <Button onClick={() => {
            focusRulesAfterDialog.current = true
            setVariantRulesOpen(false)
            showRulesTab()
          }}><Pin size={17} aria-hidden="true" /> Pin rules</Button>
        </div>}
      </Modal>}
      {grid && <Modal title={`${sizedName} rules`} open={variantRulesOpen} onClose={() => setVariantRulesOpen(false)}>
        <div className="variant-rules-copy">
          {algebraic?.source?.author && <p>By {algebraic.source.author}</p>}
          {sized?.author && <p>By {sized.author}</p>}
          {(algebraic ? algebraicRules(algebraic) : sized ? sizedRuleDescriptions(grid, sized.rules) : [MINI_RULE]).map(rule => <p key={rule}>{rule}</p>)}
        </div>
      </Modal>}
      {dialogResult && <PuzzleCheckResult result={dialogResult} onClose={() => setDialogResult(null)} />}
      <Modal title="Generate candidates?" open={confirmCandidatesOpen} onClose={() => setConfirmCandidatesOpen(false)}
        returnFocus={() => candidateConfirmationOpener.current}>
        <p>Generating candidates will replace the candidates already in the grid. You can undo this change.</p>
        <div className="dialog-actions">
          <Button onClick={() => setConfirmCandidatesOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            setConfirmCandidatesOpen(false)
            void generateCandidates(true)
          }}>Generate candidates</Button>
        </div>
      </Modal>
      <Modal title="Reset puzzle" open={resetOpen} onClose={() => setResetOpen(false)} className="reset-puzzle-dialog">
        <p>{completed || game.timeUntracked ? 'Remove all placed digits, candidates, and colors from this puzzle?'
          : 'Remove all placed digits, candidates, colors, and elapsed time from this puzzle?'}</p>
        <div className="dialog-actions">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => {
            if (completed) openSolvedGrid({ ...restartGame(game), elapsed: savedGame.elapsed, timeUntracked: savedGame.timeUntracked })
            else updateWorkingGame(restartGame)
            setSelected([])
            setColorBrush(null)
            setSelectedColor(null)
            setSelectedDigit(null)
            setDigitHighlight(defaultDigitHighlight)
            setHighlightCandidatePairs(false)
            setHint(null)
            setHintRevealed(false)
            playSession.set(id, 'solutionView', null)
            setResetOpen(false)
          }}>Reset puzzle</Button>
        </div>
      </Modal>
      <Modal title={game.editingId ? 'Cancel puzzle editing?' : 'Cancel puzzle creation?'} open={cancelDraftOpen}
        onClose={() => setCancelDraftOpen(false)} className="reset-puzzle-dialog">
        <p>{game.editingId
          ? 'Discard your changes and return to the saved puzzle?'
          : 'Discard this draft and return to your previous puzzle?'}</p>
        <div className="dialog-actions">
          <Button onClick={() => setCancelDraftOpen(false)}>Keep editing</Button>
          <Button variant="danger" onClick={onCancelDraft}>{game.editingId ? 'Discard changes' : 'Discard draft'}</Button>
        </div>
      </Modal>
    </>
  )
}
