import { Button, IconButton } from './Button'
import {
  type CSSProperties, type ReactNode, type Dispatch, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import { ArrowRight, Braces, Check, CheckCheck, CloudUpload, Eye, Info, Lightbulb, Link2, ListFilter, ListOrdered, LoaderCircle, LogOut, MonitorSmartphone, MoreHorizontal, Palette, Pause, PencilLine, Play, RotateCcw, ScanSearch, Share2, X, ZoomOut } from 'lucide-react'
import { explainCandidateRecovery, findCandidateRecovery, restoreCandidate, type CandidateRecovery } from '../sudoku/candidate-recovery'
import { recordAction, type ActionKind } from '../sudoku/action-history'
import { chainCandidate, makeChainGraph } from '../sudoku/chains'
import { applyChainDeduction } from '../sudoku/chain-sketch'
import { deviceSync } from '../sudoku/device-sync'
import { formatPuzzleRating, SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, replayStep, runEngine, type Candidate, type Deduction, type DeductionAction, type HintChoice } from '../sudoku/engine'
import {
  COLORS, alternateColorShade, applyDeduction, candidateCount, clearCandidateColors, completeCandidateMasks, conflictsOf, enter, fillEntries,
  formatTime, hasCandidate, hintEliminations, isSolved, markSolveUntimed, needsInitialCandidates, onlyCandidate, paintCandidate, paintCandidates, paintCandidateStroke, paintCells, puzzleIdentity, redo, replaceCandidates, restartGame, setGamePaused, singleFromCandidates, undo, valuesOf,
  type ColorTarget, type EnterOptions, type ErrorMode, type Game, type Mode, type Position,
} from '../sudoku/game'
import { analyzeMini, miniSingles, solveMini } from '../sudoku/mini-play'
import { sixPosition, sixRuleDescriptions } from '../sudoku/six-game'
import { sixSingles } from '../sudoku/six-play'
import { algebraicRules, analyzeAlgebraic, checkAlgebraicHintPosition } from '../sudoku/algebraic-play'
import { isAlgebraicCageList } from '../sudoku/algebraic-cages'
import { ALGEBRAIC_CAGES_NAME, MINI_NAME, MINI_RULE, SIX_NAME } from '../sudoku/new-puzzle'
import { CLASSIC_GRID } from '../sudoku/grid'
import { cellReference, describeHint, describeHintDigits, describeHintRemovals, HINT_CANDIDATES_ERROR, HINT_ERROR, NO_HINT, moveHintIndex, moveHintStage, techniqueLabel, type CellReferenceStyle, type HintStage, type PuzzleHint } from '../sudoku/hints'
import { activeHighlightDigit, functionKeyDigit, givenDigitAt, onlyGivensSelected, type DigitHighlightMatch } from '../sudoku/highlighting'
import { aicEndpoints, hintLocation, lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { lessonRoutes } from '../sudoku/lessons'
import { addRatingHints, addSinglesAssistance, hintKey } from '../sudoku/player-rating'
import { applyPuzzleGrade, ratePuzzle } from '../sudoku/puzzle-rating'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'
import type { AdvancedModes, AppearancePreferences, HighlightPreferences, WorkspaceMode } from '../sudoku/preferences'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { cellsOnDragPath, rectangleSelection } from '../sudoku/selection'
import { highlightedDigitShortcut, shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { roomStore } from '../sudoku/storage'
import { chainToolsActive, defaultDigitHighlight, defaultToolPanels, playSession, PUZZLE_TOOL_ORDER, TOOL_PANEL_ORDER, type ToolPanelTab, type PuzzleTool } from '../sudoku/play-session'
import { continueStrongLinkColors } from '../sudoku/strong-link-colors'
import { markTechniqueSolution, observeTechniqueActions } from '../sudoku/technique-history'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { playerActions } from '../sudoku/technique-progress'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../sudoku/puzzle-help'
import { playCandidates } from '../sudoku/variant-play'
import { variantName, variantRuleDescriptions } from '../sudoku/variants'
import { Board, gridCellAtPoint } from './Board'
import { AdvancedPuzzleBrowser, type PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { CellColorPalette } from './CellColorPalette'
import { ChainColorsDialog, ChainsPanel } from './ChainsPanel'
import { SubsetsPanel } from './SubsetsPanel'
import { useSubsets } from './useSubsets'
import { useStrongLinkOverlay } from './useStrongLinkOverlay'
import { CompletedPuzzle } from './CompletedPuzzle'
import { Controls } from './Controls'
import { DesktopDockLayout } from './DesktopDockLayout'
import { ModeBadge } from './ModeBadge'
import { PuzzleCollectionCredit } from './PuzzleCollections'
import { HintCard } from './HintCard'
import { MobileInputTabs } from './MobileInputTabs'
import { PlayHint, PlayLayout } from './PlayLayout'
import { useMobileLayout } from './mobile-layout'
import { useGridClickAway } from './useGridClickAway'
import { Modal } from './Modal'
import { MotionSurface, usePresence } from './Presence'
import { PuzzleCheckResult, validation, type DialogResult } from './PuzzleCheckResult'
import { PuzzleAnalysisContents } from './PuzzleAnalysis'
import { SolutionPath, solutionEndSummary, solutionStatus, type SolutionPathState } from './SolutionPath'
import { useChainSketch } from './useChainSketch'
import { useActionHistory } from './useActionHistory'
import { useExperimentalMode, usePlayPreference } from './usePlayPreference'
import { usePuzzleSelection } from './usePuzzleSelection'
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
] as const

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}

function candidateToolMasks(notes: readonly number[] | null | undefined, values: string, displayed: readonly number[] | null, eliminations?: readonly number[]) {
  return notes?.map((mask, cell) => values[cell] === '0'
    ? mask & (displayed?.[cell] ?? 0x1ff) & ~(eliminations?.[cell] ?? 0) : 0) ?? null
}

async function solveSingleValues({ grid, variant, algebraic, six }: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'six'>, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  if (six && grid?.size === 6) return sixSingles(six, grid, values, eliminations, displayedCandidates)
  if (grid?.size === 4) {
    if (algebraic) checkAlgebraicHintPosition(algebraic, values, hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size))
    return miniSingles(values, eliminations, displayedCandidates)
  }
  if (!variant) return runEngine({ type: 'solve-singles', values, eliminations, displayedCandidates })
  const entries = [...values].map((digit, cell) => variant.puzzle.givens[cell] === '0' ? digit : '0').join('')
  return runEngine({ type: 'variant', operation: 'solve-singles', displayedCandidates,
    position: { puzzle: variant.puzzle, entries, eliminations } })
}

function useTimer(id: string, running: boolean) {
  useEffect(() => {
    if (!running) return
    let started: number | null = null
    let locks: LockManager | undefined = navigator.locks
    let lockRequest: AbortController | undefined

    function tick() {
      if (started === null) return
      const seconds = Math.floor((performance.now() - started) / 1000)
      if (seconds < 1) return
      started += seconds * 1000
      if (!puzzleTiming.getSnapshot().trackTime) return
      roomStore.update(id, (current) => !current.started || current.paused || current.timeUntracked || isSolved(current)
        ? current : { ...current, elapsed: current.elapsed + seconds })
    }

    function start() {
      if (started !== null || lockRequest) return
      if (!locks) {
        started = performance.now()
        return
      }
      const request = new AbortController()
      lockRequest = request
      // One visible tab advances the saved clock. A second tab waits without counting.
      void locks.request(`sudoku-puzzle-timer:${id}`, { signal: request.signal }, () => {
        if (request.signal.aborted) return
        started = performance.now()
        return new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))
      }).catch(() => {
        if (request.signal.aborted) return
        locks = undefined
        lockRequest = undefined
        updateVisibility()
      })
    }

    function stop() {
      tick()
      started = null
      lockRequest?.abort()
      lockRequest = undefined
    }

    function updateVisibility() {
      // Use the focused tab when Web Locks are unavailable.
      if (document.visibilityState === 'visible' && (locks || document.hasFocus())) start()
      else stop()
    }

    const timer = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', updateVisibility)
    window.addEventListener('focus', updateVisibility)
    window.addEventListener('blur', updateVisibility)
    window.addEventListener('pageshow', updateVisibility)
    window.addEventListener('pagehide', stop)
    updateVisibility()
    return () => {
      stop()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', updateVisibility)
      window.removeEventListener('focus', updateVisibility)
      window.removeEventListener('blur', updateVisibility)
      window.removeEventListener('pageshow', updateVisibility)
      window.removeEventListener('pagehide', stop)
    }
  }, [id, running])
}

export type WorktableActions = { check: () => void }
type SolvedGridSession = { current: Game }

type HintPosition = Pick<Position, 'center' | 'corner' | 'eliminations'> & {
  gameId: string
  values: string
}

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

type CandidatePress = {
  pointerId: number
  cell: number
  digit: number
  mode: CandidateDrag['mode']
  cancelled: boolean
}

function isAltClick(event: Pick<MouseEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>) {
  return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
}

function matchesHintPosition(game: Game, position: HintPosition) {
  const { center, corner, eliminations } = game.position
  return game.id === position.gameId && center === position.center && corner === position.corner &&
    eliminations === position.eliminations && valuesOf(game) === position.values
}

function isChainStep(step?: Deduction) {
  if (!step) return false
  const { evidence, technique } = step
  return 'chain' in evidence || 'inference' in evidence || 'single-digit-chain' in evidence || 'coloring' in evidence ||
    ['forcing-chain', 'als-chain', 'sk-loop'].includes(technique)
}

function withRatingHints(game: Game, keys: readonly string[], applied = false, request?: Parameters<typeof addRatingHints>[3]): Game {
  if (!game.ratingAttempt) return game
  const ratingAttempt = addRatingHints(game.ratingAttempt, keys, applied, request)
  return ratingAttempt === game.ratingAttempt ? game : { ...game, ratingAttempt }
}

export function Worktable({
  game: savedGame, games, placeholder, storageAvailable = true, preferredDifficulty, modalOpen, advancedModes, appearance, highlighting, errorMode, multi, actionsRef, inputSize, panelHeight, setPanelHeight,
  beginResize, toggleMulti, onShare, onPublish, onCancelDraft, onNewPuzzle, onCreatePuzzle, onEditPuzzle, onEditCages, onEditSixRules, onEditChainColors, onStopPlaying, sharedOnOtherDevice, catchUpPuzzle,
  pausedOnLaunch = false, onResumeLaunch, loadingPuzzle = false, cellReferenceStyle, workspaceMode, showLeftPanel, showRightPanel, showBottomPanel, onOpenHintPanel, onOpenRightPanel, puzzleBrowserView, setPuzzleBrowserView,
}: {
  game: Game
  games: Game[]
  placeholder?: ReactNode
  storageAvailable?: boolean
  preferredDifficulty: DifficultyPreference
  modalOpen: boolean
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
  pausedOnLaunch?: boolean
  onResumeLaunch?: () => void
  loadingPuzzle?: boolean
  sharedOnOtherDevice?: boolean
  catchUpPuzzle?: Game
  onNewPuzzle: (step?: 'difficulty') => void
  onCreatePuzzle: () => void
  onEditPuzzle: () => void
  onEditCages?: () => void
  onEditSixRules?: () => void
  onEditChainColors?: () => void
  showLeftPanel: boolean
  showRightPanel: boolean
  showBottomPanel: boolean
  onOpenHintPanel: () => void
  onOpenRightPanel: () => void
  puzzleBrowserView: PuzzleBrowserView
  setPuzzleBrowserView: (view: PuzzleBrowserView) => void
}) {
  // The saved solve still owns the results. Editing the grid uses a temporary session.
  const [solvedGrid, setSolvedGrid] = useState<{ session: SolvedGridSession; game: Game } | null>(null)
  const solvedGridSession = useRef<SolvedGridSession | null>(null)
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
  const start = game.givens[40] === '0' ? 40 : Math.max(0, game.givens.indexOf('0'))
  const modeBadgeId = useId()
  const puzzleStageId = useId()
  const [modeBadgePosition, setModeBadgePosition] = usePlayPreference('cardModeBadgePosition')
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
  const [failedChainActions, setFailedChainActions] = useState<readonly DeductionAction[] | null>(null)
  const [chainColorsOpen, setChainColorsOpen] = useState(false)
  const [highlightCandidatePairs, setHighlightCandidatePairs] = usePlayPreference('highlightCandidatePairs')
  const [savedHighlightMode, setSavedHighlightMode] = usePlayPreference('highlightMode')
  const [savedPencil, setPencil] = usePlayPreference('pencil')
  // A multi-digit highlight temporarily takes precedence over the saved input mode.
  const automaticHighlightMode = candidateCount(highlightedDigitMask) > 1 && !digitHighlight.modeOverridden
  const highlightMode = savedHighlightMode || automaticHighlightMode
  const pencil = savedPencil && !highlightMode
  const [pencilModifier, setPencilModifier] = useState(false)
  const [candidatePreviewCell, setCandidatePreviewCell] = useState<number | null>(null)
  const [candidateKind, setCandidateKind] = usePlayPreference('candidateKind')
  const [savedColorMode, setColorMode] = usePlayPreference('colorMode')
  const [eraseMode, setEraseMode] = usePlayPreference('eraseMode')
  const [solution, setSolution] = useState<string | null>(null)
  const [dialogResult, setDialogResult] = useState<DialogResult | null>(null)
  const [variantRulesOpen, setVariantRulesOpen] = useState(false)
  const [desktopSolutionVisible, setDesktopSolutionVisible] = useState(false)
  const [puzzleMenuOpen, setPuzzleMenuOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [cancelDraftOpen, setCancelDraftOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [notes, setNotes] = useState<{
    gameId: string; values: string; eliminations?: number[]; variant?: Game['variant']; algebraic?: Game['algebraic']; six?: Game['six']; masks: number[] | null; failed?: boolean
  }>()
  const [hintState, setHint] = useState<HintState | null>(null)
  const [hintRevealed, setHintRevealed] = useState(false)
  const mobile = useMobileLayout()
  const desktop = !mobile
  const wasMobile = useRef(mobile)
  const colorMode = desktop && savedColorMode && !automaticHighlightMode
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
  const restoreCellFocus = useRef<number | null>(null)
  const puzzleCardRef = useRef<HTMLElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const puzzleMenuPopupRef = useRef<HTMLDivElement>(null)
  const insightTabsRef = useRef<HTMLDivElement>(null)
  const activeMobileInputTabRef = useRef<HTMLButtonElement>(null)
  const focusMobileInput = useRef(false)
  const mobileToolsOpener = useRef<HTMLButtonElement | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileHintPanelRef = useRef<HTMLDivElement>(null)
  const hintReturnFocus = useRef<HTMLElement | null>(null)
  const dragSelection = useRef<{ pointerId: number; start: number; base: number[]; additive: boolean; moved: boolean } | null>(null)
  const candidateDrag = useRef<CandidateDrag | null>(null)
  const candidatePress = useRef<CandidatePress | null>(null)
  const hoveredCell = useRef<number | null>(null)
  const suppressCellClick = useRef(false)
  const pendingDoubleClickSingle = useRef<{ index: number; digit: number; game: Game } | null>(null)
  const techniqueHintRequest = useRef(0)
  const pageRequest = useRef(0)
  const hintCollection = hintState?.page?.collection
  useEffect(() => () => {
    if (hintCollection !== undefined) void runEngine({ type: 'release-hints', collection: hintCollection }).catch(() => {})
  }, [hintCollection])
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries])
  const coloringDigit = activeHighlightDigit(values, selected, active, selectedDigit)
  const { center, corner, eliminations } = game.position
  const displayedCandidates = useMemo(() => completeCandidateMasks(game), [values, center, corner])
  const hintPosition = useMemo(() => ({ gameId: game.id, values, center, corner, eliminations }),
    [game.id, values, center, corner, eliminations])
  useEffect(() => () => { techniqueHintRequest.current++ }, [hintPosition])
  const conflicts = useMemo(() => conflictsOf(values, game.variant?.puzzle, grid, game.six?.rules), [values, game.variant, grid, game.six])
  const draft = game.source === 'draft'
  const { id, givens, difficulty, score, variant, algebraic, six, generatedWithAuto } = game
  const solutionIdentity = useMemo(() => puzzleIdentity({ givens, variant, algebraic, grid, six }), [givens, variant, algebraic, grid, six])
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
  const showMobileHintCard = mobileHintOpen || rearranging
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
  const hintAnnotations = playerVisualsSelected ? undefined : availableHintAnnotations
  const hintCopy = recovery ? {
    title: HINT_CANDIDATES_ERROR.title,
    text: hintStage === 'technique' ? 'Your placed digits match the solution. A required candidate is missing.'
      : [`Check ${recoveryCell}.`, recoveryHistory].filter(Boolean).join(' '),
  } : !deduction ? visibleHint?.error ?? NO_HINT
    : fullHint ? describeHint(deduction, { difficulty: hintDifficulty, cellReferenceStyle, gridSize })
    : {
      title: techniqueLabel(deduction.technique),
      text: hintStage === 'technique' ? '' : endpointMarks ? locationClue.text
        : [describeHintDigits(deduction), locationClue?.text].filter(Boolean).join(' '),
    }
  const showResults = completed && !playground
  const showSolvedGrid = Boolean(playground)
  const draftCages = game.position.draftCages
  const cages = algebraic?.rules ?? draftCages
  const sixRules = six?.rules ?? game.position.draftSixRules
  const sizedName = cages ? ALGEBRAIC_CAGES_NAME : grid?.size === 6 ? SIX_NAME : MINI_NAME
  const needsRating = !grid && (difficulty === undefined || score === undefined)
  const needsAttempt = !grid && !completed && !game.ratingAttempt
  const ratingPending = !draft && needsRating && !ratingFailed
  const advancedWorkspace = desktop && workspaceMode === 'advanced'
  const panelAvailable = (panel: PuzzleTool) => !placeholder && !draft &&
    (panel !== 'chains' || !grid) && (panel !== 'subsets' || experimentalMode) &&
    (!solved || panel === 'solution' || panel === 'techniques')
  const openPuzzlePanels = toolPanels.open.filter(panelAvailable)
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
  const disabled = Boolean(placeholder) || previewing || game.paused || rearranging
  const cellColorsDisabled = draft || disabled || (solved && !showSolvedGrid)
  const chainsVisible = !grid && (mobile ? activeToolPanel === 'chains'
    : advancedWorkspace ? showRightPanel && desktopChainsVisible : activeDesktopTab?.id === 'chains')
  const subsetsVisible = experimentalMode && (mobile ? activeToolPanel === 'subsets'
    : advancedWorkspace ? showRightPanel && desktopSubsetsVisible : activeDesktopTab?.id === 'subsets')
  const colorsPanelOpen = openPuzzlePanels.includes('colors')
  const chainsPanelOpen = openPuzzlePanels.includes('chains')
  const chainKeypadVisible = !grid && chainsPanelOpen && (mobile ? activeToolPanel === 'digits'
    : advancedWorkspace && desktopInputVisible)
  const drawingIntent = savedPlayState?.drawingIntent ?? null
  const chainDrawingRequested = drawingIntent ?? (game.chainSketch?.pending != null)
  const chainsActive = !grid && chainToolsActive(chainsVisible, chainKeypadVisible, showStrongLinks, drawingIntent,
    game.chainSketch?.pending != null)
  const variantEliminations = (variant || grid) && eliminations
  const puzzleNotes = notes?.gameId === id && notes.variant === variant && notes.algebraic === algebraic && notes.six === six ? notes : undefined
  const currentNotes = puzzleNotes?.values === values && puzzleNotes.eliminations === variantEliminations ? puzzleNotes : undefined
  const masks = currentNotes?.masks
  const completeSubsetMasks = useMemo(() => candidateToolMasks(masks, values, null, eliminations), [masks, values, eliminations])
  const subsetMasks = useMemo(() => completeSubsetMasks && displayedCandidates
    ? completeSubsetMasks.map((mask, cell) => mask & (displayedCandidates[cell] ?? 0x1ff)) : completeSubsetMasks,
  [completeSubsetMasks, displayedCandidates])
  const autoGenerateCandidates = advancedModes.autoGenerateCandidates && !draft && !solved && needsInitialCandidates(game)
  const hasSingles = useMemo(() => !draft && !solved && Boolean(masks &&
    singleFromCandidates(values, displayedCandidates ?? masks, eliminations, variant?.puzzle, grid, six?.rules)),
    [draft, solved, masks, values, displayedCandidates, eliminations, variant, grid, six])
  const needsSinglesCheck = !grid && !generatedWithAuto && difficulty !== 'easy'
  const offerSingles = !draft && !solved && (grid || generatedWithAuto || (
    !ratingPending && needsSinglesCheck && singlesCheck?.givens === givens && singlesCheck.variant === variant && singlesCheck.needsMore
  ))
  const showChainSketches = chainsActive || !grid && Boolean(game.chainSketch)
  const chainMasks = useMemo(() => {
    if (!showChainSketches || draft || solved) return null
    return currentNotes ? subsetMasks : candidateToolMasks(puzzleNotes?.masks, values, displayedCandidates, eliminations)
  }, [showChainSketches, draft, solved, currentNotes, subsetMasks, puzzleNotes, values, displayedCandidates, eliminations])
  const missingChainCandidates = chainMasks?.some((mask, cell) => !mask && values[cell] === '0')
  const chainGraph = useMemo(() => chainMasks ? makeChainGraph(chainMasks, variant?.puzzle) : null, [chainMasks, variant])
  const canAnalyzeChains = Boolean(masks && !missingChainCandidates && !disabled)
  const playerHighlightMask = colorMode || eraseMode ? 0 : highlightedDigitMask
  const startHighlightDigit = playerHighlightMask ? onlyCandidate(playerHighlightMask) : coloringDigit
  const sketch = useChainSketch(game, chainGraph, {
    canDraw: chainsActive && !completed, graphCurrent: Boolean(masks), canAnalyze: canAnalyzeChains, startHighlightDigit,
    drawingIntent: savedHighlightMode ? false : drawingIntent,
    setDrawingIntent: intent => playSession.set(id, 'drawingIntent', intent),
  })
  const canApplyChainEdits = chainsPanelOpen && Boolean(chainMasks && canAnalyzeChains && sketch.allActions.length)
  const canApplyHintEdit = fullHint && !recovery && Boolean(deduction && hintCandidates) && (!advancedWorkspace || showBottomPanel)
  const chainHighlightDigit = sketch.active.highlightedDigit
  const strongLinkMask = playerHighlightMask
  const strongLinksVisible = !savedHighlightMode && showStrongLinks && chainsActive && canAnalyzeChains && !hintAnnotations
  const strongLinks = useStrongLinkOverlay(strongLinksVisible ? chainGraph : null, strongLinkMask, sketch.annotations,
    sketch.colorPairs, sketch.usedColorPairs, sketch.assignedColors)
  const browsingStrongLinks = strongLinksVisible && !sketch.drawing
  const inspectSubset = !savedHighlightMode && subsetsVisible && !hintAnnotations && !disabled && !draft && !solved && !sketch.drawing && !browsingStrongLinks
  const subset = useSubsets(inspectSubset ? subsetMasks : null, completeSubsetMasks, selected, values, grid ?? CLASSIC_GRID, variant?.puzzle)
  const canPaint = !cellColorsDisabled
  const colorsVisible = mobile ? activeToolPanel === 'colors'
    : advancedWorkspace ? showRightPanel && desktopColorsVisible : activeDesktopTab?.id === 'colors'
  const brush = !savedHighlightMode && canPaint && colorsVisible && !hintAnnotations ? colorBrush : null
  const mobileHintPreview = mobileHintOpen && !playerVisualsSelected
  const candidateBrush = colorTarget === 'candidate' && !cellColorsDisabled && !sketch.drawing && !hintAnnotations && !mobileHintPreview
    ? colorMode ? selectedColor : brush : null
  const paintingCandidates = candidateBrush !== null
  const colorLinkMasks = displayedCandidates && subsetMasks &&
    !subsetMasks.some((mask, cell) => values[cell] === '0' && !mask) ? subsetMasks : null
  const paintedStart = lastColoredCandidate?.gameId === id && lastColoredCandidate.candidate.cell === active
    ? lastColoredCandidate.candidate : null
  const colorStartCell = selected.length > 1 ? null : selected[0] ?? active
  const colorStartDigit = colorTarget === 'candidate' && !selected.length && paintedStart ? paintedStart.digit : coloringDigit
  const colorStart = useMemo(() => colorStartCell !== null && colorStartDigit
    ? { cell: colorStartCell, digit: colorStartDigit } : null, [colorStartCell, colorStartDigit])
  const colorContinuation = useMemo(() => !grid && colorsVisible && colorLinkMasks && colorStart
    ? continueStrongLinkColors(colorLinkMasks, colorStart, game.position, colorTarget, variant?.puzzle) : null,
  [colorsVisible, colorLinkMasks, colorStart, game.position, colorTarget, variant, grid])
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
    : colorContinuation?.status === 'missing-candidate' ? `Choose a cell with candidate ${colorStart.digit}.`
    : colorContinuation?.status === 'no-links' ? `${colorStart.digit} in ${colorStartLocation} has no strong links.`
    : colorContinuation?.status === 'link-conflict' ? 'This group cannot alternate shades. Check its candidates.'
    : colorConflict ? `The color at ${colorConflictLocation} conflicts with this group. Adjust or erase that color.`
    : colorContinuation?.status === 'complete' ? `The group for ${colorStart.digit} at ${colorStartLocation} is fully colored.`
    : `Continue ${colorStart.digit} from ${colorStartLocation}: ${remainingColors} more ${colorSubject}${remainingColors === 1 ? '' : 's'}.`
  const canActivateTemporaryPencil = !pencil && !highlightMode && !colorMode && !eraseMode &&
    !disabled && !draft && !solved && !sketch.drawing && brush === null && !modalOpen && !mobileHintPreview &&
    !puzzleMenuOpen && !actionsOpen && !dialogResult && !resetOpen && !variantRulesOpen
  const temporaryPencil = pencilModifier && canActivateTemporaryPencil
  const pencilActive = (pencil || temporaryPencil) && !colorMode && !eraseMode
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencilActive ? candidateMode : 'value'
  const penOrPencil = !draft && !highlightMode && !colorMode && !eraseMode && brush === null
  const givenHighlightSelection = penOrPencil && onlyGivensSelected(givens, selected)
  const hasInputSelection = selected.length > 0 && !givenHighlightSelection
  const cellDrivenHighlight = givenHighlightSelection || (penOrPencil && !selectedDigit && !highlightedDigitMask &&
    selected.length === 1 && values[selected[0]] !== '0')
  const canDragCandidates = !disabled && !draft && pencilActive && !highlightMode && !colorMode && !eraseMode &&
    !paintingCandidates && !multi && !sketch.drawing && !hintAnnotations && selectedDigit !== null && selectedDigit > 0
  const canPreviewCandidates = canDragCandidates && selected.length === 0 && brush === null && !solved &&
    !modalOpen && !mobileHintPreview && !puzzleMenuOpen && !actionsOpen && !dialogResult && !resetOpen &&
    !variantRulesOpen
  const canHighlightCellCandidates = !disabled && !draft && !solved && !colorMode && !eraseMode && !sketch.drawing && brush === null &&
    !paintingCandidates && !modalOpen && !hintAnnotations && !mobileHintPreview && !puzzleMenuOpen && !actionsOpen && !dialogResult &&
    !resetOpen && !variantRulesOpen
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
  const solutionStep = Math.min(solutionView?.step ?? 0, trace?.steps.length ?? 0)
  const previewPosition = trace?.positions?.[solutionStep]
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
    : trace && solutionStep === trace.steps.length
      ? solutionEndSummary(solutionStatus(trace))
      : null

  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  const showElapsedTime = timing.showTimer && !game.timeUntracked && (timing.trackTime || completed)
  useTimer(game.id, !rearranging && timing.trackTime && !game.timeUntracked && !draft && game.started && !game.paused && !completed && !modalOpen && !puzzleMenuOpen && !actionsOpen && !previewing && dialogResult === null &&
    !resetOpen && !cancelDraftOpen && !variantRulesOpen && !chainColorsOpen)

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
      roomStore.update(id, current => isSolved(current) ? current : transform(current))
    }
  }, [completed, id, session])

  function resumePuzzle() {
    if (pausedOnLaunch) onResumeLaunch?.()
    updateWorkingGame((current) => setGamePaused(current, false))
  }

  function togglePause() {
    setActionsOpen(false)
    setPuzzleMenuOpen(false)
    if (game.paused) resumePuzzle()
    else updateWorkingGame((current) => setGamePaused(current, true))
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
    setVariantRulesOpen(false)
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
    candidatePress.current = null
    hoveredCell.current = null
    setCandidatePreviewCell(null)
    suppressCellClick.current = false
  }, [game.id, game.source])

  useGridClickAway(boardRef, () => { if (!rearranging) setSelected([]) }, (target) => Boolean(
    target.closest('[data-panel-editor], .desktop-layout-edge, .desktop-layout-divider, .puzzle-mode-tab, .desktop-insight-panel, .mobile-input-toolbar, .mobile-input-resize, .input-tools, .chains-panel, .subsets-panel')
      || target.closest('.puzzle-menu-wrap, .desktop-dock .dv-tab')
      || target.closest('.controls, .cell-color-palette, .hint-card, .solution-path, .puzzle-actions-sheet, .desktop-actions-menu')
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
      const height = menu.offsetHeight * scale
      const gap = 8
      const left = Math.max(gap, anchor.left - width - gap)
      const top = Math.max(gap, Math.min(anchor.top + (anchor.height - height) / 2, window.innerHeight - height - gap))
      menu.style.left = `${left / scale}px`
      menu.style.top = `${top / scale}px`
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
    if (!mobile || !puzzleMenuMounted || !menu || !button) return

    menu.showPopover?.()
    const position = () => {
      const anchor = button.getBoundingClientRect()
      const gap = 8
      const below = window.innerHeight - anchor.bottom - 2 * gap
      const above = anchor.top - 2 * gap
      const opensAbove = menu.scrollHeight + 2 > below && above > below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`
      const right = Math.min(anchor.right, window.innerWidth - gap)
      const top = opensAbove ? anchor.top - gap - menu.offsetHeight : anchor.bottom + gap
      menu.style.left = `${Math.max(gap, right - menu.offsetWidth)}px`
      menu.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - menu.offsetHeight - gap))}px`
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
  }, [mobile, puzzleMenuMounted])

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

  const requestSolution = useEffectEvent(() => puzzleSolution(game))
  useEffect(() => {
    if (game.paused || !solutionPathRevealed || cachedSolution) return
    let current = true
    const finish = (path: SolutionPathState) => {
      if (current) setLoadedSolution({ id, identity: solutionIdentity, retry: solutionRetry, path })
    }
    void requestSolution().then(result => {
      if (result.positions?.length !== result.steps.length + 1) throw new Error('Missing solution positions')
      finish({ status: 'ready', trace: result })
    }).catch((error: unknown) => finish({
      status: 'unavailable',
      message: error instanceof EngineError && error.code === 'search-limit'
        ? 'The solver reached its search limit before finding a path.'
        : 'The solution couldn’t load.',
    }))
    return () => { current = false }
  }, [id, game.paused, solutionIdentity, solutionPathRevealed, solutionRetry, cachedSolution])

  useEffect(() => {
    if (draft || !needsRating && !needsAttempt) return
    let current = true
    void ratePuzzle(givens, variant).then((grade) => {
      if (!current) return
      roomStore.update(id, (latest) => latest.givens === givens && latest.variant === variant ? applyPuzzleGrade(latest, grade) : latest, { derived: true })
    }).catch(() => {
      if (current) setRatingFailed(true)
    })
    return () => { current = false }
  }, [id, givens, draft, needsAttempt, needsRating, variant])

  useEffect(() => {
    if (draft || solved || !needsSinglesCheck) return
    let current = true
    const check = variant
      ? solveSingleValues({ variant }, givens).then((board) => board.includes('0'))
      : runEngine({ type: 'rate', values: givens, techniqueOrder: SINGLE_TECHNIQUES }).then(({ status }) => status === 'stalled')
    void check.then((needsMore) => {
      if (current) setSinglesCheck({ givens, variant, needsMore })
    }).catch(() => { /* Leave the action hidden when the starting puzzle cannot be checked. */ })
    return () => { current = false }
  }, [draft, givens, needsSinglesCheck, solved, variant])

  useEffect(() => {
    if (!autoGenerateCandidates || !masks) return
    updateWorkingGame((current) => current.givens === givens && valuesOf(current) === values && needsInitialCandidates(current)
      ? replaceCandidates(current, masks, { recordHistory: false })
      : current)
  }, [autoGenerateCandidates, givens, masks, updateWorkingGame, values])

  useEffect(() => {
    let current = true
    if (draft || solved) return

    void playCandidates(game).then((masks) => {
      if (current) setNotes({ gameId: id, values, eliminations: variantEliminations, variant, algebraic, six, masks })
    }).catch(() => {
      if (current) setNotes({ gameId: id, values, eliminations: variantEliminations, variant, algebraic, six, masks: null, failed: true })
    })

    return () => { current = false }
  }, [id, draft, solved, values, variant, algebraic, six, variantEliminations, grid])

  useLayoutEffect(() => {
    if (wasMobile.current && advancedWorkspace && openPuzzlePanels.length && !showRightPanel) onOpenRightPanel()
    wasMobile.current = mobile
  }, [mobile, advancedWorkspace, openPuzzlePanels.length, showRightPanel, onOpenRightPanel])

  useLayoutEffect(() => {
    if (!startDrawingOnOpen || !chainsVisible || !currentNotes) return
    setStartDrawingOnOpen(false)
    if (!savedHighlightMode && chainGraph && !sketch.drawing) sketch.toggle()
  }, [startDrawingOnOpen, chainsVisible, currentNotes, savedHighlightMode, chainGraph, sketch])

  useLayoutEffect(() => {
    if (chainsVisible) return () => setStartDrawingOnOpen(false)
  }, [chainsVisible])

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
    } else if (!mobile && showSolvedGrid) boardRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true })
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

  useEffect(() => {
    function finishGridPointer(event: PointerEvent) {
      const press = candidatePress.current
      if (press?.pointerId === event.pointerId) {
        press.cancelled ||= event.type === 'pointercancel' || gridCellAtPoint(boardRef.current, event) !== press.cell
        setCandidatePreviewCell(null)
      }
      let suppressClick = false
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
    if (canPreviewCandidates && (!press || (press.digit === selectedDigit && press.mode === candidateMode))) {
      if (temporaryPencil && !press) setCandidatePreviewCell(hoveredCell.current)
      return
    }
    if (press) press.cancelled = true
    setCandidatePreviewCell(null)
  }, [canPreviewCandidates, candidateMode, selectedDigit, temporaryPencil])

  const showSolutionErrors = errorMode === 'all' || errorMode === 'incorrect'
  useEffect(() => {
    let current = true
    setSolution(showSolutionErrors ? six?.solution ?? algebraic?.solution ?? variant?.solution ?? null : null)
    if (!draft && showSolutionErrors && !variant && !algebraic && !six) {
      void (grid ? solveMini(game.givens) : runEngine({ type: 'solve', values: game.givens }))
        .then((result) => { if (current) setSolution(result) })
        .catch(() => { /* Checking still works if the solution cannot be loaded. */ })
    }
    return () => { current = false }
  }, [draft, game.givens, showSolutionErrors, variant, algebraic, six, grid])

  const errors = useMemo(() => {
    const result = new Set<number>()
    if (errorMode === 'none' || draft) return result
    if (errorMode === 'conflicts') return conflicts
    if (errorMode === 'all') conflicts.forEach((index) => result.add(index))
    if (showSolutionErrors && solution) {
      for (let index = 0; index < game.position.entries.length; index++) {
        if (game.position.entries[index] !== '0' && game.position.entries[index] !== solution[index]) result.add(index)
      }
    }
    return result
  }, [conflicts, draft, errorMode, game.position.entries, showSolutionErrors, solution])

  const nakedSinglesRequest = useRef(0)
  useEffect(() => () => { nakedSinglesRequest.current++ }, [advancedModes.autoPlaceNakedSingles, advancedModes.autoRemoveCandidates, disabled, id, modalOpen])

  function edit(transform: (current: Game) => Game, kind: ActionKind = transform === undo ? 'undo' : transform === redo ? 'redo' : 'edit',
    options?: { technique?: string; actions?: readonly DeductionAction[] }) {
    if (disabled) return
    updateWorkingGame((current) => recordAction(current, transform(current), kind, options))
  }

  function enterFromInput(cells: number[], digit: number, inputMode: Mode, options?: EnterOptions) {
    if (inputMode === 'color') changeHintVisuals('player')
    let placement: Game | undefined
    edit((current) => {
      const origin = current
      const next = enter(origin, cells, inputMode, digit, { removeCandidates: advancedModes.autoRemoveCandidates, ...options })
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
    const entered = valuesOf(origin)
    if (isSolved(origin) || conflictsOf(entered, origin.variant?.puzzle, origin.grid, origin.six?.rules).size) return
    try {
      const available = await playCandidates(origin)
      if (request !== nakedSinglesRequest.current || !available || available.some((mask, cell) => entered[cell] === '0' && !mask)) return
      const placements = available.flatMap((mask, cell) => {
        const digit = entered[cell] === '0' ? onlyCandidate(mask) : null
        return digit === null ? [] : [{ place: { cell, digit } }]
      })
      if (!placements.length) return
      const result = [...entered]
      for (const { place } of placements) result[place.cell] = String(place.digit)
      const filled = result.join('')
      if (conflictsOf(filled, origin.variant?.puzzle, origin.grid, origin.six?.rules).size) return
      updateWorkingGame((current) => {
        if (current.paused || current.position !== origin.position) return current
        const next = recordAction(current, fillEntries(current, filled, advancedModes.autoRemoveCandidates), 'singles')
        void observeTechniqueActions(current, placements, 'automated')
        return current.ratingAttempt ? { ...next, ratingAttempt: addSinglesAssistance(current.ratingAttempt, 'partial') } : next
      })
    } catch { /* The player's move remains saved if the engine cannot find candidates. */ }
  }

  function setStrongLinkHighlights(mask: SetStateAction<number>) {
    setSelected([])
    setColorMode(false)
    showDigitHighlights(mask, 'any')
  }

  function toggleStrongLinkDigit(digit: number) {
    setStrongLinkHighlights((mask) => (colorMode || eraseMode ? 0 : mask) ^ (1 << (digit - 1)))
  }

  function selectStrongLinkCandidate(candidate: Candidate) {
    if (sketch.drawing && !sketch.active.hidden && (sketch.pending !== null || sketch.contains(candidate))) sketch.select(candidate)
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

  function stopDrawingAndFocusGrid() {
    sketch.stop()
    requestAnimationFrame(() => boardRef.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus({ preventScroll: true }))
  }

  function input(digit: number, inputMode = highlightMode ? 'value' : mode, cells = selected, placeInSelection = false) {
    if (inputMode !== 'color' && digit > gridSize) return
    if (brush !== null && inputMode === 'value') {
      clearHighlightedDigits()
      highlightColorDigit(digit === 0 || digit === coloringDigit ? null : digit)
      return
    }
    if (colorsVisible) setColorBrush(null)
    if (inputMode === 'color') {
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
      if (highlightMode && !placeInSelection && inputMode === 'value' && digit > 0 && onlyGivensSelected(game.givens, cells)) {
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

  function showDigitHighlights(mask: SetStateAction<number>, match: DigitHighlightMatch) {
    setDigitHighlight((current) => {
      const nextMask = typeof mask === 'function' ? mask(current.mask) : mask
      return { mask: nextMask, match, modeOverridden: current.modeOverridden && candidateCount(nextMask) > 1 }
    })
    setSelectedDigit(null)
    setHighlightCandidatePairs(false)
    if (colorsVisible) setColorBrush(null)
    setEraseMode(false)
  }

  function toggleDigitHighlight(digit: number, match: DigitHighlightMatch) {
    if (cellDrivenHighlight) setSelected([])
    const previous = selectedDigit ? 1 << (selectedDigit - 1) : 0
    showDigitHighlights((current) => (current || previous) ^ (1 << (digit - 1)), match)
  }

  function changeDigitHighlightMatch(match: DigitHighlightMatch) {
    const previous = selectedDigit ? 1 << (selectedDigit - 1) : 0
    showDigitHighlights((current) => current || previous, match)
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
    if (sketch.drawing) sketch.suspend()
    if (colorTarget === 'cell' && selected.length) {
      edit((current) => enter(current, selected, 'color', color))
      setSelected([])
    }
    changeHintVisuals('player')
    setColorMode(false)
    setEraseMode(false)
    setSelectedDigit(coloringDigit)
    setSelectedColor(color)
    setColorBrush(color)
  }

  function highlightColorDigit(digit: number | null) {
    setSelected([])
    setHighlightCandidatePairs(false)
    setSelectedDigit(digit)
  }

  function switchColorShade() {
    if (cellColorsDisabled || sketch.drawing) return
    const color = colorMode ? selectedColor : brush
    const alternate = color === null ? null : alternateColorShade(color)
    if (alternate === null) return
    setSelectedColor(alternate)
    if (!colorMode) setColorBrush(alternate)
  }

  function setHighlightMode(enabled: boolean) {
    setDigitHighlight((current) => !current.modeOverridden && candidateCount(current.mask) > 1
      ? { ...current, modeOverridden: true } : current)
    setSavedHighlightMode(enabled)
  }

  function toggleHighlightMode() {
    const enable = sketch.drawing || browsingStrongLinks || !highlightMode
    if (colorsVisible) setColorBrush(null)
    setEraseMode(false)
    setColorMode(false)
    setHighlightMode(enable)
  }

  function switchPenPencil(pencil: boolean) {
    if (colorsVisible) setColorBrush(null)
    setEraseMode(false)
    setColorMode(false)
    setHighlightMode(false)
    setPencilModifier(false)
    setPencil(pencil)
  }

  function toggleChainDrawing() {
    if (!sketch.drawing && savedHighlightMode) setHighlightMode(false)
    sketch.toggle()
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
    edit((current) => paintCandidate(current, candidate, candidateBrush))
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
        press.digit !== selectedDigit || press.mode !== candidateMode) return
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
    if (colorTarget === 'cell' && brush !== null && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => enter(current, [index], 'color', brush))
      setSelected([])
      return
    }
    const givenDigit = givenDigitAt(game.givens, index)
    const armedInput = colorMode ? colorTarget === 'cell' ? selectedColor : null : selectedDigit
    if (eraseMode && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => enter(current, [index], 'value', 0))
      setSelected([])
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
    const maskToHighlight = mobile ? cellHighlightMask(index) : 0
    cellHold.start(event, maskToHighlight ? () => highlightCellCandidates(maskToHighlight) : undefined)
    if (highlightMode) {
      dragSelection.current = {
        pointerId: event.pointerId,
        start: index,
        base: [...selected],
        additive: multi || event.metaKey || event.ctrlKey,
        moved: false,
      }
      return
    }
    if (event.pointerType === 'touch') {
      if (canPreviewCandidates && selectedDigit !== null && values[index] === '0' && !event.shiftKey) {
        candidatePress.current = { pointerId: event.pointerId, cell: index, digit: selectedDigit, mode: candidateMode, cancelled: false }
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
    if (event.pointerType === 'touch') {
      const press = candidatePress.current
      if (press?.pointerId === event.pointerId && index !== press.cell) {
        press.cancelled = true
        setCandidatePreviewCell(null)
      }
    } else if (event.buttons === 0) {
      hoveredCell.current = event.shiftKey ? null : index
      setCandidatePreviewCell(canPreviewCandidates && !event.shiftKey ? index : null)
    }
    if (index === null) return
    const pressed = event.pointerType === 'touch' || Boolean(event.buttons & 1)
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
    if (!highlightMode || !drag || drag.pointerId !== event.pointerId || !pressed ||
      index === drag.start && !drag.moved) return
    event.preventDefault()
    drag.moved = true
    const dragged = rectangleSelection(drag.start, index, gridSize)
    setActive(index)
    setAnchor(drag.start)
    setSelected(drag.additive ? [...new Set([...drag.base, ...dragged])] : dragged)
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
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Shift') setCandidatePreviewCell(null)
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ' || ARROWS[event.key]) setPointerFocusedCell(null)
      const target = event.target
      const key = event.key.toLowerCase()
      const shortcut = event.ctrlKey || event.metaKey
      const shortcutDigit = shortcut && !event.shiftKey && !event.isComposing
        ? Number(/^[1-9]$/.test(key) ? key : /^Digit([1-9])$/.exec(event.code)?.[1]) || null : null
      const shiftDigit = event.isComposing ? null : highlightedDigitShortcut(event)
      const solvingDigitShortcuts = !draft && !disabled && !solved && !colorMode && !eraseMode && brush === null && !inspectSubset
      const digitShortcut = shortcutDigit ?? shiftDigit
      const drawLinksShortcut = !event.isComposing && shortcutMatches(event, shortcuts, 'chainDrawing')
      const applyEditsShortcut = !event.isComposing && shortcutMatches(event, shortcuts, 'applyEdits')
      const checkboxShortcut = target instanceof HTMLInputElement && target.type === 'checkbox' &&
        (drawLinksShortcut || applyEditsShortcut || ((strongLinksVisible || solvingDigitShortcuts && !sketch.drawing) && digitShortcut !== null))
      if (event.defaultPrevented || rearranging || modalOpen || puzzleMenuOpen || actionsOpen || chainColorsOpen || dialogResult !== null || resetOpen || cancelDraftOpen || event.altKey ||
        (target instanceof HTMLElement && !checkboxShortcut && (target.isContentEditable || target.closest('input, select, textarea, a')))) return
      if (inspectSubset && event.key === ' ' && boardRef.current?.contains(target as Node)) return
      if (!draft && !placeholder && !previewing && !variantRulesOpen && (completed || game.started || game.paused) &&
        !event.isComposing && shortcutMatches(event, shortcuts, 'pauseOrSwitchView')) {
        if (target instanceof HTMLElement && (target.closest('dialog[open]') ||
          (event.key === ' ' && target.closest('button, summary, [role="button"]') && !target.matches('[role="gridcell"][data-cell]')))) return
        event.preventDefault()
        if (!event.repeat) {
          if (completed) toggleSolvedView()
          else togglePause()
        }
        return
      }
      if (game.paused || (solved && !showSolvedGrid)) return
      if (!draft && shortcutMatches(event, shortcuts, 'highlightMode')) {
        event.preventDefault()
        if (!event.repeat) toggleHighlightMode()
        return
      }
      if (drawLinksShortcut && !variantRulesOpen && panelAvailable('chains') && (!disabled || previewing)) {
        event.preventDefault()
        if (event.repeat) return
        if (sketch.drawing) stopDrawingAndFocusGrid()
        else if (!chainsVisible || previewing) {
          if (savedHighlightMode) setHighlightMode(false)
          setStartDrawingOnOpen(true)
          showChains()
        } else if (chainGraph && canAnalyzeChains) toggleChainDrawing()
        else if (!currentNotes) setStartDrawingOnOpen((open) => !open)
        return
      }
      if (previewing) return
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
      if (chainsVisible && chainGraph && shortcutMatches(event, shortcuts, 'newChain')) {
        event.preventDefault()
        if (event.repeat) return
        sketch.addSketch()
        if (!sketch.drawing) toggleChainDrawing()
        return
      }
      if (event.key === 'Control' || event.key === 'Meta') {
        if (canActivateTemporaryPencil) setPencilModifier(true)
        return
      }
      const highlightedDigit = shiftDigit ?? functionKeyDigit(event.key)
      if (sketch.drawing || browsingStrongLinks) {
        if (key === 'escape') {
          event.preventDefault()
          if (browsingStrongLinks) setShowStrongLinks(false)
          else if (sketch.pending === null) stopDrawingAndFocusGrid()
          else sketch.endPath()
        } else if (shortcut && key === 'z' && !event.shiftKey) {
          event.preventDefault()
          if (sketch.canUndo) sketch.undo()
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
      if (inspectSubset && !shortcut && (/^[0-9]$/.test(key) || ['backspace', 'delete', 'escape'].includes(key))) {
        event.preventDefault()
        if (key === 'escape') setSelected([])
      } else if (key === 'escape' && (brush !== null || paintingCandidates)) {
        const cell = target instanceof HTMLElement ? target.closest<HTMLElement>('.paint-candidate')?.closest<HTMLElement>('[data-cell]') : null
        if (cell) {
          const index = Number(cell.dataset.cell)
          restoreCellFocus.current = index
          setActive(index)
        }
        setColorBrush(null)
        if (paintingCandidates && colorMode) setSelectedColor(null)
      } else if (!draft && !event.isComposing && shortcutMatches(event, shortcuts, 'switchColorShade')) {
        event.preventDefault()
        if (!event.repeat) switchColorShade()
      } else if (shortcut && ['z', 'y'].includes(key)) {
        event.preventDefault()
        edit(key === 'y' || event.shiftKey ? redo : undo)
      } else if (solvingDigitShortcuts && digitShortcut) {
        if (digitShortcut > gridSize) return
        event.preventDefault()
        if (event.repeat) return
        if (shortcutDigit && hasInputSelection) input(shortcutDigit, candidateMode)
        else toggleDigitHighlight(digitShortcut, shortcutDigit ? 'all' : 'any')
      } else if (!draft && !shortcut && highlightedDigit) {
        event.preventDefault()
        if (cellDrivenHighlight) setSelected([])
        clearHighlightedDigits()
        setHighlightCandidatePairs(false)
        setSelectedDigit(highlightedDigit)
      } else if (!draft && shortcut && !event.shiftKey && !event.isComposing) {
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
        if (inspectSubset) {
          boardRef.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus({ preventScroll: true })
          return
        }
        const givenDigit = givenDigitAt(game.givens, next)
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
        if ((brush !== null || colorTarget === 'candidate' && colorMode) && event.repeat) return
        const digit = Number(key)
        if (brush !== null) {
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
      } else if (!draft && shortcutMatches(event, shortcuts, 'digitMode')) {
        event.preventDefault()
        if (!event.repeat) switchPenPencil(false)
      } else if (!draft && shortcutMatches(event, shortcuts, 'pencilMode')) {
        event.preventDefault()
        if (event.repeat) return
        if (pencilActive && brush === null) toggleHighlightMode()
        else switchPenPencil(!highlightMode)
      } else if (!draft && shortcutMatches(event, shortcuts, 'colorMode') && (desktop || mobileToolsAvailable)) {
        event.preventDefault()
        showColors(true)
      } else if (!draft && shortcutMatches(event, shortcuts, 'eraseMode')) {
        event.preventDefault()
        if (colorsVisible) setColorBrush(null)
        setColorMode(false)
        setHighlightMode(false)
        setSelected([])
        setEraseMode((current) => !current)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  async function runCheck() {
    if (busy) return
    if (previewing) closeSolutionPath()
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setBusy(true)
    setDialogResult(null)
    try {
      if (draftCages && !isAlgebraicCageList(draftCages)) throw new Error('Add at least one cage with a letter before checking.')
      const status = sixRules && grid?.size === 6
        ? await runEngine({ type: 'sized-variant', position: sixPosition(grid, { rules: sixRules }, values), operation: 'analyze' })
        : cages ? await analyzeAlgebraic({ rules: cages }, values) : grid ? await analyzeMini(values) : variant
        ? await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: variant.puzzle, entries: game.position.entries } })
        : await runEngine({ type: 'analyze', values })
      const current = readWorkingGame()
      if (!current || valuesOf(current) !== values || current.position.draftCages !== draftCages || current.position.draftSixRules !== game.position.draftSixRules) return
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
      const conflict = error instanceof EngineError && (error.code === 'conflict' || error.code === 'unsolvable')
      setDialogResult({ title: 'Puzzle check', text: conflict ? 'This puzzle is not correct yet.' : (error as Error).message,
        tone: conflict ? 'error' : 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function generateCandidates() {
    if (busy) return
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setBusy(true)
    try {
      const masks = await playCandidates(game)
      const current = readWorkingGame()
      if (!current || current.position !== game.position) return
      if (!masks) {
        setDialogResult({ title: 'Puzzle action', text: 'Candidates cannot be generated until the grid conflicts are resolved.', tone: 'error' })
        return
      }
      updateWorkingGame((latest) => latest.position === current.position
        ? recordAction(latest, replaceCandidates(latest, masks), 'candidates') : latest)
    } catch (error) {
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function solveAllSingles() {
    if (busy || !offerSingles) return
    if (previewing) closeSolutionPath()
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setBusy(true)
    try {
      const result = await solveSingleValues(game, values, eliminations, displayedCandidates ?? undefined)
      const current = readWorkingGame()
      if (!current || valuesOf(current) !== values || current.position.eliminations !== eliminations) return
      if (result === values) {
        setDialogResult({ title: 'Puzzle action', text: 'There are no singles to solve right now.', tone: 'neutral' })
        return
      }
      const removedCandidates = eliminations?.some(Boolean) || (displayedCandidates && masks?.some((mask, cell) =>
        values[cell] === '0' && (mask & ~displayedCandidates[cell]) !== 0))
      const assistance = values === givens && !removedCandidates && !result.includes('0') ? 'all' : 'partial'
      updateWorkingGame((latest) => {
        if (valuesOf(latest) !== values || latest.position.eliminations !== eliminations) return latest
        const next = recordAction(latest, fillEntries(latest, result, advancedModes.autoRemoveCandidates), 'singles')
        if (completed) return next
        const placements = [...result].flatMap((digit, cell) => digit !== '0' && values[cell] !== digit ? [{ place: { cell, digit: Number(digit) } }] : [])
        void observeTechniqueActions(latest, placements, 'automated')
        return latest.ratingAttempt ? { ...next, ratingAttempt: addSinglesAssistance(latest.ratingAttempt, assistance) } : next
      })
    } catch (error) {
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function showHint(limit: 10 | 'all' = 10) {
    if (busy || solved) return
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
    setBusy(true)
    const requestId = ++techniqueHintRequest.current
    let result: HintState
    const removals = hintEliminations(values, displayedCandidates, eliminations, gridSize)
    try {
      const collection = limit === 'all' && !grid ? ++nextHintCollection : undefined
      const { choices, candidates, available, offset } = await puzzleHints(game, limit, undefined, collection)
      const page = collection === undefined ? undefined : { collection, offset: offset ?? 0, available }
      if (!candidates) throw new Error('Missing hint candidates')
      result = { position: hintPosition, choices, candidates, page, index: 0, stage: 'technique' }
    } catch (error) {
      const incorrectCandidates = error instanceof EngineError && (error.code === 'invalid-eliminations' ||
        (error.code === 'unsolvable' && variant && [...values].every((digit, cell) => digit === '0' || digit === variant.solution[cell])))
      const copy = incorrectCandidates ? HINT_CANDIDATES_ERROR : HINT_ERROR
      result = { position: hintPosition, choices: [], index: 0, stage: 'technique', error: copy }
      if (incorrectCandidates && removals) {
        try {
          const answer = six?.solution ?? algebraic?.solution ?? (grid ? await solveMini(values) : variant ? await runEngine({
            type: 'variant', operation: 'solve', position: { puzzle: variant.puzzle, entries: game.position.entries },
          }) : await runEngine({ type: 'solve', values }))
          if (answer) result.recovery = findCandidateRecovery(game, answer, removals)
        } catch { /* Keep the general candidate warning if recovery cannot be verified. */ }
      }
    } finally {
      setBusy(false)
    }
    const current = readWorkingGame()
    if (requestId === techniqueHintRequest.current && current && matchesHintPosition(current, hintPosition)) setHint(result)
    else if (result.page) void runEngine({ type: 'release-hints', collection: result.page.collection }).catch(() => {})
  }

  async function showTechniqueHints(technique: string) {
    if (game.paused || busy || solved || draft) return
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (sketch.drawing) sketch.suspend()
    if (mobile) hintReturnFocus.current = activeMobileInputTabRef.current
    if (advancedWorkspace) {
      if (!showBottomPanel) onOpenHintPanel()
      setFocusHintRequest((request) => request + 1)
    }
    const request = ++techniqueHintRequest.current
    const position = hintPosition
    setHint(null)
    setHintRevealed(true)
    setBusy(true)
    let result: HintState
    try {
      const { choices, candidates } = await puzzleHints(game, 'all', technique)
      if (!candidates) throw new Error('Missing candidates for the selected technique.')
      result = {
        position, choices, candidates, index: 0, stage: 'technique',
        ...(choices.length ? {} : { error: { title: techniqueLabel(technique), text: 'No patterns are available in the current grid.' } }),
      }
    } catch (error) {
      result = {
        position, choices: [], index: 0, stage: 'technique',
        error: error instanceof EngineError && error.code === 'invalid-eliminations'
          ? HINT_CANDIDATES_ERROR : HINT_ERROR,
      }
    } finally {
      setBusy(false)
    }
    const latest = readWorkingGame()
    if (request === techniqueHintRequest.current && latest && matchesHintPosition(latest, position)) setHint(result)
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
    try {
      const next = await puzzleHintPage(variant, page.collection, index)
      if (request !== pageRequest.current) return
      setHint(current => current?.page?.collection === page.collection
        ? { ...current, choices: next.choices, page: { ...page, offset: next.offset }, index, stage: 'technique' } : current)
    } catch (error) {
      if (request === pageRequest.current) setHint(current => current?.page?.collection === page.collection
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
      const next = chainIds ? applyChainDeduction(current, chainIds, actions, candidates, advancedModes.autoRemoveCandidates)
        : applyDeduction(current, actions, candidates, advancedModes.autoRemoveCandidates)
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
    if (savedHighlightMode) setHighlightMode(false)
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
    if (savedHighlightMode) setHighlightMode(false)
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
  const revealLabel = hintStage === 'technique' ? recovery ? 'Show cell' : 'Show digits'
    : hintStage === 'digits' ? aicEndpoints(deduction) ? 'Show endpoints' : 'Show location'
      : 'Show explanation'
  const hintAction = applyHintAction && (fullHint ? applyHintAction : { label: revealLabel, onClick: () => changeHintDetail(1) })
  const closeHint = () => solutionHintPanel ? setSolutionHintOpen(false) : setHintRevealed(false)
  const explanation = solutionHintPanel ? stepDiagram : hintDiagram
  const revealedDeduction = solutionHintPanel ? replayedSolutionStep?.deduction : fullHint && !recovery ? deduction : undefined
  const recoveryExplanation = !solutionHintPanel && recovery && fullHint
    ? explainCandidateRecovery(game, recovery, cellReferenceStyle) : undefined
  const hintPanel = (solutionHintPanel || visibleHint || hintLoading || mobileHintOpen) && (
    <PlayHint mobile={mobile} panelRef={mobile ? mobileHintPanelRef : undefined}>
      <HintCard hint={solutionHintPanel ? solutionHintCopy
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
        action={hintAction}
        lessDetail={applyHintAction ? { disabled: hintStage === 'technique', onClick: () => changeHintDetail(-1) } : undefined}
        secondaryAction={!solutionHintPanel && recoveryLocationVisible && recovery.movesAgo
          ? { label: 'Review move', expanded: visibleHint?.reviewingRemoval ?? false,
            onClick: () => setHint((current) => current?.recovery ? { ...current, reviewingRemoval: !current.reviewingRemoval } : current) }
          : undefined}
        explanation={recoveryExplanation ?? (explanation?.description
          ? [explanation.description, ...(explanation.reasonSteps ? [] : [explanation.reason])].filter(Boolean) : undefined)}
        explanationSteps={recoveryExplanation ? undefined : explanation?.reasonSteps}
        collapseExplanation={Boolean(solutionHintPanel)}
        trace={solutionHintPanel ? undefined : hintDiagram?.trace}
        navigation={!solutionHintPanel && visibleHint && hintCount > 0
          ? { index: visibleHint.index, count: hintCount, onMove: moveHint }
          : undefined} />
    </PlayHint>
  )
  const cellColorsPanel = (
    <CellColorPalette target={colorTarget} onTarget={changeColorTarget} brush={brush}
      hasColors={colorTarget === 'cell' ? game.position.colors.some(Boolean) : Boolean(game.position.candidateColors)}
      canContinueGroup={canContinueColorGroup} groupMessage={colorGroupMessage} onContinueGroup={continueColorGroup}
      disabled={cellColorsDisabled} onColor={chooseColor} onSwitchShade={switchColorShade}
      onStop={() => setColorBrush(null)} onClear={clearColors} />
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
    strongLinks={{ shown: showStrongLinks, hasHighlights: strongLinkMask !== 0, count: strongLinks.count,
      toggle: () => {
        if (!showStrongLinks) {
          if (savedHighlightMode) setHighlightMode(false)
          changeHintVisuals('player')
        }
        setShowStrongLinks((shown) => !shown)
      } }} />
  const subsetsUnavailable = disabled || solved || draft ? 'Subsets are available while solving.'
    : currentNotes?.failed ? 'The candidates did not load.'
    : currentNotes?.masks === null ? 'Resolve grid conflicts to inspect subsets.'
    : subsetMasks ? undefined : 'Loading candidates…'
  const subsetsPanel = <SubsetsPanel count={inspectSubset ? subset.cells.length : 0} digits={subset.digits} removalCount={subset.removalCount}
    onClear={() => setSelected([])} unavailable={subsetsUnavailable} />
  const completionPanel = showResults || (mobile && showSolvedGrid) ? (
    <CompletedPuzzle game={savedGame} games={games} catchUpPuzzle={catchUpPuzzle} preferredDifficulty={preferredDifficulty}
      ratingPending={ratingPending} shortcutEnabled={showResults && !rearranging && !modalOpen && !puzzleMenuOpen && !actionsOpen && !cancelDraftOpen && !variantRulesOpen}
      actionsTarget={mobile ? completionActionsTarget : null}
      showGuides={appearance.showGuides} cellReferenceStyle={cellReferenceStyle} onResumePuzzle={roomStore.select}
      onChooseDifficulty={() => onNewPuzzle('difficulty')} onChooseVariant={() => onNewPuzzle()} />
  ) : null
  const solveSinglesAction = <button onClick={() => { void solveAllSingles() }} disabled={busy || !hasSingles}
    aria-keyshortcuts={shortcutLabel(shortcuts.solveSingles)}>
    <CheckCheck size={17} /> Solve all singles <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.solveSingles)}</kbd>
  </button>
  function selectToolPanel(tab: ToolPanelTab, alsoOpen?: PuzzleTool) {
    if (tab !== 'digits') {
      if (!panelAvailable(tab)) return
      changeHintVisuals('player')
      if (advancedWorkspace && !showRightPanel) onOpenRightPanel()
    }
    if (tab === 'solution' || tab === 'techniques') setHintRevealed(false)
    if (tab === 'chains' && activeToolPanel !== 'chains') setStartDrawingOnOpen(true)
    playSession.set(id, 'toolPanels', current => {
      const missing = TOOL_PANEL_ORDER.filter(tool => (tool === tab || tool === alsoOpen) && !current.open.includes(tool))
      if (!missing.length && current.active === tab) return current
      return { ...current, open: missing.length ? TOOL_PANEL_ORDER.filter(tool => current.open.includes(tool) || missing.includes(tool)) : current.open,
        active: tab }
    })
  }

  function closeToolPanel(tool: PuzzleTool, fromMenu = false) {
    if (tool === 'solution') hideSolutionPath()
    if (mobile && !fromMenu) focusMobileInput.current = openPuzzlePanels.length === 1
    playSession.set(id, 'toolPanels', (current) => {
      const open = current.open.filter((tab) => tab !== tool)
      return open.length ? { ...current, open, active: current.active === tool ? 'digits' : current.active } : defaultToolPanels
    })
    if (mobile || fromMenu) return
    const remaining = openInsightTabs.filter(({ id }) => id !== tool)
    const next = remaining.find(({ id }) => id === activeDesktopTab?.id) ?? remaining.find(({ id }) => id === 'techniques') ?? remaining[0]
    const focus = next ? insightTabsRef.current?.querySelector<HTMLButtonElement>(`[data-insight-tab="${next.id}"]`) : puzzleMenuButtonRef.current
    focus?.focus({ preventScroll: true })
  }

  function showPuzzleTool(tool: PuzzleTool, alsoOpen?: PuzzleTool) {
    if (!panelAvailable(tool) || (mobile && disabled && !(tool === 'chains' && previewing))) return
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (mobile) {
      mobileToolsOpener.current = puzzleMenuButtonRef.current
      focusMobileInput.current = true
    } else if (tool === 'colors') {
      setColorMode(false)
      if (sketch.drawing) sketch.suspend()
    }
    selectToolPanel(tool, alsoOpen)
  }

  function showColors(openChains = false) {
    showPuzzleTool('colors', openChains && !grid ? 'chains' : undefined)
  }

  const colorsAction = desktop && puzzleToolsAvailable && (
    <button onClick={() => showColors()}><Palette size={17} /> Colors</button>
  )

  function showChains() {
    if (grid) return
    if (advancedWorkspace && !previewing) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
    showPuzzleTool('chains')
    if (desktop && !advancedWorkspace) setFocusChainsRequest(request => request + 1)
  }

  function togglePuzzlePanel(panel: PuzzleTool) {
    if (openPuzzlePanels.includes(panel)) closeToolPanel(panel, true)
    else selectToolPanel(panel)
  }

  const panelToggles = desktopInsightTabs.filter(({ id }) => panelAvailable(id)).map(({ id, label, Icon }) => (
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
    {panelToggles.length > 0 && <>
      <div className="app-menu-separator" role="separator" />
      {panelToggles}
      <div className="app-menu-separator" role="separator" />
    </>}
    {advancedWorkspace && generatedWithAuto && offerSingles && solveSinglesAction}
    <button onClick={() => { setPuzzleMenuOpen(false); onShare() }}>
      <Share2 size={17} /> Share puzzle
    </button>
    {showPuzzleSync && <>
      <button type="button" disabled={!storageAvailable || syncStatus === 'saving' || syncStatus === 'offline' || syncStatus === 'offline-clean'}
        onClick={() => { void deviceSync.syncPuzzle(game.id) }}>
        <CloudUpload size={17} aria-hidden="true" /> Sync now
      </button>
      {syncMenuStatus && <p className="puzzle-sync-menu-status" role="status">{syncMenuStatus}</p>}
    </>}
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
      {colorsAction}
      {offerSingles && <>
        <div className="app-menu-separator" role="separator" />
        {solveSinglesAction}
      </>}
    </div>
  )
  const puzzleMenu = puzzleMenuMounted && (
    <div ref={puzzleMenuPopupRef} className={`app-menu puzzle-menu${mobile ? ' mobile-puzzle-menu' : ''}`} id="puzzle-menu"
      popover={mobile ? 'manual' : undefined} data-presence={puzzleMenuExiting ? 'exit' : 'open'}
      aria-hidden={puzzleMenuExiting || undefined} inert={puzzleMenuExiting || undefined}
      onClickCapture={event => {
        if (event.target instanceof Element && event.target.closest('button[aria-pressed]')) return
        puzzleMenuButtonRef.current?.focus({ preventScroll: true })
      }}>
      {puzzleOptionItems}
    </div>
  )
  const canSelectCell = !game.paused && !showMobileResults && !rearranging
  const gridInputMode = placeholder || draft || showResults || previewing || inspectSubset
    ? undefined
    : (sketch.drawing || browsingStrongLinks) && chainMasks ? 'chain'
      : eraseMode ? 'erase' : colorMode || brush !== null ? 'color'
      : highlightMode ? 'highlight' : pencilActive ? 'pencil' : 'pen'
  const badgeMode = game.paused || rearranging || gridInputMode === 'color' ? undefined : gridInputMode
  const showPlayerColors = colorsPanelOpen || colorMode
  const visibleChainAnnotations = chainsPanelOpen && !hintAnnotations && (sketch.annotations.links?.length || sketch.annotations.candidates?.size)
    ? sketch.annotations : undefined
  const solutionGrid = (
    <Board grid={grid} variantPuzzle={variant?.puzzle} algebraicCages={cages} sixRules={sixRules} givens={givens} values={previewPosition ? lessonValues(previewPosition) : givens}
      candidates={previewPosition?.candidates} annotations={stepDiagram?.annotations}
      label="Solution preview" showGuides={appearance.showGuides} highlighting={highlighting} />
  )
  const livePuzzleStage = previewing ? solutionGrid : !mobile && completionPanel ? completionPanel
  : (sketch.drawing || browsingStrongLinks) && chainMasks ? (
    <Board grid={grid} variantPuzzle={variant?.puzzle} algebraicCages={cages} sixRules={sixRules} givens={givens} values={values} position={game.position} errors={errors}
      candidates={chainMasks} annotations={strongLinksVisible ? strongLinks.annotations : sketch.annotations} showPlayerColors={showPlayerColors}
      label={sketch.drawing ? 'Sudoku grid for drawing links' : 'Sudoku grid with strong links'}
      descriptionId={badgeMode ? modeBadgeId : undefined}
      highlightedDigit={strongLinksVisible ? null : chainHighlightDigit} highlightedDigitMask={strongLinksVisible ? strongLinkMask : 0}
      highlightedDigitMatch="any" highlighting={highlighting} highlightCandidateCells={!strongLinksVisible}
      highlightCandidateCount={!strongLinksVisible && highlightCandidatePairs ? 2 : null}
      showGuides={appearance.showGuides} boardRef={boardRef} onCandidate={strongLinksVisible ? selectStrongLinkCandidate : sketch.select}
      onLinkSelect={strongLinksVisible ? startStrongLinkChain : undefined}
      onCandidateHover={sketch.drawing ? sketch.hover : undefined}
      isLinkTarget={sketch.isLinkTarget}
      selectedCandidate={sketch.pending === null ? undefined : chainCandidate(sketch.pending)} />
  ) : (
    <Board grid={grid} variantPuzzle={variant?.puzzle} algebraicCages={cages} sixRules={sixRules} givens={game.givens} values={values} position={hintAnnotations ? hintBoardPosition : game.position} errors={errors} candidateLayout={advancedModes.candidateLayout}
      candidates={inspectSubset ? subsetMasks ?? undefined : hintAnnotations && hintDiagram ? hintCandidates : undefined}
      annotations={hintAnnotations ?? (inspectSubset ? subset.annotations : visibleChainAnnotations)}
      showAnnotatedCandidates={!inspectSubset && Boolean(visibleChainAnnotations)} showPlayerColors={showPlayerColors}
      candidatePreview={!inspectSubset && canPreviewCandidates && candidatePreviewCell !== null && selectedDigit !== null
        ? { cell: candidatePreviewCell, digit: selectedDigit, mode: candidateMode } : undefined}
      descriptionId={badgeMode ? modeBadgeId : undefined}
      label={cages ? 'Algebraic Cages Sudoku grid' : variant ? `${variantName(variant)} Sudoku grid` : undefined}
      showGuides={appearance.showGuides}
      highlighting={hintAnnotations || inspectSubset ? { ...highlighting, relatedCells: false, matchingDigits: false, matchingCandidates: false } : highlighting}
      overlay={mobile && completionPanel ? { content: completionPanel, visible: showMobileResults } : undefined}
      highlightedDigit={inspectSubset ? null : selectedDigit ?? (visibleChainAnnotations ? chainHighlightDigit : null)}
      highlightedDigitMask={hintAnnotations || inspectSubset ? 0 : playerHighlightMask}
      highlightedDigitMatch={digitHighlight.match}
      highlightCandidateCells={!colorMode && !eraseMode && brush === null}
      selected={inspectSubset ? subset.cells : selected} active={active}
      pointerFocusedCell={pointerFocusedCell}
      highlightCandidateCount={!hintAnnotations && !inspectSubset && highlightCandidatePairs ? 2 : null}
      boardRef={boardRef} onCell={inspectSubset ? (cell) => {
        setActive(cell)
        if (values[cell] !== '0') return
        setAnchor(cell)
        setSelected((current) => current.includes(cell) ? current.filter((item) => item !== cell) : [...current, cell])
      } : canSelectCell && !paintingCandidates ? clickCell : undefined}
      onCellDoubleClick={canSelectCell && !paintingCandidates && !hintAnnotations && !inspectSubset ? doubleClickCell : undefined}
      onPaintCandidate={paintingCandidates && !inspectSubset ? colorCandidate : undefined}
      dragSelect={canSelectCell && !inspectSubset && (highlightMode || canDragCandidates)}
      onCellPointerDown={canSelectCell && !paintingCandidates && !inspectSubset ? startCellDrag : undefined}
      onCellPointerMove={canSelectCell && !paintingCandidates && !inspectSubset ? continueCellDrag : undefined}
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
        {showElapsedTime && <p>Your elapsed time is stopped.</p>}
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
  const puzzlePanel = (
      <div className="puzzle-column" data-reserve-badge-space={!placeholder && !draft || undefined}>
        <section ref={puzzleCardRef} className="surface puzzle" aria-label={game.title} data-placeholder={Boolean(placeholder) || undefined}
          data-input-mode={gridInputMode}
          data-desktop-solved={desktop && completed && !previewing || undefined}
          style={{ '--board-font-scale': appearance.gridTextScale, '--candidate-font-scale': appearance.candidateTextSize / 100 } as CSSProperties}>
        {(!draft || placeholder) && <div className="puzzle-metadata" aria-hidden={Boolean(placeholder) || undefined}>
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
            onClick={() => roomStore.select(catchUpPuzzle.id)} title={`Open ${catchUpPuzzle.title} from another linked device`}>
            Catch up <ArrowRight size={14} aria-hidden="true" />
          </Button>}
        </div>}
        <div className="puzzle-actions">
          {presentationDraft ? (
            <>
              <Button onClick={() => setCancelDraftOpen(true)}><X size={17} /> Cancel</Button>
              {game.position.draftSixRules && onEditSixRules && <Button onClick={onEditSixRules} aria-haspopup="dialog">Edit rules</Button>}
              {draftCages && onEditCages && <Button onClick={onEditCages} aria-haspopup="dialog">Edit cages</Button>}
              <Button variant="primary" className="publish-button" onClick={onPublish}><Check size={17} /> Save puzzle</Button>
            </>
          ) : (
            <>
              {puzzleZoom.zoomed && <IconButton variant="quiet" className="puzzle-zoom-reset"
                aria-label="Reset grid zoom" title="Reset grid zoom" onClick={puzzleZoom.reset}>
                <ZoomOut size={18} aria-hidden="true" />
              </IconButton>}
              {(variant || grid) && <Button type="button" variant="quiet" className="variant-rules-button" onClick={() => setVariantRulesOpen(true)}
                aria-label={grid ? `${sizedName} rules` : `${variantName(variant)} Sudoku rules`} aria-haspopup="dialog">
                <Info size={16} aria-hidden="true" />{grid ? sizedName : variant?.id === 'mixed' ? 'Mixed rules' : variantName(variant)}
              </Button>}
              {completed && !previewing && <Button variant="quiet" className="puzzle-view-toggle"
                aria-pressed={showSolvedGrid} aria-controls={puzzleStageId} aria-keyshortcuts={shortcutLabel(shortcuts.pauseOrSwitchView)} onClick={toggleSolvedView}>
                {showSolvedGrid ? 'View results' : 'View grid'}
              </Button>}
              {timing.showPause && !draft && !completed && (game.started || game.paused) && !previewing && <IconButton type="button" variant="quiet" className="puzzle-pause-trigger"
                aria-label={game.paused ? 'Resume puzzle' : 'Pause puzzle'}
                title={`${game.paused ? 'Resume puzzle' : 'Pause puzzle'} (${shortcutLabel(shortcuts.pauseOrSwitchView)})`}
                aria-pressed={game.paused} aria-keyshortcuts={shortcutLabel(shortcuts.pauseOrSwitchView)} onClick={togglePause}>
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
        <div id={puzzleStageId} ref={puzzleStageRef} data-no-panel-hold={mobile || undefined} className={`puzzle-stage${previewing ? ' solution-preview' : sketch.drawing || browsingStrongLinks || visibleChainAnnotations ? ' chain-sketch' : hintAnnotations ? ' hint-preview' : ''}${colorTarget === 'cell' && brush !== null ? ' cell-coloring' : ''}`}
          onContextMenu={(event) => { if (!cellHold.suppressContextMenu(event)) preventControlClickMenu(event) }} onPointerUp={finishControlClick}
          onBlur={(event) => {
            const cell = event.target.dataset.cell
            if (cell !== undefined) setPointerFocusedCell((current) => current === Number(cell) ? null : current)
          }}>
          {placeholder ? <div className="puzzle-placeholder-stage">
            <div className="puzzle-grid-reservation" aria-hidden="true" inert>
              <Board grid={grid} algebraicCages={cages} sixRules={sixRules} givens={givens} values={values} showGuides={appearance.showGuides} />
            </div>
            <div className="puzzle-placeholder-message">{placeholder}</div>
          </div> : !draft && !completed ? (
            mobile ? <div className="puzzle-zoom" data-zoomed={puzzleZoom.zoomed || undefined} {...puzzleZoom.viewportProps}>
              <div ref={puzzleZoom.content} className="puzzle-zoom-content">{puzzlePlayLayers}</div>
            </div> : puzzlePlayLayers
          ) : livePuzzleStage}
        </div>
        <PuzzleCollectionCredit game={game} />
        {badgeMode && <ModeBadge mode={badgeMode} descriptionId={modeBadgeId} cardRef={puzzleCardRef}
          actionLabel={browsingStrongLinks ? 'Stop showing strong links' : undefined}
          position={modeBadgePosition} onPosition={setModeBadgePosition} onActivate={() => {
            if (badgeMode === 'chain') {
              if (sketch.drawing) stopDrawingAndFocusGrid()
              else if (browsingStrongLinks) setShowStrongLinks(false)
              return
            }
            if (colorsVisible) setColorBrush(null)
            setEraseMode(false)
            setColorMode(false)
            setPencilModifier(false)
            if (badgeMode === 'pen') setPencil(true)
            setHighlightMode(badgeMode === 'pencil')
          }} />}
        {presentationDraft && <div className="draft-tip"><PencilLine size={16} /> Enter the givens, then save your puzzle.</div>}
        </section>
      </div>
  )
  const inputPanel = (
      <div className="workspace-controls" data-show-completion={showMobileResults || undefined}>
        <Controls gridSize={gridSize} mode={mode} pencil={pencilActive} togglePencil={() => switchPenPencil(!savedPencil)}
          candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes}
          colorMode={colorMode} colorTarget={colorTarget} setColorTarget={changeColorTarget} toggleColorMode={mobile ? () => {
            if (colorsVisible) setColorBrush(null)
            setEraseMode(false); setHighlightMode(false); setColorMode((current) => !current)
          } : undefined}
          colorsActive={brush !== null} onSwitchShade={switchColorShade}
          highlightMode={highlightMode} toggleHighlightMode={toggleHighlightMode}
          eraseMode={eraseMode} toggleEraseMode={() => {
            if (colorsVisible) setColorBrush(null)
            setColorMode(false); setHighlightMode(false); setSelected([]); setEraseMode((current) => !current)
          }}
          selectedDigit={browsingStrongLinks || sketch.drawing ? (strongLinksVisible ? null : chainHighlightDigit) : colorMode ? selectedColor : selectedDigit} hasCellSelection={hasInputSelection}
          highlightedDigitMask={strongLinksVisible ? strongLinkMask : sketch.drawing || eraseMode ? 0 : highlightedDigitMask}
          onToggleDigitHighlight={strongLinksVisible ? toggleStrongLinkDigit : !sketch.drawing && !draft && !solved && !previewing ? toggleDigitHighlight : undefined}
          digitHighlightMatch={digitHighlight.match} onDigitHighlightMatchChange={!draft && !solved && !previewing ? changeDigitHighlightMatch : undefined}
          values={values} input={sketch.drawing || browsingStrongLinks ? toggleChainHighlight : input} chainDrawing={sketch.drawing || browsingStrongLinks}
          undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
          onCheck={presentationDraft || previewing ? undefined : () => { void runCheck() }}
          compact={mobile} actionsButtonRef={actionsMenuButtonRef} actionsOpen={actionsOpen}
          actionsMenu={!mobile && !advancedWorkspace ? desktopActionsMenu : undefined}
          onActions={!presentationDraft && !solved && (mobile || !advancedWorkspace) ? () => {
            setPuzzleMenuOpen(false)
            setActionsOpen((open) => !open)
          } : undefined}
          disabled={disabled || (solved && !showSolvedGrid)} draft={presentationDraft} inputSize={inputSize} panelHeight={panelHeight}
          setPanelHeight={setPanelHeight} beginResize={beginResize} showMultiSelectButton={!advancedWorkspace} multi={multi} toggleMulti={toggleMulti} />
        {mobile && completed && <section ref={setCompletionActionsTarget} className="surface mobile-completion-actions"
          aria-label="Next puzzle options" hidden={!showMobileResults} data-no-panel-hold />}
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
      onReveal={markSolutionVisible} embedded={!advancedWorkspace} />
  ) : (
    <section className="advanced-spoiler-panel solution-spoiler-panel" aria-label="Solution">
      <span className="advanced-spoiler-icon" aria-hidden="true"><ListOrdered size={21} /></span>
      <div><h2>Solution</h2><p>The solving steps stay hidden until you choose to reveal them.</p></div>
      <Button variant="primary" disabled={busy || draft} onClick={() => showSolutionPath()}>
        <Eye size={17} /> Reveal solution
      </Button>
    </section>
  )
  const clueCount = [...givens].filter((digit) => digit !== '0').length
  const placedDigitCount = [...game.position.entries].filter((digit) => digit !== '0').length
  const candidateTotal = game.position.center.reduce((sum, mask, index) => (
    values[index] === '0' ? sum + candidateCount(mask | game.position.corner[index]) : sum
  ), 0)
  const detailsPanel = (
    <section className="advanced-details" aria-label="Puzzle details">
      <dl>
        <div><dt>Puzzle</dt><dd>{game.title}</dd></div>
        <div><dt>Status</dt><dd>{placeholder ? 'Waiting for puzzle' : solved ? 'Solved' : game.paused ? 'Paused' : game.started ? 'In progress' : 'Not started'}</dd></div>
        <div><dt>Difficulty</dt><dd>{difficulty ? formatPuzzleRating(difficulty, score) : 'Unrated'}</dd></div>
        {showElapsedTime && <div><dt>Elapsed time</dt><dd>{formatTime(game.elapsed)}</dd></div>}
        <div><dt>Givens</dt><dd>{clueCount}</dd></div>
        <div><dt>Placed digits</dt><dd>{placedDigitCount}</dd></div>
        <div><dt>Candidates</dt><dd>{candidateTotal}</dd></div>
        <div><dt>Undo steps</dt><dd>{game.past.length}</dd></div>
      </dl>
    </section>
  )
  const browserPanel = (
    <AdvancedPuzzleBrowser games={games} active={game.id} view={puzzleBrowserView} onViewChange={setPuzzleBrowserView} onSelect={roomStore.select}
      onNew={onNewPuzzle} onCreate={onCreatePuzzle} onSave={onPublish} onEdit={onEditPuzzle}
      onSavePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, saved: true }))}
      onUnsavePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, saved: false, savedForLater: undefined }))}
      onArchivePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, archived: true }))}
      onRestorePuzzle={(id) => roomStore.update(id, (puzzle) => ({ ...puzzle, archived: false }))} />
  )

  return (
    <>
      <PlayLayout desktop={desktop} puzzle={puzzlePanel} hint={hintPanel}
        input={desktop ? inputPanel : <MobileInputTabs active={activeToolPanel} open={openPuzzlePanels}
          panels={{ digits: inputPanel, colors: cellColorsPanel, chains: chainsPanel, subsets: subsetsPanel,
            solution: activeToolPanel === 'solution' ? solutionPathPanel : undefined,
            techniques: activeToolPanel === 'techniques' ? techniquesPanel : undefined,
          }} activeTabRef={activeMobileInputTabRef}
          toolsDisabled={rearranging} toolToggles={panelToggles.length ? panelToggles : undefined}
          onShowTools={opener => { mobileToolsOpener.current = opener }}
          onSelect={selectToolPanel} onClose={closeToolPanel} />}
        insights={activeDesktopTab ? {
          active: activeDesktopTab.id, tabs: openInsightTabs, tabListRef: insightTabsRef, onSelect: selectToolPanel,
          onClose: () => closeToolPanel(activeDesktopTab.id),
          content: activeDesktopTab.id === 'colors' ? cellColorsPanel : activeDesktopTab.id === 'techniques'
            ? techniquesPanel
            : activeDesktopTab.id === 'chains' ? chainsPanel : activeDesktopTab.id === 'subsets' ? subsetsPanel : solutionPathPanel,
        } : undefined}
        mobile={{
          puzzleId: game.id, rearranging, withHint: showMobileHintCard,
          resizableInput: mobileToolsAvailable || openPuzzlePanels.length > 0, inputTabCount: openPuzzlePanels.length,
          savedInputHeight: toolPanels.height,
          onInputHeightChange: height => playSession.set(id, 'toolPanels', current => {
            if (height !== undefined) return { ...current, height }
            return { open: current.open, active: current.active }
          }),
          hintSwipe: mobileHintOpen ? { dismiss: closeHint, apply: applyHintAction } : undefined,
          blocked: Boolean(placeholder) || modalOpen || puzzleMenuOpen || actionsOpen || variantRulesOpen || chainColorsOpen ||
            dialogResult !== null || resetOpen || cancelDraftOpen,
          onRearrangingChange: active => {
            setMobileRearranging(active)
            if (!active) return
            const pointerId = candidateDrag.current?.pointerId ?? dragSelection.current?.pointerId
            candidateDrag.current = null
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
          cellColors={advancedPanelOpen('colors') ? cellColorsPanel : undefined}
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
      <ChainColorsDialog open={chainColorsOpen} first={sketch.active.color} second={sketch.active.secondColor}
        onSelect={sketch.setColors} onClose={() => setChainColorsOpen(false)} onEdit={onEditChainColors && (() => {
          setChainColorsOpen(false)
          onEditChainColors()
        })} />
      {(variant || grid) && <Modal title={`${grid ? sizedName : variantName(variant)} rules`} open={variantRulesOpen} onClose={() => setVariantRulesOpen(false)}>
        <div className="variant-rules-copy">
          {algebraic?.source?.author && <p>By {algebraic.source.author}</p>}
          {six?.author && <p>By {six.author}</p>}
          {(algebraic ? algebraicRules(algebraic) : six && grid?.size === 6 ? sixRuleDescriptions(grid, six.rules) : variant ? variantRuleDescriptions(variant.puzzle) : [MINI_RULE]).map(rule => <p key={rule}>{rule}</p>)}
        </div>
      </Modal>}
      {dialogResult && <PuzzleCheckResult result={dialogResult} onClose={() => setDialogResult(null)} />}
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
