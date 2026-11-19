import { Button, IconButton } from './Button'
import {
  type CSSProperties, type ReactNode, type Dispatch, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import { Braces, Check, CheckCheck, CloudUpload, Eye, Info, Lightbulb, Link2, ListFilter, ListOrdered, LogOut, MoreHorizontal, Palette, Pause, PencilLine, Play, RotateCcw, Share2, X } from 'lucide-react'
import { explainCandidateRecovery, findCandidateRecovery, restoreCandidate, type CandidateRecovery } from '../sudoku/candidate-recovery'
import { recordAction, type ActionKind } from '../sudoku/action-history'
import { chainCandidate, makeChainGraph } from '../sudoku/chains'
import { deviceSync } from '../sudoku/device-sync'
import { formatPuzzleRating, SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, replayStep, runEngine, type Candidate, type Deduction, type DeductionAction, type HintChoice } from '../sudoku/engine'
import {
  COLORS, alternateColorShade, applyDeduction, candidateCount, clearCandidateColors, completeCandidateMasks, conflictsOf, enter, fillEntries,
  formatTime, hasCandidate, hintEliminations, isSolved, markSolveUntimed, needsInitialCandidates, onlyCandidate, paintCandidate, paintCandidates, paintCandidateStroke, paintCells, redo, replaceCandidates, restartGame, setGamePaused, singleFromCandidates, undo, valuesOf,
  type ColorTarget, type EnterOptions, type ErrorMode, type Game, type Mode, type Position,
} from '../sudoku/game'
import { cellReference, describeHint, describeHintDigits, describeHintRemovals, HINT_CANDIDATES_ERROR, HINT_ERROR, NO_HINT, moveHintIndex, moveHintStage, techniqueLabel, type CellReferenceStyle, type HintStage, type PuzzleHint } from '../sudoku/hints'
import { activeHighlightDigit, functionKeyDigit, givenDigitAt, onlyGivensSelected } from '../sudoku/highlighting'
import { aicEndpoints, hintLocation, lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { lessonRoutes } from '../sudoku/lessons'
import { addRatingHints, addSinglesAssistance, hintKey } from '../sudoku/player-rating'
import { applyPuzzleGrade, ratePuzzle } from '../sudoku/puzzle-rating'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'
import type { DesktopPuzzleView } from '../sudoku/play-preferences'
import type { AdvancedModes, AppearancePreferences, HighlightPreferences, WorkspaceMode } from '../sudoku/preferences'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { cellsOnDragPath, rectangleSelection } from '../sudoku/selection'
import { highlightedDigitShortcut, shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { roomStore } from '../sudoku/storage'
import { continueStrongLinkColors } from '../sudoku/strong-link-colors'
import { markTechniqueSolution, observeTechniqueActions } from '../sudoku/technique-history'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { playerActions } from '../sudoku/technique-progress'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../sudoku/puzzle-help'
import { playCandidates } from '../sudoku/variant-play'
import { generationVariant, variantName, variantRuleDescriptions } from '../sudoku/variants'
import { Board, gridCellAtPoint } from './Board'
import { AdvancedPuzzleBrowser, type PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { CellColorPalette } from './CellColorPalette'
import { ChainsPanel } from './ChainsPanel'
import { CompletedPuzzle, PuzzleDifficulty } from './CompletedPuzzle'
import { Controls } from './Controls'
import { DesktopDockLayout } from './DesktopDockLayout'
import { ModeBadge } from './ModeBadge'
import { PuzzleCollectionCredit } from './PuzzleCollections'
import { HintCard } from './HintCard'
import { MobilePanelLayout } from './MobilePanelLayout'
import { useMobileLayout } from './mobile-layout'
import { useGridClickAway } from './useGridClickAway'
import { Modal } from './Modal'
import { MotionSurface, usePresence } from './Presence'
import { PuzzleCheckResult, validation, type DialogResult } from './PuzzleCheckResult'
import { PuzzleAnalysis, PuzzleAnalysisContents } from './PuzzleAnalysis'
import { SolutionDialog, SolutionPath, type SolutionPathState } from './SolutionPath'
import { useChainSketch } from './useChainSketch'
import { useActionHistory } from './useActionHistory'
import { usePlayPreference } from './usePlayPreference'
import { usePuzzleSelection } from './usePuzzleSelection'

const desktopInsightTabs = [
  { id: 'solution', label: 'Solution' },
  { id: 'techniques', label: TECHNIQUE_FINDER_TITLE },
  { id: 'chains', label: 'Chains' },
  { id: 'colors', label: 'Colors' },
] as const

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}

async function solveSingleValues(variant: Game['variant'], values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  if (!variant) return runEngine({ type: 'solve-singles', values, eliminations, displayedCandidates })
  const entries = [...values].map((digit, cell) => variant.puzzle.givens[cell] === '0' ? digit : '0').join('')
  return runEngine({ type: 'variant', operation: 'solve-singles', displayedCandidates,
    position: { puzzle: variant.puzzle, entries, eliminations } })
}

function useTimer(id: string, running: boolean) {
  useEffect(() => {
    if (!running) return
    let started = document.visibilityState === 'visible' ? performance.now() : null

    function tick() {
      if (started === null) return
      const seconds = Math.floor((performance.now() - started) / 1000)
      if (seconds < 1) return
      started += seconds * 1000
      if (!puzzleTiming.getSnapshot().trackTime) return
      roomStore.update(id, (current) => current.timeUntracked ? current : { ...current, elapsed: current.elapsed + seconds })
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        tick()
        started = null
      } else {
        started = performance.now()
      }
    }

    const timer = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', tick)
    return () => {
      tick()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', tick)
    }
  }, [id, running])
}

export type WorktableActions = { check: () => void }

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
  game, games, placeholder, storageAvailable = true, preferredDifficulty, modalOpen, advancedModes, appearance, highlighting, errorMode, multi, actionsRef, inputSize, panelHeight, setPanelHeight,
  beginResize, toggleMulti, onDifficultyChange, onShare, onPublish, onCancelDraft, onNewPuzzle, onCreatePuzzle, onEditPuzzle, onStopPlaying,
  cellReferenceStyle, workspaceMode, showLeftPanel, showRightPanel, showBottomPanel, onOpenHintPanel, onOpenRightPanel, puzzleBrowserView, setPuzzleBrowserView,
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
  onDifficultyChange: (difficulty: DifficultyPreference) => void
  onShare: () => void
  onPublish: () => void
  onCancelDraft: () => void
  onStopPlaying: () => void
  onNewPuzzle: (step?: 'variant' | 'difficulty') => void
  onCreatePuzzle: () => void
  onEditPuzzle: () => void
  showLeftPanel: boolean
  showRightPanel: boolean
  showBottomPanel: boolean
  onOpenHintPanel: () => void
  onOpenRightPanel: () => void
  puzzleBrowserView: PuzzleBrowserView
  setPuzzleBrowserView: (view: PuzzleBrowserView) => void
}) {
  useActionHistory(game)
  const start = game.givens[40] === '0' ? 40 : Math.max(0, game.givens.indexOf('0'))
  const modeBadgeId = useId()
  const [modeBadgePosition, setModeBadgePosition] = usePlayPreference('cardModeBadgePosition')
  const [pointerFocusedCell, setPointerFocusedCell] = useState<number | null>(null)
  const { active, selected, anchor, setActive, setSelected, setAnchor } = usePuzzleSelection(game.id, start)
  const [selectedDigit, setSelectedDigit] = usePlayPreference('selectedDigit')
  const [chainHighlightDigit, setChainHighlightDigit] = useState<number | null>(null)
  const [selectedColor, setSelectedColor] = usePlayPreference('selectedColor')
  const [colorTarget, setColorTarget] = usePlayPreference('colorTarget')
  const [colorBrush, setColorBrush] = usePlayPreference('colorBrush')
  const [lastColoredCandidate, setLastColoredCandidate] = useState<{ gameId: string; candidate: Candidate } | null>(null)
  const [desktopColorsVisible, setDesktopColorsVisible] = useState(false)
  const [focusColorsRequest, setFocusColorsRequest] = useState(0)
  const [desktopChainsVisible, setDesktopChainsVisible] = useState(false)
  const [desktopViews, setDesktopViews] = usePlayPreference('desktopViews')
  const [startDrawingOnOpen, setStartDrawingOnOpen] = useState(false)
  const [highlightCandidatePairs, setHighlightCandidatePairs] = usePlayPreference('highlightCandidatePairs')
  const [highlightMode, setHighlightMode] = usePlayPreference('highlightMode')
  const [pencil, setPencil] = usePlayPreference('pencil')
  const [pencilModifier, setPencilModifier] = useState(false)
  const [candidatePreviewCell, setCandidatePreviewCell] = useState<number | null>(null)
  const [candidateKind, setCandidateKind] = usePlayPreference('candidateKind')
  const [colorMode, setColorMode] = usePlayPreference('colorMode')
  const [eraseMode, setEraseMode] = usePlayPreference('eraseMode')
  const [solution, setSolution] = useState<string | null>(null)
  const [dialogResult, setDialogResult] = useState<DialogResult | null>(null)
  const [variantRulesOpen, setVariantRulesOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [focusAnalysisRequest, setFocusAnalysisRequest] = useState(0)
  const [focusSolutionRequest, setFocusSolutionRequest] = useState(0)
  const [desktopSolutionVisible, setDesktopSolutionVisible] = useState(false)
  const [puzzleMenuOpen, setPuzzleMenuOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [cancelDraftOpen, setCancelDraftOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [notes, setNotes] = useState<{
    values: string; eliminations?: number[]; variant?: Game['variant']; masks: number[] | null; failed?: boolean
  }>()
  const [hintState, setHint] = useState<HintState | null>(null)
  const [hintRevealed, setHintRevealed] = useState(false)
  const mobile = useMobileLayout()
  const desktop = !mobile
  const [mobileRearranging, setMobileRearranging] = useState(false)
  const rearranging = mobile && mobileRearranging
  const [solutionPath, setSolutionPath] = useState<SolutionPathState | null>(null)
  const [solutionPathRevealed, setSolutionPathRevealed] = useState(false)
  const [solutionStep, setSolutionStep] = useState(0)
  const [solutionHintOpen, setSolutionHintOpen] = useState(false)
  const [focusHintRequest, setFocusHintRequest] = useState(0)
  const [focusChainsRequest, setFocusChainsRequest] = useState(0)
  const [solvedView, setSolvedView] = useState<'results' | 'grid' | 'difficulty'>('results')
  const [ratingFailed, setRatingFailed] = useState(false)
  const [singlesCheck, setSinglesCheck] = useState<{ givens: string; variant: Game['variant']; needsMore: boolean }>()
  const boardRef = useRef<HTMLDivElement>(null)
  const restoreCellFocus = useRef<number | null>(null)
  const puzzleCardRef = useRef<HTMLElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const puzzleMenuPopupRef = useRef<HTMLDivElement>(null)
  const insightTabsRef = useRef<HTMLDivElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileHintPanelRef = useRef<HTMLDivElement>(null)
  const hintReturnFocus = useRef(false)
  const dragSelection = useRef<{ pointerId: number; start: number; base: number[]; additive: boolean; moved: boolean } | null>(null)
  const candidateDrag = useRef<CandidateDrag | null>(null)
  const candidatePress = useRef<CandidatePress | null>(null)
  const hoveredCell = useRef<number | null>(null)
  const suppressCellClick = useRef(false)
  const pendingDoubleClickSingle = useRef<{ index: number; digit: number; game: Game } | null>(null)
  const pathRequest = useRef(0)
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
  const conflicts = useMemo(() => conflictsOf(values, game.variant?.puzzle), [values, game.variant])
  const draft = game.source === 'draft'
  // A loading draft skips solver effects but reserves the regular play UI.
  const presentationDraft = draft && !placeholder
  const candidateMode = advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
  const solved = isSolved(game)
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
  const recoveryCell = recovery && cellReference(recovery.cell, cellReferenceStyle, game.difficulty ?? undefined)
  const recoveryLocationVisible = recovery && hintStage !== 'technique'
  const recoveryHistory = visibleHint?.reviewingRemoval && recovery?.movesAgo
    ? recovery.movesAgo === 1 ? 'Your last move removed this candidate.'
      : `You removed this candidate ${recovery.movesAgo} moves ago.`
    : undefined
  const fullHint = hintStage === 'explanation'
  const hintDifficulty = deduction && techniqueDifficulties[deduction.technique]
  const hintCandidates = visibleHint?.candidates
  const locationClue = useMemo(() => deduction && hintStage === 'location'
    ? hintLocation(deduction, cellReferenceStyle, hintDifficulty) : undefined, [deduction, hintStage, cellReferenceStyle, hintDifficulty])
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
    return lessonDiagram({ deduction, candidates: hintCandidates }, deduction.pattern, { cellReferenceStyle, difficulty: hintDifficulty })
  }, [fullHint, deduction, hintCandidates, cellReferenceStyle, hintDifficulty])
  const availableHintAnnotations = hintDiagram?.annotations ?? locationClue?.annotations ?? (recoveryLocationVisible
    ? { cells: new Map([[recovery.cell, { fill: 'var(--lesson-pattern-fill)', outline: 'var(--lesson-pattern)', label: 'Check candidates' }]]) }
    : undefined)
  const playerVisualsSelected = visibleHint?.visuals === 'player'
  const hintAnnotations = playerVisualsSelected ? undefined : availableHintAnnotations
  const hintCopy = recovery ? {
    title: HINT_CANDIDATES_ERROR.title,
    text: hintStage === 'technique' ? 'Your placed digits match the solution. A required candidate is missing.'
      : [`Check ${recoveryCell}.`, recoveryHistory].filter(Boolean).join(' '),
  } : !deduction ? visibleHint?.error ?? NO_HINT
    : fullHint ? describeHint(deduction, { difficulty: hintDifficulty, cellReferenceStyle })
    : {
      title: techniqueLabel(deduction.technique),
      text: hintStage === 'technique' ? '' : endpointMarks ? locationClue.text
        : [describeHintDigits(deduction), locationClue?.text].filter(Boolean).join(' '),
    }
  const showResults = solved && solvedView === 'results'
  const showDifficulty = solved && solvedView === 'difficulty'
  const showSolvedGrid = solved && solvedView === 'grid'
  const mobileResults = mobile && (showResults || showDifficulty)
  const { id, givens, difficulty, score, variant, generatedWithAuto } = game
  const analysisDialogOpen = analysisOpen && mobile && !draft && !solved
  const needsRating = difficulty === undefined || score === undefined
  const needsAttempt = !solved && !game.ratingAttempt
  const ratingPending = !draft && needsRating && !ratingFailed
  const advancedWorkspace = desktop && workspaceMode === 'advanced'
  const { mounted: desktopActionsMounted, exiting: desktopActionsExiting } = usePresence(desktop && !advancedWorkspace && actionsOpen)
  const { mounted: puzzleMenuMounted, exiting: puzzleMenuExiting } = usePresence(puzzleMenuOpen)
  const openInsightTabs = desktop && !advancedWorkspace && !placeholder && !draft
    ? desktopInsightTabs.filter(({ id }) => desktopViews.open.includes(id) && (!solved || (id !== 'chains' && id !== 'colors')))
    : []
  const activeDesktopTab = openInsightTabs.find(({ id }) => id === desktopViews.active) ??
    openInsightTabs.find(({ id }) => id === 'techniques') ?? openInsightTabs[0]
  const previewing = !draft && solutionPathRevealed && solutionPath !== null &&
    (mobile || (advancedWorkspace ? desktopSolutionVisible : activeDesktopTab?.id === 'solution'))
  const disabled = Boolean(placeholder) || previewing || game.paused || rearranging
  const cellColorsDisabled = draft || disabled || (solved && !showSolvedGrid)
  const chainsVisible = advancedWorkspace ? showRightPanel && desktopChainsVisible : activeDesktopTab?.id === 'chains'
  const variantEliminations = variant && eliminations
  const currentNotes = notes?.values === values && notes.variant === variant && notes.eliminations === variantEliminations ? notes : undefined
  const masks = currentNotes?.masks
  const autoGenerateCandidates = advancedModes.autoGenerateCandidates && !draft && !solved && needsInitialCandidates(game)
  const hasSingles = useMemo(() => !draft && !solved && Boolean(masks &&
    singleFromCandidates(values, displayedCandidates ?? masks, eliminations, variant?.puzzle)),
    [draft, solved, masks, values, displayedCandidates, eliminations, variant])
  const needsSinglesCheck = !generatedWithAuto && difficulty !== 'easy'
  const offerSingles = !draft && !solved && (generatedWithAuto || (
    !ratingPending && needsSinglesCheck && singlesCheck?.givens === givens && singlesCheck.variant === variant && singlesCheck.needsMore
  ))
  const chainMasks = useMemo(() => (chainsVisible || playerVisualsSelected) && !disabled && !draft && !solved && masks
    ? masks.map((mask, index) => mask & (displayedCandidates?.[index] ?? 0x1ff) & ~(eliminations?.[index] ?? 0))
    : null, [chainsVisible, playerVisualsSelected, disabled, draft, solved, masks, displayedCandidates, eliminations])
  const missingChainCandidates = chainMasks?.some((mask, cell) => !mask && values[cell] === '0')
  const chainGraph = useMemo(() => chainMasks && !missingChainCandidates ? makeChainGraph(chainMasks, variant?.puzzle) : null,
    [chainMasks, missingChainCandidates, variant])
  const sketch = useChainSketch(chainGraph, `${id}:${values}:${eliminations?.join(',') ?? ''}:${displayedCandidates?.join(',') ?? ''}`, chainsVisible)
  const canPaint = !cellColorsDisabled && desktop
  const colorsVisible = advancedWorkspace ? showRightPanel && desktopColorsVisible : activeDesktopTab?.id === 'colors'
  const brush = canPaint && colorsVisible && !hintAnnotations ? colorBrush : null
  const mobileHintPreview = mobileHintOpen && !playerVisualsSelected
  const candidateBrush = colorTarget === 'candidate' && !cellColorsDisabled && !sketch.drawing && !hintAnnotations && !mobileHintPreview
    ? colorMode ? selectedColor : brush : null
  const paintingCandidates = candidateBrush !== null
  const colorLinkMasks = useMemo(() => {
    if (!masks || !displayedCandidates) return null
    const result = masks.map((mask, cell) => values[cell] === '0'
      ? mask & displayedCandidates[cell] & ~(eliminations?.[cell] ?? 0) : 0)
    return result.some((mask, cell) => values[cell] === '0' && !mask) ? null : result
  }, [masks, displayedCandidates, values, eliminations])
  const paintedStart = lastColoredCandidate?.gameId === id && lastColoredCandidate.candidate.cell === active
    ? lastColoredCandidate.candidate : null
  const colorStartCell = selected.length > 1 ? null : selected[0] ?? active
  const colorStartDigit = colorTarget === 'candidate' && !selected.length && paintedStart ? paintedStart.digit : coloringDigit
  const colorStart = useMemo(() => colorStartCell !== null && colorStartDigit
    ? { cell: colorStartCell, digit: colorStartDigit } : null, [colorStartCell, colorStartDigit])
  const colorContinuation = useMemo(() => colorsVisible && colorLinkMasks && colorStart
    ? continueStrongLinkColors(colorLinkMasks, colorStart, game.position, colorTarget, variant?.puzzle) : null,
  [colorsVisible, colorLinkMasks, colorStart, game.position, colorTarget, variant])
  const colorStartLocation = colorStart && cellReference(colorStart.cell, cellReferenceStyle, game.difficulty ?? undefined)
  const colorConflict = colorContinuation?.conflicts[0]
  const colorConflictLocation = colorConflict && cellReference(colorConflict.cell, cellReferenceStyle, game.difficulty ?? undefined)
  const remainingColors = colorContinuation?.marks.length ?? 0
  const colorSubject = colorTarget === 'cell' ? 'cell' : 'candidate'
  const canContinueColorGroup = colorContinuation?.status === 'ready'
  const colorGroupMessage = selected.length > 1 ? 'Select one starting cell to continue its group.'
    : !colorStart ? colorTarget === 'candidate' ? 'Color a starting candidate, then continue its group.'
      : 'Select a number in the digit input, then color a starting cell.'
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
    !puzzleMenuOpen && !actionsOpen && !dialogResult && !resetOpen && !variantRulesOpen && !analysisDialogOpen
  const temporaryPencil = pencilModifier && canActivateTemporaryPencil
  const pencilActive = pencil || temporaryPencil
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencilActive ? candidateMode : 'value'
  const canDragCandidates = !disabled && !draft && pencilActive && !highlightMode && !colorMode && !eraseMode &&
    !paintingCandidates && !sketch.drawing && !hintAnnotations && selectedDigit !== null && selectedDigit > 0
  const canPreviewCandidates = canDragCandidates && selected.length === 0 && brush === null && !solved &&
    !modalOpen && !mobileHintPreview && !puzzleMenuOpen && !actionsOpen && !dialogResult && !resetOpen &&
    !variantRulesOpen && !analysisDialogOpen
  const trace = solutionPath?.status === 'ready' ? solutionPath.trace : undefined
  const previewPosition = trace?.positions?.[solutionStep]
  const replayedSolutionStep = useMemo(() => trace && replayStep(trace, solutionStep), [trace, solutionStep])
  const solutionStepDifficulty = replayedSolutionStep ? techniqueDifficulties[replayedSolutionStep.deduction.technique] : undefined
  const stepDiagram = useMemo(() => {
    const step = replayedSolutionStep
    if (!step?.before.candidates || !step.before.pattern) return undefined
    return lessonDiagram({ deduction: step.deduction, candidates: step.before.candidates }, step.before.pattern,
      { cellReferenceStyle, difficulty: solutionStepDifficulty })
  }, [replayedSolutionStep, cellReferenceStyle, solutionStepDifficulty])
  const chainInspection = previewing && replayedSolutionStep && isChainStep(replayedSolutionStep.deduction)
    ? { deduction: replayedSolutionStep.deduction, links: stepDiagram?.annotations.links ?? [], explanation: stepDiagram?.reason,
      cellReferenceStyle, difficulty: solutionStepDifficulty }
    : undefined
  const solutionHintCopy = replayedSolutionStep
    ? describeHint(replayedSolutionStep.deduction, {
      difficulty: solutionStepDifficulty, cellReferenceStyle,
    })
    : trace && solutionStep === trace.steps.length
      ? { title: 'Final grid', text: 'The solution is complete. The final grid is shown.' }
      : null

  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  const showElapsedTime = timing.showTimer && !game.timeUntracked && (timing.trackTime || solved)
  useTimer(game.id, !rearranging && timing.trackTime && !game.timeUntracked && !draft && game.started && !game.paused && !solved && !modalOpen && !puzzleMenuOpen && !actionsOpen && !previewing && dialogResult === null &&
    !resetOpen && !cancelDraftOpen && !variantRulesOpen && !analysisDialogOpen)

  useEffect(() => {
    if (!timing.trackTime && !draft && !solved && game.started && !game.timeUntracked) {
      roomStore.update(id, (current) => isSolved(current) ? current : markSolveUntimed(current))
    }
  }, [draft, game.started, game.timeUntracked, id, solved, timing.trackTime])

  const markHintVisible = useCallback(() => {
    if (!deduction || previewing || solved) return
    roomStore.update(id, (current) => {
      if (!matchesHintPosition(current, hintPosition)) return current
      const removals = hintEliminations(hintPosition.values, completeCandidateMasks(current), current.position.eliminations)
      void observeTechniqueActions(current, deduction.actions, 'hint', removals)
      return withRatingHints(current, [hintKey(deduction.actions)], false, {
        at: Date.now(), position: `${hintPosition.values}:${removals?.join(',') ?? ''}`,
      })
    })
  }, [deduction, hintPosition, id, previewing, solved])

  const markSolutionVisible = useCallback(() => {
    markTechniqueSolution({ givens, variant })
    roomStore.finishRatingAttempt(id, 'solution')
  }, [givens, id, variant])

  useLayoutEffect(() => {
    puzzleCardRef.current?.closest<HTMLElement>('.dock-puzzle-panel')?.scrollTo(0, 0)
    setPointerFocusedCell(null)
    setDialogResult(null)
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setResetOpen(false)
    setVariantRulesOpen(false)
    setAnalysisOpen(false)
    setHint(null)
    setHintRevealed(false)
    hintReturnFocus.current = false
    setSolutionPath(null)
    setSolutionPathRevealed(false)
    setStartDrawingOnOpen(false)
    setSolutionStep(0)
    setSolutionHintOpen(false)
    setSolvedView('results')
    setRatingFailed(false)
    dragSelection.current = null
    candidateDrag.current = null
    candidatePress.current = null
    hoveredCell.current = null
    setCandidatePreviewCell(null)
    suppressCellClick.current = false
    pathRequest.current++
  }, [game.id, game.source])

  useGridClickAway(boardRef, () => { if (!rearranging) setSelected([]) }, (target) => Boolean(
    target.closest('[data-panel-editor], .desktop-layout-edge, .desktop-layout-divider, .puzzle-mode-tab, .desktop-insight-panel, .chains-panel')
      || target.closest('.controls, .cell-color-palette, .hint-card, .solution-path, .puzzle-actions-sheet, .desktop-actions-menu')
      && target.closest('button, input, select, textarea, a, [role="separator"]'),
  ))

  useEffect(() => {
    if (!mobile) setAnalysisOpen(false)
    if (!mobile) return
    pathRequest.current++
    setSolutionPath(null)
    setSolutionPathRevealed(false)
    setSolutionHintOpen(false)
  }, [mobile])

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

  useEffect(() => {
    setSolutionPath(null)
    setSolutionPathRevealed(false)
    setSolutionHintOpen(false)
    return () => { pathRequest.current++ }
  }, [game.id, givens])

  useEffect(() => {
    if (draft || !needsRating && !needsAttempt) return
    let current = true
    void ratePuzzle(givens, variant).then((grade) => {
      if (!current) return
      roomStore.update(id, (latest) => latest.givens === givens && latest.variant === variant ? applyPuzzleGrade(latest, grade) : latest)
    }).catch(() => {
      if (current) setRatingFailed(true)
    })
    return () => { current = false }
  }, [id, givens, draft, needsAttempt, needsRating, variant])

  useEffect(() => {
    if (draft || solved || !needsSinglesCheck) return
    let current = true
    const check = variant
      ? solveSingleValues(variant, givens).then((board) => board.includes('0'))
      : runEngine({ type: 'rate', values: givens, techniqueOrder: SINGLE_TECHNIQUES }).then(({ status }) => status === 'stalled')
    void check.then((needsMore) => {
      if (current) setSinglesCheck({ givens, variant, needsMore })
    }).catch(() => { /* Leave the action hidden when the starting puzzle cannot be checked. */ })
    return () => { current = false }
  }, [draft, givens, needsSinglesCheck, solved, variant])

  useEffect(() => {
    if (!autoGenerateCandidates || !masks) return
    roomStore.update(id, (current) => current.givens === givens && valuesOf(current) === values && needsInitialCandidates(current)
      ? replaceCandidates(current, masks, { recordHistory: false })
      : current)
  }, [autoGenerateCandidates, givens, id, masks, values])

  useEffect(() => {
    let current = true
    if (draft || solved) return

    void playCandidates(game).then((masks) => {
      if (current) setNotes({ values, eliminations: variantEliminations, variant, masks })
    }).catch(() => {
      if (current) setNotes({ values, eliminations: variantEliminations, variant, masks: null, failed: true })
    })

    return () => { current = false }
  }, [draft, solved, values, variant, variantEliminations])

  useLayoutEffect(() => {
    if (!startDrawingOnOpen || !chainsVisible || !currentNotes) return
    setStartDrawingOnOpen(false)
    if (chainGraph && !sketch.drawing) sketch.toggle()
  }, [startDrawingOnOpen, chainsVisible, currentNotes, chainGraph, sketch])

  useLayoutEffect(() => {
    if (chainsVisible) return () => setStartDrawingOnOpen(false)
  }, [chainsVisible])

  useLayoutEffect(() => {
    if (!sketch.drawing) return
    changeHintVisuals('player')
    setColorBrush(null)
    setChainHighlightDigit(selectedDigit)
  }, [sketch.drawing])

  useLayoutEffect(() => {
    if (!advancedWorkspace && focusChainsRequest && activeDesktopTab?.id === 'chains') {
      insightTabsRef.current?.querySelector<HTMLButtonElement>('[data-insight-tab="chains"]')?.focus({ preventScroll: true })
    }
  }, [advancedWorkspace, focusChainsRequest, activeDesktopTab?.id])

  useLayoutEffect(() => {
    if (paintingCandidates) {
      if (!document.activeElement?.closest('.hint-card-visuals')) {
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
      if (!solved) actionsMenuButtonRef.current?.focus({ preventScroll: true })
      hintReturnFocus.current = false
    }
  }, [mobileHintOpen, solved])

  useEffect(() => {
    if (!solved) setSolvedView('results')
    else if (showSolvedGrid) boardRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true })
  }, [solved, showSolvedGrid])

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

  useEffect(() => {
    if (advancedModes.colorsEnabled || desktop) return
    setColorMode(false)
    setSelectedColor(null)
  }, [advancedModes.colorsEnabled, desktop])

  useEffect(() => {
    let current = true
    setSolution(variant?.solution ?? null)
    if (!draft && !variant) {
      void runEngine({ type: 'solve', values: game.givens })
        .then((result) => { if (current) setSolution(result) })
        .catch(() => { /* Checking still works if the solution cannot be loaded. */ })
    }
    return () => { current = false }
  }, [draft, game.givens, variant])

  const errors = useMemo(() => {
    const result = new Set<number>()
    if (errorMode === 'none' || draft) return result
    if (errorMode === 'all') conflicts.forEach((index) => result.add(index))
    if (solution) {
      for (let index = 0; index < 81; index++) {
        if (game.position.entries[index] !== '0' && game.position.entries[index] !== solution[index]) result.add(index)
      }
    }
    return result
  }, [conflicts, draft, errorMode, game.position.entries, solution])

  function edit(transform: (current: Game) => Game, kind: ActionKind = transform === undo ? 'undo' : transform === redo ? 'redo' : 'edit',
    options?: { technique?: string; actions?: readonly DeductionAction[] }) {
    if (disabled) return
    roomStore.update(game.id, (current) => recordAction(current, transform(current), kind, options))
  }

  function enterFromInput(cells: number[], digit: number, inputMode: Mode, options?: EnterOptions) {
    if (inputMode === 'color') changeHintVisuals('player')
    edit((current) => {
      const origin = current
      const next = enter(origin, cells, inputMode, digit, options)
      const actions = playerActions(origin, next, cells, inputMode, digit)
      if (actions.length && !solved) void observeTechniqueActions(origin, actions, 'independent',
        hintEliminations(valuesOf(origin), completeCandidateMasks(origin), origin.position.eliminations))
      return next
    })
  }

  function toggleChainHighlight(digit: number) {
    setChainHighlightDigit((current) => digit === 0 || current === digit ? null : digit)
  }

  function stopDrawingAndFocusGrid() {
    sketch.stop()
    requestAnimationFrame(() => boardRef.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus({ preventScroll: true }))
  }

  function input(digit: number, inputMode = highlightMode ? 'value' : mode, cells = selected) {
    if (brush !== null && inputMode === 'value') {
      highlightColorDigit(digit === 0 || digit === coloringDigit ? null : digit)
      return
    }
    setColorBrush(null)
    if (inputMode === 'color') {
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
    if (digit > 0) setEraseMode(false)
    if (highlightMode && cells.length) {
      if (inputMode === 'value' && digit > 0 && onlyGivensSelected(game.givens, cells)) {
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
      setSelectedDigit((current) => digit === 0 || current === digit ? null : digit)
      return
    }
    enterFromInput(cells, digit, inputMode)
  }

  function changeColorTarget(target: ColorTarget) {
    if (target === colorTarget) return
    setColorTarget(target)
    changeHintVisuals('player')
  }

  function chooseColor(color: number) {
    if (!canPaint) return
    if (sketch.drawing) sketch.stop()
    if (colorTarget === 'cell' && selected.length) {
      edit((current) => enter(current, selected, 'color', color))
      setSelected([])
    }
    changeHintVisuals('player')
    setColorMode(false)
    setEraseMode(false)
    setPencil(false)
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

  function toggleHighlightMode() {
    if (brush !== null && colorTarget === 'candidate') {
      setHighlightMode((current) => !current)
      return
    }
    setColorBrush(null)
    setEraseMode(false)
    setPencil(false)
    setColorMode(false)
    setHighlightMode((current) => !current)
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
    const selectingMultiple = !pencilActive && (event.metaKey || event.ctrlKey)
    if (!givenDigit && !highlightMode && !selected.length && armedInput !== null && !event.shiftKey && !selectingMultiple) {
      enterFromInput([index], armedInput, mode, { toggleValue: !draft && mode === 'value' })
      return
    }
    if (givenDigit) setSelectedDigit(givenDigit)
    else if (!highlightMode) setSelectedDigit(null)
    if (event.shiftKey && selected.length) setSelected(rectangleSelection(anchor, index))
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
    const initial = roomStore.getSnapshot().games.find((item) => item.id === game.id) ?? game
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
      for (const cell of cellsOnDragPath(stroke.previous, index)) {
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
    const dragged = rectangleSelection(drag.start, index)
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
      if (event.defaultPrevented || rearranging || game.paused || (solved && !showSolvedGrid) || modalOpen || puzzleMenuOpen || actionsOpen || dialogResult !== null || resetOpen || cancelDraftOpen || analysisDialogOpen || event.altKey ||
        (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(target.tagName)))) return
      if (desktop && !draft && !solved && !placeholder && shortcutMatches(event, shortcuts, 'chainDrawing')) {
        event.preventDefault()
        if (event.repeat) return
        if (sketch.drawing) stopDrawingAndFocusGrid()
        else if (chainsVisible && chainGraph) sketch.toggle()
        else if (!chainsVisible || previewing) {
          setStartDrawingOnOpen(true)
          showChains()
        } else if (!currentNotes) setStartDrawingOnOpen((open) => !open)
        return
      }
      if (previewing) return
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
        if (!sketch.drawing) sketch.toggle()
        return
      }
      if (event.key === 'Control' || event.key === 'Meta') {
        if (canActivateTemporaryPencil) setPencilModifier(true)
        return
      }
      const key = event.key.toLowerCase()
      const shortcut = event.ctrlKey || event.metaKey
      const highlightedDigit = highlightedDigitShortcut(event) ?? functionKeyDigit(event.key)
      if (sketch.drawing) {
        if (key === 'escape') {
          event.preventDefault()
          if (sketch.pending === null) stopDrawingAndFocusGrid()
          else sketch.endPath()
        } else if (shortcut && key === 'z' && !event.shiftKey) {
          event.preventDefault()
          if (sketch.canUndo) sketch.undo()
        } else if (shortcutMatches(event, shortcuts, 'highlightMode')) {
          event.preventDefault()
          setChainHighlightDigit(null)
        } else if (!shortcut && highlightedDigit) {
          event.preventDefault()
          setChainHighlightDigit(highlightedDigit)
        } else if (!shortcut && (/^[0-9]$/.test(key) || key === 'delete' || key === 'backspace')) {
          event.preventDefault()
          if (!event.repeat) toggleChainHighlight(Number(key) || 0)
        }
        return
      }
      if (key === 'escape' && (brush !== null || paintingCandidates)) {
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
      } else if (!draft && !shortcut && highlightedDigit) {
        event.preventDefault()
        setHighlightCandidatePairs(false)
        setSelectedDigit(highlightedDigit)
      } else if (!draft && shortcut && !event.shiftKey && !event.isComposing) {
        const digit = /^[1-9]$/.test(key) ? key : /^Digit([1-9])$/.exec(event.code)?.[1]
        if (!digit) return
        const cells = !selected.length && target instanceof HTMLButtonElement &&
          target.matches('[role="gridcell"][data-cell]') && boardRef.current?.contains(target)
          ? [Number(target.dataset.cell)] : selected
        if (!cells.some((cell) => values[cell] === '0')) return
        event.preventDefault()
        if (event.repeat) return
        input(Number(digit), candidateMode, cells)
      } else if (!shortcut && ARROWS[event.key] && (target === document.body || boardRef.current?.contains(target as Node))) {
        event.preventDefault()
        const [dy, dx] = ARROWS[event.key]
        const row = Math.min(8, Math.max(0, Math.floor(active / 9) + dy))
        const col = Math.min(8, Math.max(0, active % 9 + dx))
        const next = row * 9 + col
        setActive(next)
        const givenDigit = givenDigitAt(game.givens, next)
        if (givenDigit) setSelectedDigit(givenDigit)
        else if (!highlightMode) setSelectedDigit(null)
        if (event.shiftKey) setSelected(rectangleSelection(anchor, next))
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
        setColorBrush(null)
        setEraseMode(false)
        setPencil(false)
        setColorMode(false)
        setHighlightMode(false)
      } else if (!draft && shortcutMatches(event, shortcuts, 'pencilMode')) {
        event.preventDefault()
        setColorBrush(null)
        setEraseMode(false)
        setColorMode(false)
        setHighlightMode(false)
        setPencil((current) => !current)
      } else if (!draft && shortcutMatches(event, shortcuts, 'highlightMode')) {
        event.preventDefault()
        toggleHighlightMode()
      } else if (!draft && shortcutMatches(event, shortcuts, 'colorMode') && (desktop || advancedModes.colorsEnabled)) {
        event.preventDefault()
        if (desktop) { showColors(); return }
        setColorBrush(null)
        setEraseMode(false)
        setPencil(false)
        setHighlightMode(false)
        setColorMode((current) => !current)
      } else if (!draft && shortcutMatches(event, shortcuts, 'eraseMode')) {
        event.preventDefault()
        setColorBrush(null)
        setColorMode(false)
        setPencil(false)
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
      const status = variant
        ? await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: variant.puzzle, entries: game.position.entries } })
        : await runEngine({ type: 'analyze', values })
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values) return
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
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values) return
      if (!masks) {
        setDialogResult({ title: 'Puzzle action', text: 'Candidates cannot be generated until the grid conflicts are resolved.', tone: 'error' })
        return
      }
      roomStore.update(game.id, (latest) => valuesOf(latest) === values
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
      const result = await solveSingleValues(variant, values, eliminations, displayedCandidates ?? undefined)
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values || current.position.eliminations !== eliminations) return
      if (result === values) {
        setDialogResult({ title: 'Puzzle action', text: 'There are no singles to solve right now.', tone: 'neutral' })
        return
      }
      const removedCandidates = eliminations?.some(Boolean) || (displayedCandidates && masks?.some((mask, cell) =>
        values[cell] === '0' && (mask & ~displayedCandidates[cell]) !== 0))
      const assistance = values === givens && !removedCandidates && !result.includes('0') ? 'all' : 'partial'
      roomStore.update(game.id, (latest) => {
        if (valuesOf(latest) !== values || latest.position.eliminations !== eliminations) return latest
        const placements = [...result].flatMap((digit, cell) => digit !== '0' && values[cell] !== digit ? [{ place: { cell, digit: Number(digit) } }] : [])
        void observeTechniqueActions(latest, placements, 'automated')
        const next = recordAction(latest, fillEntries(latest, result), 'singles')
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
    if (sketch.drawing) sketch.stop()
    if (mobile) hintReturnFocus.current = true
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
    const removals = hintEliminations(values, displayedCandidates, eliminations)
    try {
      const collection = limit === 'all' ? ++nextHintCollection : undefined
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
          const answer = variant ? await runEngine({
            type: 'variant', operation: 'solve', position: { puzzle: variant.puzzle, entries: game.position.entries },
          }) : await runEngine({ type: 'solve', values })
          if (answer) result.recovery = findCandidateRecovery(game, answer, removals)
        } catch { /* Keep the general candidate warning if recovery cannot be verified. */ }
      }
    } finally {
      setBusy(false)
    }
    const current = roomStore.getSnapshot().games.find((item) => item.id === id)
    if (requestId === techniqueHintRequest.current && current && matchesHintPosition(current, hintPosition)) setHint(result)
    else if (result.page) void runEngine({ type: 'release-hints', collection: result.page.collection }).catch(() => {})
  }

  async function showTechniqueHints(technique: string) {
    if (busy || solved || draft) return
    // Mobile must close its modal before the hint and highlighted grid can be used.
    setAnalysisOpen(false)
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (sketch.drawing) sketch.stop()
    if (mobile) hintReturnFocus.current = true
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
    const latest = roomStore.getSnapshot().games.find((item) => item.id === id)
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
    if (visuals === 'hint' && sketch.drawing) sketch.stop()
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
    if (!recovery || !visibleHint || !fullHint) return
    edit((current) => matchesHintPosition(current, visibleHint.position) ? restoreCandidate(current, recovery) : current, 'recovery')
    setHint(null)
    setHintRevealed(false)
    if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }

  function applyToCurrentPosition(actions: readonly DeductionAction[], candidates: readonly number[], hintSnapshot?: HintPosition, technique?: string) {
    let applied = false
    edit((current) => {
      const currentPosition = matchesHintPosition(current, hintSnapshot ?? hintPosition)
      if (!currentPosition) return current
      const next = applyDeduction(current, actions, candidates)
      applied = next !== current
      if (applied && !hintSnapshot) void observeTechniqueActions(current, actions, 'independent',
        hintEliminations(valuesOf(current), completeCandidateMasks(current), current.position.eliminations))
      return applied && hintSnapshot ? withRatingHints(next, [hintKey(actions)], true) : next
    }, hintSnapshot ? 'hint' : 'edit', { technique, actions })
    return applied
  }

  function applyChainEdits(actions: readonly DeductionAction[]) {
    if (chainMasks && applyToCurrentPosition(actions, chainMasks)) sketch.stop()
  }

  function applyHint() {
    if (!fullHint || !deduction || !hintCandidates || !visibleHint) return
    applyToCurrentPosition(deduction.actions, hintCandidates, visibleHint.position, deduction.technique)
    setHint(null)
    setHintRevealed(false)
    if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }

  async function showSolutionPath(force = false) {
    if (draft || busy) return
    setPuzzleMenuOpen(false)
    if (advancedWorkspace) {
      onOpenRightPanel()
      setFocusSolutionRequest((request) => request + 1)
    } else if (desktop) openDesktopView('solution')
    setHintRevealed(false)
    setSolutionHintOpen(false)
    setActionsOpen(false)
    setSolutionPathRevealed(true)
    if (solutionPath && !force) return
    setSolutionStep(0)
    setSolutionPath({ status: 'loading' })
    const request = ++pathRequest.current
    try {
      const result = await puzzleSolution(game)
      if (request !== pathRequest.current) return
      if (result.positions?.length !== result.steps.length + 1) throw new Error('Missing solution positions')
      setSolutionPath({ status: 'ready', trace: result })
    } catch (error) {
      if (request !== pathRequest.current) return
      setSolutionPath({
        status: 'unavailable',
        message: error instanceof EngineError && error.code === 'search-limit'
          ? 'The solver reached its search limit before finding a path.'
          : 'The solution couldn’t load.',
      })
    }
  }

  function closeSolutionPath() {
    setSolutionPathRevealed(false)
    setSolutionHintOpen(false)
    setPuzzleMenuOpen(false)
    if (advancedWorkspace) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
    else if (desktop) closeDesktopView('solution')
  }

  function selectSolutionStep(index: number) {
    setSolutionStep(index)
    setSolutionHintOpen(true)
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
  const hasHintDetails = !solutionHintPanel && (recovery || (deduction && hintCandidates))
  const revealLabel = hintStage === 'technique' ? recovery ? 'Show cell' : 'Show digits'
    : hintStage === 'digits' ? aicEndpoints(deduction) ? 'Show endpoints' : 'Show location'
      : 'Show explanation'
  const hintAction = !hasHintDetails ? undefined
    : !fullHint ? { label: revealLabel, onClick: () => changeHintDetail(1) }
      : recovery ? { label: 'Restore candidate', onClick: applyCandidateRecovery }
        : { label: 'Apply hint', onClick: applyHint }
  const explanation = solutionHintPanel ? stepDiagram : hintDiagram
  const revealedDeduction = solutionHintPanel ? replayedSolutionStep?.deduction : fullHint && !recovery ? deduction : undefined
  const recoveryExplanation = !solutionHintPanel && recovery && fullHint
    ? explainCandidateRecovery(game, recovery, cellReferenceStyle) : undefined
  const hintPanel = (solutionHintPanel || visibleHint || hintLoading || mobileHintOpen) && (
    <div className={`hint-dock${mobile ? ' workspace-controls mobile-hint-panel' : ''}`}
      ref={mobile ? mobileHintPanelRef : undefined} aria-live="polite">
      <HintCard hint={solutionHintPanel ? solutionHintCopy
        : hintLoading ? { title: 'Finding a hint…', text: '' } : hintCopy}
        lesson={hintLesson && hintTechnique ? { id: hintTechnique, title: hintLesson.title } : undefined}
        removals={revealedDeduction ? describeHintRemovals(revealedDeduction, {
          difficulty: techniqueDifficulties[revealedDeduction.technique], cellReferenceStyle,
        }) : undefined}
        onClose={() => solutionHintPanel ? setSolutionHintOpen(false) : setHintRevealed(false)}
        onShown={!solutionHintPanel && deduction ? markHintVisible : undefined}
        visuals={availableHintAnnotations && !disabled && !solved ? {
          visible: !playerVisualsSelected,
          onToggle: () => changeHintVisuals(playerVisualsSelected ? 'hint' : 'player'),
        } : undefined}
        action={hintAction}
        lessDetail={hasHintDetails ? { disabled: hintStage === 'technique', onClick: () => changeHintDetail(-1) } : undefined}
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
    </div>
  )
  const cellColorsPanel = (
    <CellColorPalette target={colorTarget} onTarget={changeColorTarget} brush={brush}
      hasColors={colorTarget === 'cell' ? game.position.colors.some(Boolean) : Boolean(game.position.candidateColors)}
      canContinueGroup={canContinueColorGroup} groupMessage={colorGroupMessage} onContinueGroup={continueColorGroup}
      disabled={cellColorsDisabled} onColor={chooseColor} onSwitchShade={switchColorShade}
      onStop={() => setColorBrush(null)} onClear={clearColors} />
  )
  const chainUnavailable = chainGraph ? undefined
    : previewing ? 'Select a chain step in Solution.'
    : draft || solved ? 'Chains are available while solving.'
    : game.paused ? 'Resume the puzzle to mark chains.'
    : missingChainCandidates ? 'Restore candidates in empty cells before you mark chains.'
    : currentNotes?.failed ? 'The candidates did not load.'
    : currentNotes?.masks === null ? 'Resolve the grid conflicts to draw links.'
    : 'Loading candidates…'
  const chainsPanel = <ChainsPanel sketch={sketch} onApply={applyChainEdits} shortcuts={shortcuts} unavailable={chainUnavailable} inspection={chainInspection}
    digitHighlight={advancedWorkspace && sketch.drawing ? { digit: chainHighlightDigit, onChange: setChainHighlightDigit } : undefined} />
  const completionPanel = showResults ? (
    <CompletedPuzzle game={game} games={games} preferredDifficulty={preferredDifficulty}
      ratingPending={ratingPending} shortcutEnabled={!rearranging && !modalOpen && !puzzleMenuOpen && !actionsOpen && !cancelDraftOpen && !variantRulesOpen}
      showGuides={appearance.showGuides} cellReferenceStyle={cellReferenceStyle} onChooseDifficulty={() => {
        if (mobile) onNewPuzzle('difficulty')
        else setSolvedView('difficulty')
      }} onChooseVariant={() => onNewPuzzle('variant')} />
  ) : showDifficulty ? (
    <PuzzleDifficulty value={preferredDifficulty} variant={generationVariant(variant)} showGuides={appearance.showGuides}
      onBack={() => setSolvedView('results')} onChange={onDifficultyChange} />
  ) : null
  const solveSinglesAction = <button onClick={() => { void solveAllSingles() }} disabled={busy || !hasSingles}
    aria-keyshortcuts={shortcutLabel(shortcuts.solveSingles)}>
    <CheckCheck size={17} /> Solve all singles <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.solveSingles)}</kbd>
  </button>
  function showColors() {
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    changeHintVisuals('player')
    setColorMode(false)
    if (sketch.drawing) sketch.stop()
    if (advancedWorkspace) {
      if (previewing) closeSolutionPath()
      onOpenRightPanel()
      setFocusColorsRequest((request) => request + 1)
    } else openDesktopView('colors')
  }

  const colorsAction = desktop && !draft && !solved && !placeholder && (
    <button onClick={showColors}><Palette size={17} /> Colors</button>
  )

  function showChains() {
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    changeHintVisuals('player')
    if (advancedWorkspace) {
      if (previewing) closeSolutionPath()
      else puzzleMenuButtonRef.current?.focus({ preventScroll: true })
      onOpenRightPanel()
    } else openDesktopView('chains')
    setFocusChainsRequest((request) => request + 1)
  }

  function openDesktopView(view: DesktopPuzzleView) {
    setDesktopViews((current) => current.active === view ? current : {
      open: current.open.includes(view) ? current.open : [...current.open, view],
      active: view,
    })
  }

  function closeDesktopView(view: DesktopPuzzleView) {
    if (view === 'colors') setColorBrush(null)
    const remaining = openInsightTabs.filter(({ id }) => id !== view)
    const next = remaining.find(({ id }) => id === 'techniques') ?? remaining[0]
    setDesktopViews((current) => {
      const open = current.open.filter((id) => id !== view)
      return { open, active: next?.id ?? open[0] ?? null }
    })
    if (next) {
      insightTabsRef.current?.querySelector<HTMLButtonElement>(`[data-insight-tab="${next.id}"]`)?.focus({ preventScroll: true })
    } else puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }
  function showAnalysis() {
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (advancedWorkspace) {
      onOpenRightPanel()
      setFocusAnalysisRequest((request) => request + 1)
    } else if (desktop) {
      openDesktopView('techniques')
    } else {
      setAnalysisOpen(true)
    }
  }

  const solutionAction = previewing ? (
    <button onClick={closeSolutionPath} disabled={busy}>
      <ListOrdered size={17} /> Return to puzzle
    </button>
  ) : !draft && (
    <button onClick={() => { void showSolutionPath() }} disabled={busy} aria-label="Open solution panel">
      <ListOrdered size={17} /> Solution
    </button>
  )
  const analysisAction = !draft && !solved && (
    <button onClick={showAnalysis}>
      <ListFilter size={17} /> {TECHNIQUE_FINDER_TITLE}
    </button>
  )
  const chainsAction = desktop && !draft && !solved && !placeholder && (
    <button onClick={showChains}><Link2 size={17} /> Chains</button>
  )
  const hintMenuAction = !draft && !solved && <button onClick={() => { void showHint() }} disabled={busy}>
    <Lightbulb size={17} /> View hint
  </button>
  const commonSolvingMenuItems = <>
    <button onClick={() => { void generateCandidates() }} disabled={busy || solved}
      aria-keyshortcuts={shortcutLabel(shortcuts.generateCandidates)}>
      <PencilLine size={17} /> Generate all candidates
      <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.generateCandidates)}</kbd>
    </button>
    <button aria-pressed={highlightCandidatePairs} disabled={solved} onClick={() => {
      if (sketch.drawing) setChainHighlightDigit(null)
      else setSelectedDigit(null)
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
  const syncMenuStatus = {
    none: '',
    checking: 'Checking cloud save…',
    pending: 'Cloud save pending.',
    saving: 'Saving to the cloud…',
    saved: 'Saved in the cloud.',
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
    {(solutionAction || analysisAction || chainsAction || colorsAction) && <>
      <div className="app-menu-separator" role="separator" />
      {solutionAction}
      {analysisAction}
      {chainsAction}
      {colorsAction}
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
      <p className="puzzle-sync-menu-status" role="status">
        {storageAvailable ? syncMenuStatus : 'Local storage is unavailable.'}
      </p>
    </>}
    <button onClick={() => { setPuzzleMenuOpen(false); setResetOpen(true) }}>
      <RotateCcw size={17} /> Reset puzzle
    </button>
    {!solved && <>
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
      onClickCapture={() => puzzleMenuButtonRef.current?.focus({ preventScroll: true })}>
      {puzzleOptionItems}
    </div>
  )
  const canSelectCell = !game.paused && !mobileResults && !rearranging
  const gridInputMode = placeholder || draft || solved || mobileResults || previewing || (sketch.drawing && chainMasks)
    ? undefined
    : eraseMode ? 'erase' : colorMode || brush !== null ? 'color' : highlightMode ? 'highlight' : pencilActive ? 'pencil' : 'pen'
  const badgeMode = game.paused || rearranging ? undefined : gridInputMode
  const visibleChainAnnotations = !hintAnnotations && !paintingCandidates && sketch.annotations.links?.length ? sketch.annotations : undefined
  const solutionGrid = (
    <Board variantPuzzle={variant?.puzzle} givens={givens} values={previewPosition ? lessonValues(previewPosition) : givens}
      candidates={previewPosition?.candidates} annotations={stepDiagram?.annotations}
      label="Solution preview" showGuides={appearance.showGuides} />
  )
  const livePuzzleStage = previewing ? solutionGrid : completionPanel ? completionPanel
  : sketch.drawing && chainMasks ? (
    <Board variantPuzzle={variant?.puzzle} givens={givens} values={values} position={game.position} errors={errors}
      candidates={chainMasks} annotations={sketch.annotations} label="Sudoku grid for drawing links"
      highlightedDigit={chainHighlightDigit} highlighting={highlighting} highlightCandidateCount={highlightCandidatePairs ? 2 : null}
      showGuides={appearance.showGuides} boardRef={boardRef} onCandidate={sketch.select} onCandidateHover={sketch.hover}
      isLinkTarget={sketch.isLinkTarget}
      selectedCandidate={sketch.pending === null ? undefined : chainCandidate(sketch.pending)} />
  ) : (
    <Board variantPuzzle={variant?.puzzle} givens={game.givens} values={values} position={hintAnnotations ? hintBoardPosition : game.position} errors={errors} candidateLayout={advancedModes.candidateLayout}
      candidates={hintAnnotations && hintDiagram ? hintCandidates : undefined} annotations={hintAnnotations ?? visibleChainAnnotations}
      showAnnotatedCandidates={Boolean(visibleChainAnnotations)}
      candidatePreview={canPreviewCandidates && candidatePreviewCell !== null && selectedDigit !== null
        ? { cell: candidatePreviewCell, digit: selectedDigit, mode: candidateMode } : undefined}
      descriptionId={badgeMode ? modeBadgeId : undefined}
      label={variant ? `${variantName(variant)} Sudoku grid` : undefined}
      showGuides={appearance.showGuides}
      highlighting={hintAnnotations ? { ...highlighting, relatedCells: false, matchingDigits: false, matchingCandidates: false } : highlighting}
      highlightedDigit={mobileResults ? null : selectedDigit} selected={mobileResults ? undefined : selected} active={active}
      pointerFocusedCell={pointerFocusedCell}
      highlightCandidateCount={!hintAnnotations && highlightCandidatePairs ? 2 : null}
      boardRef={boardRef} onCell={canSelectCell && !paintingCandidates ? clickCell : undefined}
      onCellDoubleClick={canSelectCell && !paintingCandidates && !hintAnnotations ? doubleClickCell : undefined}
      onPaintCandidate={paintingCandidates ? colorCandidate : undefined} dragSelect={canSelectCell && (highlightMode || canDragCandidates)}
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
        {showElapsedTime && <p>Your elapsed time is stopped.</p>}
        <Button type="button" variant="primary" onClick={() => {
          roomStore.update(game.id, (current) => setGamePaused(current, false))
        }}><Play size={17} aria-hidden="true" /> Resume puzzle</Button>
      </div>
    </div>
  )
  const puzzlePanel = (
      <div className="puzzle-column">
        <section ref={puzzleCardRef} className="surface puzzle" aria-label={game.title} data-placeholder={Boolean(placeholder) || undefined}
          data-input-mode={gridInputMode}
          data-completion={Boolean(completionPanel) && !previewing || undefined}
          style={{ '--board-font-scale': appearance.gridTextScale } as CSSProperties}>
        {(!draft || placeholder) && <div className="puzzle-metadata" aria-hidden={Boolean(placeholder) || undefined}>
          {difficulty && <span className="puzzle-difficulty">
            <span className="sr-only">Puzzle difficulty </span>{formatPuzzleRating(difficulty, score)}
          </span>}
          {game.generatedWithAuto && <span className="puzzle-auto-mode">Auto</span>}
          {syncWarning && <span className="puzzle-sync-warning" role="status">{syncWarning}</span>}
          {showElapsedTime && <span className="duration-counter" role="timer" aria-label={`Elapsed time ${formatTime(game.elapsed)}${game.paused ? ', paused' : ''}`}>
            {formatTime(game.elapsed)}
          </span>}
        </div>}
        <div className="puzzle-actions">
          {presentationDraft ? (
            <>
              <Button onClick={() => setCancelDraftOpen(true)}><X size={17} /> Cancel</Button>
              <Button variant="primary" className="publish-button" onClick={onPublish}><Check size={17} /> Save puzzle</Button>
            </>
          ) : (
            <>
              {variant && <Button type="button" variant="quiet" className="variant-rules-button" onClick={() => setVariantRulesOpen(true)}
                aria-label={`${variantName(variant)} Sudoku rules`} aria-haspopup="dialog">
                <Info size={16} aria-hidden="true" />{variant.id === 'mixed' ? 'Mixed rules' : variantName(variant)}
              </Button>}
              {solved && !previewing && <Button variant="quiet" className="puzzle-view-toggle" aria-pressed={showSolvedGrid} onClick={() => {
                setSolvedView(showSolvedGrid ? 'results' : 'grid')
              }}>{showSolvedGrid ? 'View results' : 'View grid'}</Button>}
              {timing.showPause && !solved && game.started && !previewing && <IconButton type="button" variant="quiet" className="puzzle-pause-trigger"
                aria-label={game.paused ? 'Resume puzzle' : 'Pause puzzle'} title={game.paused ? 'Resume puzzle' : 'Pause puzzle'}
                aria-pressed={game.paused} onClick={() => {
                  setActionsOpen(false)
                  setPuzzleMenuOpen(false)
                  roomStore.update(game.id, (current) => setGamePaused(current, !current.paused))
                }}>
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
        <div className={`puzzle-stage${previewing ? ' solution-preview' : sketch.drawing || visibleChainAnnotations ? ' chain-sketch' : hintAnnotations ? ' hint-preview' : ''}${colorTarget === 'cell' && brush !== null ? ' cell-coloring' : ''}`}
          onContextMenu={preventControlClickMenu} onPointerUp={finishControlClick}
          onBlur={(event) => {
            const cell = event.target.dataset.cell
            if (cell !== undefined) setPointerFocusedCell((current) => current === Number(cell) ? null : current)
          }}>
          {placeholder ? <div className="puzzle-placeholder-stage">
            <div className="puzzle-grid-reservation" aria-hidden="true" inert>
              <Board givens={givens} values={values} showGuides={appearance.showGuides} />
            </div>
            <div className="puzzle-placeholder-message">{placeholder}</div>
          </div> : !draft && !solved ? (
            <div className="puzzle-play-layers" data-paused={game.paused || undefined}>
              <div className="puzzle-play-layer puzzle-live-layer" aria-hidden={game.paused || undefined} inert={game.paused}>
                {livePuzzleStage}
              </div>
              <div className="puzzle-play-layer puzzle-pause-layer" aria-hidden={!game.paused || undefined} inert={!game.paused}>
                {pausedPuzzleStage}
              </div>
            </div>
          ) : livePuzzleStage}
        </div>
        <PuzzleCollectionCredit game={game} />
        {badgeMode && <ModeBadge mode={badgeMode} descriptionId={modeBadgeId} cardRef={puzzleCardRef}
          position={modeBadgePosition} onPosition={setModeBadgePosition} onCycleMode={() => {
            setColorBrush(null)
            setEraseMode(false)
            setColorMode(false)
            setPencilModifier(false)
            setPencil(badgeMode === 'pen')
            setHighlightMode(badgeMode === 'pencil')
          }} />}
        {presentationDraft && <div className="draft-tip"><PencilLine size={16} /> Enter the givens, then save your puzzle.</div>}
        </section>
      </div>
  )
  const inputPanel = (
      <div className="workspace-controls">
        <Controls mode={mode} pencil={pencilActive} togglePencil={() => {
          setColorBrush(null); setEraseMode(false); setColorMode(false); setHighlightMode(false); setPencil((current) => !current)
        }}
          candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes}
          colorMode={colorMode} colorTarget={colorTarget} setColorTarget={changeColorTarget} toggleColorMode={() => {
            setColorBrush(null); setEraseMode(false); setPencil(false); setHighlightMode(false); setColorMode((current) => !current)
          }}
          onOpenColors={desktop ? showColors : undefined} colorsActive={brush !== null} onSwitchShade={switchColorShade}
          highlightMode={highlightMode} toggleHighlightMode={toggleHighlightMode}
          eraseMode={eraseMode} toggleEraseMode={() => {
            setColorBrush(null); setColorMode(false); setPencil(false); setHighlightMode(false); setSelected([]); setEraseMode((current) => !current)
          }}
          selectedDigit={sketch.drawing ? chainHighlightDigit : colorMode ? selectedColor : selectedDigit} hasCellSelection={selected.length > 0}
          values={values} input={sketch.drawing ? toggleChainHighlight : input} chainDrawing={sketch.drawing}
          undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
          onCheck={presentationDraft || previewing ? undefined : () => { void runCheck() }}
          compact={mobile} actionsButtonRef={actionsMenuButtonRef} actionsOpen={actionsOpen}
          actionsMenu={!mobile && !advancedWorkspace ? desktopActionsMenu : undefined}
          onActions={!presentationDraft && !solved && (mobile || !advancedWorkspace) ? () => {
            setPuzzleMenuOpen(false)
            setActionsOpen((open) => !open)
          } : undefined}
          disabled={disabled || (solved && !showSolvedGrid)} draft={presentationDraft} inputSize={inputSize} panelHeight={panelHeight}
          setPanelHeight={setPanelHeight} beginResize={beginResize} multi={multi} toggleMulti={toggleMulti} />
      </div>
  )
  const advancedHintPanel = hintPanel || (
    <section className="advanced-spoiler-panel" aria-label="Hint">
      <span className="advanced-spoiler-icon" aria-hidden="true"><Lightbulb size={21} /></span>
      <div><h2>Hint</h2><p>Hint contents stay hidden until you choose to reveal them.</p></div>
      <Button variant="primary" disabled={busy || solved || draft || game.paused} onClick={() => { void showHint() }}>
        <Eye size={17} /> {busy && hintRevealed ? 'Finding a hint…' : 'Reveal hint'}
      </Button>
      <Button disabled={busy || solved || draft || game.paused} onClick={() => { void showHint('all') }}>
        <ListFilter size={17} /> Analyze all moves
      </Button>
    </section>
  )
  const solutionPathPanel = solutionPathRevealed && solutionPath ? (
    <SolutionPath state={solutionPath} index={solutionStep}
      cellReferenceStyle={cellReferenceStyle} techniqueDifficulties={techniqueDifficulties}
      onSelect={selectSolutionStep} onRetry={() => { void showSolutionPath(true) }} onClose={closeSolutionPath}
      onReveal={markSolutionVisible} embedded={!advancedWorkspace} />
  ) : (
    <section className="advanced-spoiler-panel" aria-label="Solution">
      <span className="advanced-spoiler-icon" aria-hidden="true"><ListOrdered size={21} /></span>
      <div><h2>Solution</h2><p>The solving steps stay hidden until you choose to reveal them.</p></div>
      <Button variant="primary" disabled={busy || draft || game.paused} onClick={() => { void showSolutionPath() }}>
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
      {advancedWorkspace
        ? <DesktopDockLayout puzzle={puzzlePanel} input={inputPanel} chains={chainsPanel} cellColors={cellColorsPanel}
          hint={advancedHintPanel} solutionPath={solutionPathPanel}
          techniques={!draft
            ? <PuzzleAnalysisContents game={game} onSelectTechnique={showTechniqueHints} />
            : <p className="analysis-empty">Available after starting the puzzle.</p>}
          details={detailsPanel} browser={browserPanel} showLeft={showLeftPanel} showRight={showRightPanel} showBottom={showBottomPanel}
          focusHintRequest={focusHintRequest} focusAnalysisRequest={focusAnalysisRequest}
          focusSolutionRequest={focusSolutionRequest}
          focusChainsRequest={focusChainsRequest}
          focusColorsRequest={focusColorsRequest} onColorsVisibleChange={setDesktopColorsVisible}
          onChainsVisibleChange={setDesktopChainsVisible}
          onSolutionVisibleChange={setDesktopSolutionVisible} />
        : desktop
          ? <><div className="standard-puzzle-stack">
              {puzzlePanel}
              <MotionSurface>{hintPanel}</MotionSurface>
            </div><div className="standard-input-stack" id="standard-digit-input">
              {inputPanel}
              <MotionSurface>{activeDesktopTab && <section className="desktop-insight-panel" aria-label="Puzzle insights">
                <div className="desktop-insight-toolbar">
                  <div ref={insightTabsRef} className="desktop-insight-tabs" role="tablist" aria-label="Puzzle insight tabs"
                    onKeyDown={(event) => {
                      if (openInsightTabs.length < 2 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                      event.preventDefault()
                      const index = openInsightTabs.indexOf(activeDesktopTab)
                      const step = event.key === 'ArrowLeft' ? -1 : 1
                      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? openInsightTabs.length - 1
                        : (index + step + openInsightTabs.length) % openInsightTabs.length
                      const next = openInsightTabs[nextIndex].id
                      openDesktopView(next)
                      event.currentTarget.querySelector<HTMLButtonElement>(`[data-insight-tab="${next}"]`)?.focus()
                    }}>
                    {openInsightTabs.map(({ id, label }) => <button type="button" key={id} role="tab" data-insight-tab={id}
                      id={`desktop-insight-tab-${id}`} aria-controls="desktop-insight-content"
                      aria-selected={activeDesktopTab.id === id} tabIndex={activeDesktopTab.id === id ? 0 : -1}
                      onClick={() => openDesktopView(id)}>{label}</button>)}
                  </div>
                  <IconButton type="button" variant="quiet" className="desktop-insight-close"
                    aria-label={`Close ${activeDesktopTab.label.toLowerCase()} tab`}
                    onClick={() => activeDesktopTab.id === 'solution' ? closeSolutionPath() : closeDesktopView(activeDesktopTab.id)}>
                    <X size={18} aria-hidden="true" />
                  </IconButton>
                </div>
                <div className="desktop-insight-body" id="desktop-insight-content" role="tabpanel"
                  aria-labelledby={`desktop-insight-tab-${activeDesktopTab.id}`}>
                  {activeDesktopTab.id === 'colors' ? cellColorsPanel : activeDesktopTab.id === 'techniques'
                    ? <PuzzleAnalysisContents game={game} onSelectTechnique={showTechniqueHints} />
                    : activeDesktopTab.id === 'chains' ? chainsPanel : solutionPathPanel}
                </div>
              </section>}</MotionSurface>
            </div></>
          : mobileResults ? <div className="mobile-completion-layout mobile-completion">{puzzlePanel}</div>
          : <MobilePanelLayout puzzleId={game.id} rearranging={rearranging} withHint={showMobileHintCard}
            blocked={Boolean(placeholder) || modalOpen || puzzleMenuOpen || actionsOpen || variantRulesOpen || analysisDialogOpen ||
              dialogResult !== null || resetOpen || cancelDraftOpen}
            onRearrangingChange={(active) => {
              setMobileRearranging(active)
              if (!active) return
              const pointerId = candidateDrag.current?.pointerId ?? dragSelection.current?.pointerId
              candidateDrag.current = null
              dragSelection.current = null
              pendingDoubleClickSingle.current = null
              if (pointerId !== undefined && boardRef.current?.hasPointerCapture(pointerId)) boardRef.current.releasePointerCapture(pointerId)
            }}
            panels={{
              puzzle: { title: 'Puzzle', content: puzzlePanel },
              hint: showMobileHintCard ? { title: 'Hint', content: hintPanel || (
                <div className="hint-dock workspace-controls mobile-hint-panel">
                  <HintCard hint={{ title: 'Puzzle hints', text: 'Hints will appear here.' }} onClose={() => {}} />
                </div>
              ) } : undefined,
              input: { title: 'Keypad', content: inputPanel },
            }} />}
      <Modal title="Actions" className="puzzle-actions-sheet" open={mobile && actionsOpen} motionSpeed="overlay"
        onClose={() => setActionsOpen(false)}>{mobileActionsMenu}</Modal>
      {variant && <Modal title={`${variantName(variant)} rules`} open={variantRulesOpen} onClose={() => setVariantRulesOpen(false)}>
        <div className="variant-rules-copy">
          {variantRuleDescriptions(variant.puzzle).map(rule => <p key={rule}>{rule}</p>)}
        </div>
      </Modal>}
      {mobile && solutionPathRevealed && solutionPath && <SolutionDialog
        grid={solutionGrid} explanation={solutionHintCopy} state={solutionPath} index={solutionStep}
        cellReferenceStyle={cellReferenceStyle} techniqueDifficulties={techniqueDifficulties}
        onSelect={selectSolutionStep} onRetry={() => { void showSolutionPath(true) }} onClose={closeSolutionPath}
        onReveal={markSolutionVisible} />}
      {analysisDialogOpen && <PuzzleAnalysis game={game} close={() => setAnalysisOpen(false)} onSelectTechnique={showTechniqueHints} />}
      {dialogResult && <PuzzleCheckResult result={dialogResult} onClose={() => setDialogResult(null)} />}
      <Modal title="Reset puzzle" open={resetOpen} onClose={() => setResetOpen(false)} className="reset-puzzle-dialog">
        <p>{game.timeUntracked ? 'Remove all placed digits, candidates, and colors from this puzzle?'
          : 'Remove all placed digits, candidates, colors, and elapsed time from this puzzle?'}</p>
        <div className="dialog-actions">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => {
            roomStore.update(game.id, restartGame)
            setSelected([])
            setColorBrush(null)
            setSelectedColor(null)
            setSelectedDigit(null)
            setHighlightCandidatePairs(false)
            setHint(null)
            setHintRevealed(false)
            setSolutionPath(null)
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
