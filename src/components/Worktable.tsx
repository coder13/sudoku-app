Warning: truncated output (original token count: 42826)
Total output lines: 3109

import { fogView, playVariantPuzzle } from '../sudoku/fog'
import { Button, IconButton } from './Button'
import {
  type CSSProperties, type ReactNode, type Dispatch, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import { ArrowRight, Braces, Check, CheckCheck, CloudUpload, Eraser, Eye, Info, Lightbulb, Link2, ListFilter, ListOrdered, LoaderCircle, LogOut, MonitorSmartphone, MoreHorizontal, Palette, Pause, PencilLine, Pin, PinOff, Play, Redo2, RotateCcw, ScanSearch, Share2, Undo2, X, ZoomOut } from 'lucide-react'
import { explainCandidateRecovery, findCandidateRecovery, restoreCandidate, type CandidateRecovery } from '../sudoku/candidate-recovery'
import { recordAction, type ActionKind } from '../sudoku/action-history'
import { PINNABLE_ACTIONS, type PinnedAction } from '../sudoku/pinned-actions'
import { chainCandidate, chainNodeCandidates, makeChainGraph } from '../sudoku/chains'
import { applyChainDeduction } from '../sudoku/chain-sketch'
import { deviceSync } from '../sudoku/device-sync'
import { formatPuzzleRating, SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { createEngineSession, EngineError, replayStep, runEngine, type Candidate, type Deduction, type DeductionAction, type EngineRunner, type EngineSession, type HintChoice } from '../sudoku/engine'
import {
  COLORS, EMPTY, alternateColorShade, applyDeduction, candidateCount, clearCandidateColors, clearImportedDrawings, completeCandidateMasks, conflictsOf, enter, fillEntries,
  formatTime, hasCandidate, hasCandidates, hasUniquenessProof, hintEliminations, isSolved, marksOf, markSolveUntimed, needsInitialCandidates, onlyCandidate, paintCandidate, paintCandidates, paintCandidateStroke, paintCells, puzzleIdentity, redo, replaceCandidates, restartGame, setGamePaused, singleFromCandidates, toggleCandidateGroup, undo, valuesOf, withCellColors,
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
import { markTechniqueSolution, observeTechniqueActions } from '../sudoku/technique-history'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { playerActions } from '../sudoku/technique-progress'
import { matchesHintPosition, puzzleHintPage, puzzleHints, puzzleSolution, type HintPosition } from '../sudoku/puzzle-help'
import { playCandidates } from '../sudoku/variant-play'
import { variantName, variantRuleSections, type VariantRuleSectionId } from '../sudoku/variants'
import { Board, gridCellAtPoint } from './Board'
import { AdvancedPuzzleBrowser, type PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { CellColorPalette } from './CellColorPalette'
import { ChainColorsDialog, ChainsPanel } from './ChainsPanel'
import { SubsetsPanel } from './SubsetsPanel'
import { useSubsets } from './useSubsets'
import { useStrongLinkOverlay } from './useStrongLinkOverlay'
import { CompletedPuzzle } from './CompletedPuzzle'
import { KillerCombos } from './KillerCombos'
import { Controls } from './Controls'
import { DesktopDockLayout } from './DesktopDockLayout'
import { ModeBadge } from './ModeBadge'
import { PuzzleCollectionCredit } from './PuzzleCollections'
import { HintCard } from './HintCard'
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
import { useExperimentalMode, usePlayPreference } from './usePlayPreference'
import { usePuzzleSelection } from './usePuzzleSelection'
import { usePuzzleTimer } from './usePuzzleTimer'
import { usePuzzleZoom } from './usePuzzleZoom'
import { useTouchHold } from './useTouchHold'

const puzzleToolDetails = {
  colors: { label: 'Colors', Icon: Palette },
  chains: { label: 'Chains', Icon: Link2 },
  subsets: { label: 'Subsets', Icon: ScanSearch },
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

async function solveSingleValues({ grid, variant, algebraic, sized, position }: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'sized'> & Partial<Pick<Game, 'position'>>, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[], run = runEngine) {
  if (sized && grid) return sizedRuleSingles(sized, grid, values, eliminations, displayedCandidates, run)
  if (grid?.size === 4) {
    if (algebraic) checkAlgebraicHintPosition(algebraic, values, hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size))
    return miniSingles(values, eliminations, displayedCandidates, run)
  }
  if (!variant) return run({ type: 'solve-singles', values, eliminations, displayedCandidates })
  const puzzle = playVariantPuzzle(variant, position?.entries) ?? variant.puzzle
  const entries = [...values].map((digit, cell) => puzzle.givens[cell] === '0' ? digit : '0').join('')
  return run({ type: 'variant', operation: 'solve-singles', displayedCandidates,
    position: { puzzle, entries, eliminations } })
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

type CellPaintStroke = { gameId: string; color: number; cells: ReadonlySet<number> }
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
  beginResize, toggleMulti, onShare, onPublish, onCancelDraft, onNewPuzzle, onImportPuzzle, onEditCages, onEditSizedRules, onEditRegions, onEditChainColors, onStopPlaying, onSelectPuzzle = roomStore.select, sharedOnOtherDevice, catchUpPuzzle, onMobilePuzzleTopSpaceChange,
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
  const [desktopSubsetsVisible, setDesktopSubsetsVisible] = useState(false)
  const showStrongLinks = savedPlayState?.showStrongLinks ?? false
  const setShowStrongLinks = (value: SetStateAction<boolean>) => playSession.set(game.id, 'showStrongLinks', value)
  const [experimentalMode] = useExperimentalMode()
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
  con…30826 tokens truncated…d ? 'View results' : 'View grid'}
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
        {timing.showPause && !draft && !completed && (mobile || game.started || game.paused) && !previewing && <IconButton type="button" variant="quiet" className="puzzle-pause-trigger"
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
              if (mobile && !puzzleMenuOpen) mobileToolsOpener.current = event.currentTarget
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
            : [puzzleMetadata, puzzleActions, puzzleStage]}
        <PuzzleCollectionCredit game={game} />
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
        <Controls gridSize={gridSize} mode={mode} pencil={pencilActive} togglePencil={() => switchPenPencil(gridInputMode !== 'pencil')}
          candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes}
          colorMode={colorMode} colorTarget={colorTarget} setColorTarget={changeColorTarget} toggleColorMode={mobile ? () => {
            if (colorsVisible) setColorBrush(null)
            setEraseMode(false); setSavedHighlightMode(false); setColorMode((current) => !current)
          } : undefined}
          colorsActive={brush !== null} onSwitchShade={switchColorShade}
          highlightMode={highlightMode} toggleHighlightMode={toggleHighlightMode}
          eraseMode={eraseMode} toggleEraseMode={() => {
            if (colorsVisible) setColorBrush(null)
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

  return (
    <>
      <PlayLayout desktop={desktop} puzzle={puzzlePanel} hint={hintPanel}
        input={desktop ? inputPanel : <MobileInputTabs active={activeToolPanel} open={openPuzzlePanels}
          panels={{ digits: inputPanel, colors: cellColorsPanel, chains: chainsPanel, subsets: subsetsPanel, rules: rulesPanel,
            solution: solutionPathPanel, techniques: techniquesPanel,
          }} activeTabRef={activeMobileInputTabRef}
          toolsDisabled={rearranging} toolToggles={panelToggles.length ? panelToggles : undefined}
          onShowTools={opener => { mobileToolsOpener.current = opener }}
          onSelect={selectToolPanel} onClose={closeToolPanel} />}
        insights={activeDesktopTab ? {
          active: activeDesktopTab.id, tabs: openInsightTabs, tabListRef: insightTabsRef, onSelect: selectToolPanel,
          onClose: () => closeToolPanel(activeDesktopTab.id),
          content: activeDesktopTab.id === 'colors' ? cellColorsPanel : activeDesktopTab.id === 'techniques'
            ? techniquesPanel
            : activeDesktopTab.id === 'chains' ? chainsPanel : activeDesktopTab.id === 'subsets' ? subsetsPanel
              : activeDesktopTab.id === 'rules' ? rulesPanel : solutionPathPanel,
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
          subsets={advancedPanelOpen('subsets') ? subsetsPanel : undefined}
          cellColors={advancedPanelOpen('colors') ? cellColorsPanel : undefined} rules={rulesPanel || undefined}
          hint={advancedHintPanel} solutionPath={advancedPanelOpen('solution') ? solutionPathPanel : undefined}
          techniques={advancedPanelOpen('techniques') ? techniquesPanel : undefined}
          details={detailsPanel} browser={browserPanel} showLeft={showLeftPanel} showRight={showRightPanel} showBottom={showBottomPanel}
          activeToolPanel={activeToolPanel} onSelectToolPanel={selectToolPanel}
          focusHintRequest={focusHintRequest} focusChainsRequest={focusChainsRequest}
          onSubsetsVisibleChange={setDesktopSubsetsVisible} onColorsVisibleChange={setDesktopColorsVisible}
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
