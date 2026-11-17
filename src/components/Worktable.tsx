import {
  type CSSProperties, type ReactNode, type Dispatch, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import { ArrowRight, Braces, Check, CheckCheck, Eye, Info, Lightbulb, ListFilter, ListOrdered, LogOut, MoreHorizontal, Pause, PencilLine, Play, Plus, RotateCcw, Share2, X } from 'lucide-react'
import { explainCandidateRecovery, findCandidateRecovery, restoreCandidate, type CandidateRecovery } from '../sudoku/candidate-recovery'
import { chainCandidate, makeChainGraph } from '../sudoku/chains'
import { formatPuzzleRating, SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, replayStep, runEngine, type Candidate, type Deduction, type DeductionAction, type HintChoice } from '../sudoku/engine'
import {
  COLORS, applyDeduction, candidateCount, clearCandidateColors, completeCandidateMasks, conflictsOf, enter, fillEntries,
  formatTime, hintEliminations, isSolved, needsInitialCandidates, onlyCandidate, paintCandidate, redo, replaceCandidates, restartGame, setGamePaused, singleFromCandidates, undo, valuesOf,
  type ColorTarget, type ErrorMode, type Game, type Mode, type Position,
} from '../sudoku/game'
import { cellReference, describeHint, describeHintDigits, describeHintRemovals, HINT_CANDIDATES_ERROR, HINT_ERROR, NO_HINT, moveHintIndex, techniqueLabel, type CellReferenceStyle, type PuzzleHint } from '../sudoku/hints'
import { functionKeyDigit, givenDigitAt, onlyGivensSelected } from '../sudoku/highlighting'
import { hintLocation, lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { lessonRoutes } from '../sudoku/lessons'
import { addAnalysisAssistance, addRatingHints, addSinglesAssistance, hintKey, ratingAttemptFor } from '../sudoku/player-rating'
import type { AdvancedModes, AppearancePreferences, HighlightPreferences, WorkspaceMode } from '../sudoku/preferences'
import { rectangleSelection } from '../sudoku/selection'
import { highlightedDigitShortcut, shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { roomStore } from '../sudoku/storage'
import { markTechniqueSolution, observeTechniqueActions } from '../sudoku/technique-history'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { playerActions } from '../sudoku/technique-progress'
import { variantHintChoice, variantSolutionPath } from '../sudoku/variant-hints'
import { getVariantPlayOrder, playCandidates, variantHintOrder, variantPosition } from '../sudoku/variant-play'
import { VARIANTS, variantHouseMasks } from '../sudoku/variants'
import { Board } from './Board'
import { AdvancedPuzzleBrowser, type PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { CellColorPalette } from './CellColorPalette'
import { ChainsPanel } from './ChainsPanel'
import { CompletedPuzzle, PuzzleDifficulty } from './CompletedPuzzle'
import { Controls } from './Controls'
import { DesktopDockLayout } from './DesktopDockLayout'
import { HintCard } from './HintCard'
import { useMobileLayout } from './mobile-layout'
import { useGridClickAway } from './useGridClickAway'
import { Modal } from './Modal'
import { usePresence } from './Presence'
import { PuzzleCheckResult, validation, type DialogResult } from './PuzzleCheckResult'
import { PuzzleAnalysis, PuzzleAnalysisCard, PuzzleAnalysisContents } from './PuzzleAnalysis'
import { SolutionPath, type SolutionPathState } from './SolutionPath'
import { useChainSketch } from './useChainSketch'

const ANALYSIS_CARD_KEY = 'sudoku-app:v1:techniques-card-open'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}

async function solveSingleValues(variant: Game['variant'], values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  let board = values
  for (let step = 0; step < 81; step++) {
    const legalMasks = variant
      ? await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: variant.puzzle, eliminations,
        entries: [...board].map((digit, cell) => variant.puzzle.givens[cell] === '0' ? digit : '0').join(''),
      } })
      : await runEngine({ type: 'notes', values: board })
    if (!legalMasks) throw new Error('Singles cannot be solved until the grid conflicts are resolved.')
    const masks = displayedCandidates
      ? legalMasks.map((mask, index) => board[index] === '0' ? mask & displayedCandidates[index] : 0)
      : legalMasks
    const single = singleFromCandidates(board, masks, eliminations, variant?.puzzle)
    if (!single) return board
    const [index, digit] = single
    board = board.slice(0, index) + digit + board.slice(index + 1)
  }
  return board
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
      roomStore.update(id, (current) => ({ ...current, elapsed: current.elapsed + seconds }))
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

type HintStage = 'technique' | 'digits' | 'location' | 'explanation'
const nextHintReveal = {
  technique: { stage: 'digits', label: 'Show digits' },
  digits: { stage: 'location', label: 'Show location' },
  location: { stage: 'explanation', label: 'Show explanation' },
} satisfies Record<Exclude<HintStage, 'explanation'>, { stage: HintStage; label: string }>

type HintState = {
  position: HintPosition
  choices: HintChoice[]
  candidates?: number[]
  index: number
  stage: HintStage
  error?: PuzzleHint
  recovery?: CandidateRecovery
  reviewingRemoval?: boolean
}

function matchesHintPosition(game: Game, position: HintPosition) {
  const { center, corner, eliminations } = game.position
  return game.id === position.gameId && center === position.center && corner === position.corner &&
    eliminations === position.eliminations && valuesOf(game) === position.values
}

function isChainStep(step?: Deduction) {
  if (!step) return false
  const { evidence, technique } = step
  return 'chain' in evidence || 'inference' in evidence || 'single-digit-chain' in evidence ||
    ['forcing-chain', 'als-chain', 'sk-loop'].includes(technique)
}

function withRatingHints(game: Game, keys: readonly string[], applied = false, request?: Parameters<typeof addRatingHints>[3]): Game {
  if (!game.ratingAttempt) return game
  const ratingAttempt = addRatingHints(game.ratingAttempt, keys, applied, request)
  return ratingAttempt === game.ratingAttempt ? game : { ...game, ratingAttempt }
}

export function Worktable({
  game, games, placeholder, preferredDifficulty, modalOpen, advancedModes, appearance, highlighting, errorMode, multi, actionsRef, inputSize, panelHeight, setPanelHeight,
  beginResize, toggleMulti, onDifficultyChange, onShare, onPublish, onCancelDraft, onNewPuzzle, onCreatePuzzle, onEditPuzzle, onStopPlaying,
  cellReferenceStyle, workspaceMode, showLeftPanel, showRightPanel, showBottomPanel, onOpenHintPanel, onOpenRightPanel, puzzleBrowserView, setPuzzleBrowserView,
}: {
  game: Game
  games: Game[]
  placeholder?: ReactNode
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
  onNewPuzzle: (step?: 'difficulty') => void
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
  const start = game.givens[40] === '0' ? 40 : Math.max(0, game.givens.indexOf('0'))
  const [active, setActive] = useState(start)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null)
  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [colorTarget, setColorTarget] = useState<ColorTarget>('cell')
  const [colorBrush, setColorBrush] = useState<number | null>(null)
  const [desktopChainsVisible, setDesktopChainsVisible] = useState(false)
  const [highlightCandidatePairs, setHighlightCandidatePairs] = useState(false)
  const [highlightMode, setHighlightMode] = useState(false)
  const [pencil, setPencil] = useState(false)
  const [candidateKind, setCandidateKind] = useState<'center' | 'corner'>('corner')
  const [colorMode, setColorMode] = useState(false)
  const [eraseMode, setEraseMode] = useState(false)
  const [solution, setSolution] = useState<string | null>(null)
  const [dialogResult, setDialogResult] = useState<DialogResult | null>(null)
  const [variantRulesOpen, setVariantRulesOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisCardOpen, setAnalysisCardOpen] = useState(false)
  const [focusAnalysisRequest, setFocusAnalysisRequest] = useState(0)
  const [puzzleMenuOpen, setPuzzleMenuOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [changePuzzleOpen, setChangePuzzleOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [cancelDraftOpen, setCancelDraftOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [notes, setNotes] = useState<{
    values: string; eliminations?: number[]; variant?: Game['variant']; masks: number[] | null; failed?: boolean
  }>()
  useEffect(() => {
    try { setAnalysisCardOpen(localStorage.getItem(ANALYSIS_CARD_KEY) === 'true') }
    catch { /* The card is still usable without persistent storage. */ }
  }, [])

  function setPinnedAnalysis(open: boolean) {
    setAnalysisCardOpen(open)
    try { localStorage.setItem(ANALYSIS_CARD_KEY, String(open)) }
    catch { /* Remember the choice for this session. */ }
  }

  const [hintState, setHint] = useState<HintState | null>(null)
  const [hintRevealed, setHintRevealed] = useState(false)
  const mobile = useMobileLayout()
  const desktop = !mobile
  const [solutionPath, setSolutionPath] = useState<SolutionPathState | null>(null)
  const [solutionPathRevealed, setSolutionPathRevealed] = useState(false)
  const [solutionStep, setSolutionStep] = useState(0)
  const [solutionHintOpen, setSolutionHintOpen] = useState(false)
  const [focusHintRequest, setFocusHintRequest] = useState(0)
  const [focusChainsRequest, setFocusChainsRequest] = useState(0)
  const [solvedView, setSolvedView] = useState<'results' | 'grid' | 'difficulty'>('results')
  const [ratingFailed, setRatingFailed] = useState(false)
  const [singlesCheck, setSinglesCheck] = useState<{ givens: string; variant: Game['variant']; needsMore: boolean }>()
  const anchor = useRef(start)
  const boardRef = useRef<HTMLDivElement>(null)
  const restoreCellFocus = useRef<number | null>(null)
  const puzzlePanelRef = useRef<HTMLDivElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const puzzleMenuPopupRef = useRef<HTMLDivElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileHintPanelRef = useRef<HTMLDivElement>(null)
  const hintReturnFocus = useRef(false)
  const dragSelection = useRef<{ start: number; base: number[]; additive: boolean; moved: boolean } | null>(null)
  const suppressCellClick = useRef(false)
  const pendingDoubleClickSingle = useRef<{ index: number; digit: number; game: Game } | null>(null)
  const pathRequest = useRef(0)
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries])
  const { center, corner, eliminations } = game.position
  const displayedCandidates = useMemo(() => completeCandidateMasks(game), [values, center, corner])
  const hintPosition = useMemo(() => ({ gameId: game.id, values, center, corner, eliminations }),
    [game.id, values, center, corner, eliminations])
  const conflicts = useMemo(() => conflictsOf(values, game.variant?.puzzle), [values, game.variant])
  const draft = game.source === 'draft'
  // A loading draft skips solver effects but reserves the regular play UI.
  const presentationDraft = draft && !placeholder
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencil
    ? advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
    : 'value'
  const solved = isSolved(game)
  const mobileHintOpen = mobile && hintRevealed && !draft && !solved
  const hint = hintState?.position === hintPosition ? hintState : null
  const visibleHint = hintRevealed ? hint : null
  const hintLoading = hintRevealed && busy && !visibleHint
  const hintOpen = mobileHintOpen || hintLoading || visibleHint !== null || solutionHintOpen
  const deduction = visibleHint?.choices[visibleHint.index]
  const hintStage = visibleHint?.stage
  const recovery = visibleHint?.recovery
  const recoveryCell = recovery && cellReference(recovery.cell, cellReferenceStyle, game.difficulty ?? undefined)
  const recoveryLocationVisible = recovery && hintStage !== 'technique'
  const recoveryHistory = visibleHint?.reviewingRemoval && recovery?.movesAgo
    ? recovery.movesAgo === 1 ? 'This candidate disappeared on your last move.'
      : `This candidate disappeared ${recovery.movesAgo} moves ago.`
    : undefined
  const fullHint = hintStage === 'explanation'
  const hintDifficulty = deduction && techniqueDifficulties[deduction.technique]
  const hintCandidates = visibleHint?.candidates
  const locationClue = useMemo(() => deduction && hintStage === 'location'
    ? hintLocation(deduction, cellReferenceStyle, hintDifficulty) : undefined, [deduction, hintStage, cellReferenceStyle, hintDifficulty])
  const hintDiagram = useMemo(() => {
    if (!fullHint || !deduction || !hintCandidates) return undefined
    return lessonDiagram({ deduction, candidates: hintCandidates }, deduction.pattern)
  }, [fullHint, deduction, hintCandidates])
  const hintAnnotations = hintDiagram?.annotations ?? locationClue?.annotations ?? (recoveryLocationVisible
    ? { cells: new Map([[recovery.cell, { fill: 'var(--lesson-pattern-fill)', outline: 'var(--lesson-pattern)', label: 'Check candidates' }]]) }
    : undefined)
  const hintCopy = recovery ? {
    title: HINT_CANDIDATES_ERROR.title,
    text: hintStage === 'technique' ? 'Your placed digits are correct. A required candidate is missing.'
      : [`Check ${recoveryCell}.`, recoveryHistory].filter(Boolean).join(' '),
  } : !deduction ? visibleHint?.error ?? NO_HINT
    : fullHint ? describeHint(deduction, { difficulty: hintDifficulty, cellReferenceStyle })
    : {
      title: techniqueLabel(deduction.technique),
      text: hintStage === 'technique' ? '' : [describeHintDigits(deduction), locationClue?.text].filter(Boolean).join(' '),
    }
  const showResults = solved && solvedView === 'results'
  const showDifficulty = solved && solvedView === 'difficulty'
  const showSolvedGrid = solved && solvedView === 'grid'
  const mobileResults = mobile && (showResults || showDifficulty)
  const { id, givens, difficulty, score, variant, generatedWithAuto } = game
  const needsRating = difficulty === undefined || score === undefined
  const needsAttempt = !solved && !game.ratingAttempt
  const ratingPending = !draft && needsRating && !ratingFailed
  const advancedWorkspace = desktop && workspaceMode === 'advanced'
  const { mounted: desktopActionsMounted, exiting: desktopActionsExiting } = usePresence(desktop && !advancedWorkspace && actionsOpen)
  const { mounted: puzzleMenuMounted, exiting: puzzleMenuExiting } = usePresence(puzzleMenuOpen)
  const previewing = desktop && !draft && solutionPathRevealed && solutionPath !== null
  const disabled = Boolean(placeholder) || previewing || game.paused
  const cellColorsDisabled = draft || disabled || (solved && !showSolvedGrid)
  const chainsVisible = advancedWorkspace && showRightPanel && desktopChainsVisible
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
  const chainMasks = useMemo(() => chainsVisible && !draft && !solved && !previewing && masks
    ? masks.map((mask, index) => mask & ~(eliminations?.[index] ?? 0)) : null,
  [chainsVisible, draft, solved, previewing, masks, eliminations])
  const chainGraph = useMemo(() => chainMasks && makeChainGraph(chainMasks, variant?.puzzle), [chainMasks, variant])
  const sketch = useChainSketch(chainGraph, `${id}:${values}:${eliminations?.join(',') ?? ''}`, Boolean(chainGraph))
  const canPaint = !cellColorsDisabled && advancedWorkspace && showRightPanel
  const brush = canPaint ? colorBrush : null
  const candidateBrush = colorTarget === 'candidate' && !cellColorsDisabled && !sketch.drawing && !hintAnnotations && !mobileHintOpen
    ? colorMode ? selectedColor : brush : null
  const paintingCandidates = candidateBrush !== null
  const trace = solutionPath?.status === 'ready' ? solutionPath.trace : undefined
  const previewPosition = trace?.positions?.[solutionStep]
  const replayedSolutionStep = useMemo(() => trace && replayStep(trace, solutionStep), [trace, solutionStep])
  const stepDiagram = useMemo(() => {
    const step = replayedSolutionStep
    if (!step?.before.candidates || !step.before.pattern) return undefined
    return lessonDiagram({ deduction: step.deduction, candidates: step.before.candidates }, step.before.pattern)
  }, [replayedSolutionStep])
  const chainInspection = previewing && replayedSolutionStep && isChainStep(replayedSolutionStep.deduction)
    ? { deduction: replayedSolutionStep.deduction, links: stepDiagram?.annotations.links ?? [], explanation: stepDiagram?.reason }
    : undefined
  const solutionHintCopy = replayedSolutionStep
    ? describeHint(replayedSolutionStep.deduction, {
      difficulty: techniqueDifficulties[replayedSolutionStep.deduction.technique], cellReferenceStyle,
    })
    : trace && solutionStep === trace.steps.length
      ? { title: 'Final grid', text: 'The solution is complete. The final grid is shown.' }
      : null

  useTimer(game.id, !draft && game.started && !game.paused && !solved && !modalOpen && !puzzleMenuOpen && !actionsOpen && !previewing && dialogResult === null &&
    !resetOpen && !changePuzzleOpen && !cancelDraftOpen && !variantRulesOpen && !analysisOpen)

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
    const nextActive = game.givens[40] === '0' ? 40 : Math.max(0, game.givens.indexOf('0'))
    setActive(nextActive)
    anchor.current = nextActive
    setSelected([])
    setColorBrush(null)
    setSelectedColor(null)
    setHighlightCandidatePairs(false)
    setDialogResult(null)
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    setChangePuzzleOpen(false)
    setResetOpen(false)
    setVariantRulesOpen(false)
    setHint(null)
    setHintRevealed(false)
    hintReturnFocus.current = false
    setSolutionPath(null)
    setSolutionPathRevealed(false)
    setSolutionStep(0)
    setSolutionHintOpen(false)
    setSolvedView('results')
    setRatingFailed(false)
    dragSelection.current = null
    suppressCellClick.current = false
    pathRequest.current++
  }, [game.id, game.source])

  useGridClickAway(boardRef, () => setSelected([]), (target) => Boolean(
    target.closest('.controls, .cell-color-palette, .hint-card, .solution-path, .puzzle-actions-sheet, .desktop-actions-menu')
      && target.closest('button, input, select, textarea, a, [role="separator"]'),
  ))

  useEffect(() => {
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
      const gap = 8
      const left = anchor.left - menu.offsetWidth - gap
      const top = anchor.top + (anchor.height - menu.offsetHeight) / 2
      menu.style.left = `${Math.max(gap, left)}px`
      menu.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - menu.offsetHeight - gap))}px`
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
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
    const rate = variant
      ? getVariantPlayOrder().then((techniqueOrder) => runEngine({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder }))
      : runEngine({ type: 'techniques' }).then(({ defaultOrder }) => runEngine({ type: 'rate', values: givens, techniqueOrder: defaultOrder }))
    void rate.then((rating) => {
      if (!current) return
      const ratedDifficulty = rating.status === 'stalled' ? null : rating.status.solved
      const points = 'score' in rating ? rating.score.points : rating.points
      roomStore.update(id, (latest) => {
        if (latest.givens !== givens || latest.variant !== variant) return latest
        return {
          ...latest,
          difficulty: latest.difficulty === undefined ? ratedDifficulty : latest.difficulty,
          score: latest.score === undefined ? ratedDifficulty === null ? null : points : latest.score,
          ratingAttempt: latest.ratingAttempt ?? (ratedDifficulty && !isSolved(latest)
            ? (() => {
              const attempt = ratingAttemptFor({
                difficulty: ratedDifficulty, points, scoringVersion: rating.scoringVersion, techniqueOrder: rating.techniqueOrder,
              }, latest.generatedWithAuto ? undefined : 'fixed')
              return latest.analysisUsed ? addAnalysisAssistance(attempt) : attempt
            })()
            : undefined),
        }
      })
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

  useEffect(() => {
    if (!sketch.drawing) return
    setColorBrush(null)
    boardRef.current?.querySelector<HTMLElement>('.chain-candidate[tabindex="0"]')?.focus({ preventScroll: true })
  }, [sketch.drawing])

  useLayoutEffect(() => {
    if (paintingCandidates) {
      boardRef.current?.querySelector<HTMLElement>('.paint-candidate[tabindex="0"]')?.focus({ preventScroll: true })
    } else if (restoreCellFocus.current !== null) {
      boardRef.current?.querySelector<HTMLElement>(`[data-cell="${restoreCellFocus.current}"]`)?.focus({ preventScroll: true })
      restoreCellFocus.current = null
    }
  }, [paintingCandidates])

  useEffect(() => {
    setHint(null)
    setHintRevealed(false)
  }, [hintPosition])

  useEffect(() => {
    if (!hintOpen) return
    function closeHint(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape' ||
        (event.target instanceof HTMLElement && event.target.closest('dialog[open]'))) return
      if (solutionHintOpen) setSolutionHintOpen(false)
      else setHintRevealed(false)
    }
    window.addEventListener('keydown', closeHint)
    return () => window.removeEventListener('keydown', closeHint)
  }, [hintOpen, solutionHintOpen])

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
    function finishDragSelection() {
      const drag = dragSelection.current
      if (!drag) return
      dragSelection.current = null
      if (!drag.moved) return
      suppressCellClick.current = true
      window.setTimeout(() => { suppressCellClick.current = false }, 100)
    }

    window.addEventListener('pointerup', finishDragSelection)
    window.addEventListener('pointercancel', finishDragSelection)
    return () => {
      window.removeEventListener('pointerup', finishDragSelection)
      window.removeEventListener('pointercancel', finishDragSelection)
    }
  }, [])

  useEffect(() => {
    if (advancedModes.colorsEnabled) return
    setColorMode(false)
    setSelectedColor(null)
  }, [advancedModes.colorsEnabled])

  useEffect(() => {
    if (!canPaint) setColorBrush(null)
  }, [canPaint])

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

  function edit(transform: (current: Game) => Game) {
    if (disabled) return
    roomStore.update(game.id, transform)
  }

  function enterFromInput(cells: number[], digit: number, inputMode: Mode, allowMultipleValues = false) {
    edit((current) => {
      const origin = current
      const next = enter(origin, cells, inputMode, digit, { allowMultipleValues })
      const actions = playerActions(origin, next, cells, inputMode, digit)
      if (actions.length && !solved) void observeTechniqueActions(origin, actions, 'independent',
        hintEliminations(valuesOf(origin), completeCandidateMasks(origin), origin.position.eliminations))
      return next
    })
  }

  function input(digit: number, inputMode = highlightMode ? 'value' : mode, cells = selected) {
    setColorBrush(null)
    if (inputMode === 'color') {
      if (digit > COLORS.length) return
      if (colorTarget === 'candidate') {
        setHintRevealed(false)
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
      enterFromInput(cells, digit, inputMode, inputMode === 'value')
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
    setColorBrush(null)
    setSelectedColor(null)
  }

  function chooseColor(color: number) {
    if (!canPaint) return
    if (sketch.drawing) sketch.stop()
    if (colorTarget === 'cell' && selected.length) {
      edit((current) => enter(current, selected, 'color', color))
      setColorBrush(null)
      return
    }
    if (colorTarget === 'candidate') setHintRevealed(false)
    setColorMode(false)
    setEraseMode(false)
    setHighlightMode(false)
    setSelectedDigit(null)
    setColorBrush((current) => current === color ? null : color)
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
    edit((current) => paintCandidate(current, candidate, candidateBrush))
  }

  const canDoubleClickSingle = advancedModes.doubleClickSingles && !draft && !solved && !pencil &&
    !highlightMode && !colorMode && !eraseMode && brush === null && selectedDigit === null && !hintAnnotations

  function clickCell(index: number, event: MouseEvent) {
    const doubleClickEligible = canDoubleClickSingle && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
    if (!doubleClickEligible || pendingDoubleClickSingle.current?.index !== index) pendingDoubleClickSingle.current = null
    if (event.detail === 1) {
      const digit = doubleClickEligible
        ? onlyCandidate(game.position.center[index] | game.position.corner[index]) : null
      pendingDoubleClickSingle.current = advancedModes.doubleClickSingles && digit !== null
        ? { index, digit, game } : null
    }
    if (event.detail > 1 && doubleClickEligible && pendingDoubleClickSingle.current) return
    if (highlightMode && suppressCellClick.current) {
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
    if (!givenDigit && !highlightMode && !selected.length && armedInput !== null && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      enterFromInput([index], armedInput, mode)
      return
    }
    if (givenDigit) setSelectedDigit(givenDigit)
    else if (!highlightMode) setSelectedDigit(null)
    if (event.shiftKey && selected.length) setSelected(rectangleSelection(anchor.current, index))
    else {
      anchor.current = index
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
    anchor.current = index
    setSelected([index])
    enterFromInput([index], digit, 'value')
  }

  function startCellDrag(index: number, event: ReactPointerEvent) {
    if (!highlightMode || event.button !== 0) return
    dragSelection.current = {
      start: index,
      base: [...selected],
      additive: multi || event.metaKey || event.ctrlKey,
      moved: false,
    }
  }

  function continueCellDrag(index: number, event: ReactPointerEvent) {
    const drag = dragSelection.current
    if (!highlightMode || !drag || !(event.buttons & 1) || index === drag.start && !drag.moved) return
    event.preventDefault()
    drag.moved = true
    const dragged = rectangleSelection(drag.start, index)
    setActive(index)
    anchor.current = drag.start
    setSelected(drag.additive ? [...new Set([...drag.base, ...dragged])] : dragged)
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target
      if (event.defaultPrevented || game.paused || previewing || (solved && !showSolvedGrid) || modalOpen || puzzleMenuOpen || actionsOpen || dialogResult !== null || resetOpen || changePuzzleOpen || cancelDraftOpen || analysisOpen || event.altKey ||
        (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(target.tagName)))) return
      const key = event.key.toLowerCase()
      const shortcut = event.ctrlKey || event.metaKey
      if (sketch.drawing) {
        if (key === 'escape') sketch.cancel()
        if (shortcut && key === 'z' && !event.shiftKey) {
          event.preventDefault()
          if (sketch.canUndo) sketch.undo()
        }
        return
      }
      const highlightedDigit = highlightedDigitShortcut(event) ?? functionKeyDigit(event.key)
      if (key === 'escape' && (brush !== null || paintingCandidates)) {
        const cell = target instanceof HTMLElement ? target.closest<HTMLElement>('.paint-candidate')?.closest<HTMLElement>('[data-cell]') : null
        if (cell) {
          const index = Number(cell.dataset.cell)
          restoreCellFocus.current = index
          setActive(index)
        }
        setColorBrush(null)
        if (paintingCandidates && colorMode) setSelectedColor(null)
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
        const candidateMode: Mode = advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
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
        if (event.shiftKey) setSelected(rectangleSelection(anchor.current, next))
        else {
          anchor.current = next
          setSelected([next])
        }
        boardRef.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus({ preventScroll: true })
      } else if (!shortcut && /^[1-9]$/.test(key)) {
        event.preventDefault()
        if (colorTarget === 'candidate' && (paintingCandidates || colorMode) && event.repeat) return
        const digit = Number(key)
        if (paintingCandidates && !colorMode) {
          if (digit <= COLORS.length) chooseColor(digit)
        } else input(digit)
      } else if (!shortcut && (key === 'delete' || key === 'backspace' || key === '0')) {
        event.preventDefault()
        if (colorTarget === 'candidate' && (paintingCandidates || colorMode) && event.repeat) return
        if (paintingCandidates && !colorMode) chooseColor(0)
        else input(0)
      } else if (!draft && shortcutMatches(event, shortcuts, 'actions') && !solved && (mobile || !advancedWorkspace)) {
        event.preventDefault()
        setPuzzleMenuOpen(false)
        setActionsOpen(true)
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
        setColorBrush(null)
        setEraseMode(false)
        setPencil(false)
        setColorMode(false)
        setHighlightMode((current) => !current)
      } else if (!draft && shortcutMatches(event, shortcuts, 'colorMode') && advancedModes.colorsEnabled) {
        event.preventDefault()
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
      if (!draft) {
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
      roomStore.update(game.id, (latest) => valuesOf(latest) === values ? replaceCandidates(latest, masks) : latest)
    } catch (error) {
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function solveAllSingles() {
    if (busy || !offerSingles) return
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
        const next = fillEntries(latest, result)
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
    let result: HintState
    const removals = hintEliminations(values, displayedCandidates, eliminations)
    try {
      const { choices, candidates } = variant ? {
        choices: (await runEngine({
          type: 'variant', operation: 'hints', position: { ...variantPosition(variant, game.position), eliminations: removals },
          techniqueOrder: await variantHintOrder(), limit: limit === 'all' ? 0xffff_ffff : limit,
          preferProgress: true, difficulty: game.difficulty ?? 'medium',
        })).map((choice) => variantHintChoice(choice, variant.puzzle)),
        candidates: variantHouseMasks(variant.puzzle, values, removals),
      } : await runEngine({ type: 'hints', values, eliminations: removals, limit, includePatterns: true,
        preferProgress: true, difficulty: game.difficulty ?? 'medium' })
      if (!candidates) throw new Error('Missing hint candidates')
      result = { position: hintPosition, choices, candidates, index: 0, stage: 'technique' }
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
    if (current && matchesHintPosition(current, hintPosition)) setHint(result)
  }

  function moveHint(offset: -1 | 1) {
    setHint((current) => {
      if (!current || !current.choices.length) return current
      const index = moveHintIndex(current.index, current.choices.length, offset)
      return { ...current, index, stage: 'technique' }
    })
  }

  function revealHint() {
    setHint((current) => current && current.stage !== 'explanation'
      ? { ...current, stage: nextHintReveal[current.stage].stage } : current)
  }

  function revealCandidateRecovery() {
    setHint((current) => current?.recovery
      ? { ...current, stage: current.stage === 'technique' ? 'location' : 'explanation' } : current)
  }

  function applyCandidateRecovery() {
    if (!recovery || !visibleHint || !fullHint) return
    edit((current) => matchesHintPosition(current, visibleHint.position) ? restoreCandidate(current, recovery) : current)
    setHint(null)
    setHintRevealed(false)
    if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }

  function applyToCurrentPosition(actions: readonly DeductionAction[], candidates: readonly number[], hintSnapshot?: HintPosition) {
    let applied = false
    edit((current) => {
      const currentPosition = hintSnapshot ? matchesHintPosition(current, hintSnapshot)
        : valuesOf(current) === values && current.position.eliminations === eliminations
      if (!currentPosition) return current
      const next = applyDeduction(current, actions, candidates)
      applied = next !== current
      if (applied && !hintSnapshot) void observeTechniqueActions(current, actions, 'independent',
        hintEliminations(valuesOf(current), completeCandidateMasks(current), current.position.eliminations))
      return applied && hintSnapshot ? withRatingHints(next, [hintKey(actions)], true) : next
    })
    return applied
  }

  function applyChainEdits(actions: readonly DeductionAction[]) {
    if (chainMasks && applyToCurrentPosition(actions, chainMasks)) sketch.stop()
  }

  function applyHint() {
    if (!fullHint || !deduction || !hintCandidates || !visibleHint) return
    applyToCurrentPosition(deduction.actions, hintCandidates, visibleHint.position)
    setHint(null)
    setHintRevealed(false)
    if (!mobile) puzzleMenuButtonRef.current?.focus({ preventScroll: true })
  }

  async function showSolutionPath(force = false) {
    if (!desktop || draft || busy) return
    setPuzzleMenuOpen(false)
    setSolutionPathRevealed(true)
    if (solutionPath && !force) return
    setSolutionStep(0)
    setSolutionPath({ status: 'loading' })
    const request = ++pathRequest.current
    try {
      const result = variant ? variantSolutionPath(await runEngine({
        type: 'variant', operation: 'trace', position: variantPosition(variant), techniqueOrder: await getVariantPlayOrder(),
      })) : await runEngine({ type: 'logical-solve', values: givens, includeStepDetails: true, includeMoveAvailability: true })
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
    puzzleMenuButtonRef.current?.focus({ preventScroll: true })
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
  const reveal = hintStage && hintStage !== 'explanation' ? nextHintReveal[hintStage] : undefined
  const hintAction = solutionHintPanel ? undefined
    : recovery ? fullHint ? { label: 'Restore candidate', onClick: applyCandidateRecovery }
      : { label: hintStage === 'technique' ? 'Show cell' : 'Show explanation', onClick: revealCandidateRecovery }
    : deduction && hintCandidates ? reveal ? { label: reveal.label, onClick: revealHint } : { label: 'Apply hint', onClick: applyHint }
    : undefined
  const explanation = solutionHintPanel ? stepDiagram : hintDiagram
  const revealedDeduction = solutionHintPanel ? replayedSolutionStep?.deduction : fullHint && !recovery ? deduction : undefined
  const recoveryExplanation = !solutionHintPanel && recovery && fullHint
    ? explainCandidateRecovery(game, recovery, cellReferenceStyle) : undefined
  const hintPanel = (solutionHintPanel || visibleHint || hintLoading || mobileHintOpen) && (
    <div className={`hint-dock${mobile ? ' workspace-controls mobile-hint-panel' : ''}`}
      ref={mobile ? mobileHintPanelRef : undefined} aria-live="polite">
      <HintCard hint={solutionHintPanel ? solutionHintCopy
        : hintLoading ? { title: 'Finding a hint…', text: '' } : hintCopy}
        lesson={hintLesson}
        removals={revealedDeduction ? describeHintRemovals(revealedDeduction, {
          difficulty: techniqueDifficulties[revealedDeduction.technique], cellReferenceStyle,
        }) : undefined}
        onClose={() => solutionHintPanel ? setSolutionHintOpen(false) : setHintRevealed(false)}
        onShown={!solutionHintPanel && deduction ? markHintVisible : undefined}
        action={hintAction}
        secondaryAction={!solutionHintPanel && recoveryLocationVisible && recovery.movesAgo
          ? { label: 'Review move', expanded: visibleHint?.reviewingRemoval ?? false,
            onClick: () => setHint((current) => current?.recovery ? { ...current, reviewingRemoval: !current.reviewingRemoval } : current) }
          : undefined}
        explanation={recoveryExplanation ?? (explanation?.description
          ? [explanation.description, ...(explanation.reasonSteps ? [] : [explanation.reason])].filter(Boolean) : undefined)}
        explanationSteps={recoveryExplanation ? undefined : explanation?.reasonSteps}
        collapseExplanation={Boolean(solutionHintPanel)}
        trace={solutionHintPanel ? undefined : hintDiagram?.trace}
        navigation={!solutionHintPanel && visibleHint && visibleHint.choices.length > 0
          ? { index: visibleHint.index, count: visibleHint.choices.length, onMove: moveHint }
          : undefined} />
    </div>
  )
  const cellColorsPanel = (
    <CellColorPalette target={colorTarget} onTarget={changeColorTarget} brush={brush}
      hasColors={colorTarget === 'cell' ? game.position.colors.some(Boolean) : Boolean(game.position.candidateColors)}
      disabled={cellColorsDisabled} onColor={chooseColor} onStop={() => setColorBrush(null)} onClear={clearColors} />
  )
  const chainUnavailable = chainGraph ? undefined
    : previewing ? 'Select a chain step in Solution.'
    : draft || solved ? 'Chains are available while solving.'
    : currentNotes?.failed ? 'Candidates couldn’t load.'
    : currentNotes?.masks === null ? 'Resolve the grid conflicts to draw links.'
    : 'Loading candidates…'
  const chainsPanel = <ChainsPanel sketch={sketch} onApply={applyChainEdits} unavailable={chainUnavailable} inspection={chainInspection} />
  const completionPanel = showResults ? (
    <CompletedPuzzle game={game} games={games} preferredDifficulty={preferredDifficulty}
      ratingPending={ratingPending} shortcutEnabled={!modalOpen && !puzzleMenuOpen && !actionsOpen && !changePuzzleOpen && !cancelDraftOpen && !variantRulesOpen}
      showGuides={appearance.showGuides} onChooseDifficulty={() => {
        if (mobile) onNewPuzzle('difficulty')
        else setSolvedView('difficulty')
      }} onChooseVariant={onNewPuzzle} />
  ) : showDifficulty ? (
    <PuzzleDifficulty value={preferredDifficulty} variant={variant?.id} showGuides={appearance.showGuides}
      onBack={() => setSolvedView('results')} onChange={onDifficultyChange} />
  ) : null
  const solveSinglesAction = <button onClick={() => { void solveAllSingles() }} disabled={busy || !hasSingles}
    aria-keyshortcuts={shortcutLabel(shortcuts.solveSingles)}>
    <CheckCheck size={17} /> Solve all singles <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.solveSingles)}</kbd>
  </button>
  function showAnalysis() {
    setPuzzleMenuOpen(false)
    setActionsOpen(false)
    if (advancedWorkspace) {
      onOpenRightPanel()
      setFocusAnalysisRequest((request) => request + 1)
    } else if (desktop) {
      setPinnedAnalysis(!analysisCardOpen)
    } else {
      setAnalysisOpen(true)
    }
  }

  const analysisAction = !draft && !solved && !variant && (
    <button onClick={showAnalysis} aria-pressed={desktop && !advancedWorkspace ? analysisCardOpen : undefined}>
      <ListFilter size={17} /> {desktop && !advancedWorkspace && analysisCardOpen ? 'Hide available techniques' : 'Available techniques'}
    </button>
  )
  const commonSolvingMenuItems = <>
    <button onClick={() => { void generateCandidates() }} disabled={busy || solved}
      aria-keyshortcuts={shortcutLabel(shortcuts.generateCandidates)}>
      <PencilLine size={17} /> Generate all candidates
      <kbd className="menu-shortcut" aria-hidden="true">{shortcutLabel(shortcuts.generateCandidates)}</kbd>
    </button>
    <button aria-pressed={highlightCandidatePairs} disabled={solved} onClick={() => {
      setSelectedDigit(null)
      setHighlightCandidatePairs((current) => !current)
      setPuzzleMenuOpen(false)
      setActionsOpen(false)
    }}>
      <Braces size={17} /> Highlight {'{x,y}'} cells
    </button>
    <button onClick={() => { void showHint() }} disabled={busy || solved}>
      <Lightbulb size={17} /> View hint
    </button>
  </>
  const puzzleOptionItems = <>
    <button onClick={() => { void runCheck() }} disabled={busy}>
      <Check size={17} /> Check puzzle
    </button>
    {mobile && analysisAction}
    {advancedWorkspace && generatedWithAuto && offerSingles && solveSinglesAction}
    <button onClick={() => { setPuzzleMenuOpen(false); onShare() }}>
      <Share2 size={17} /> Share puzzle
    </button>
    <button onClick={() => { setPuzzleMenuOpen(false); setResetOpen(true) }}>
      <RotateCcw size={17} /> Reset puzzle
    </button>
    <div className="app-menu-separator" role="separator" />
    <button onClick={() => { setPuzzleMenuOpen(false); setChangePuzzleOpen(true) }} disabled={busy}>
      <ArrowRight size={17} /> Change puzzle…
    </button>
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
    <div ref={puzzleMenuPopupRef} className={`app-menu puzzle-menu${mobile ? ' mobile-puzzle-menu' : ''}`} id="puzzle-menu"
      popover={mobile ? 'manual' : undefined} data-presence={puzzleMenuExiting ? 'exit' : 'open'}
      aria-hidden={puzzleMenuExiting || undefined} inert={puzzleMenuExiting || undefined}
      onClickCapture={mobile ? () => puzzleMenuButtonRef.current?.focus({ preventScroll: true }) : undefined}>
      {previewing ? <button onClick={closeSolutionPath} disabled={busy}>
        <ListOrdered size={17} /> Return to puzzle
      </button> : <>
        {puzzleOptionItems}
      </>}
    </div>
  )
  const canSelectCell = !game.paused && !mobileResults
  const livePuzzleStage = previewing ? (
    <Board variantPuzzle={variant?.puzzle} givens={givens} values={previewPosition ? lessonValues(previewPosition) : givens}
      candidates={previewPosition?.candidates} annotations={stepDiagram?.annotations}
      label="Solution preview" showGuides={appearance.showGuides} />
  ) : completionPanel && !mobileResults ? completionPanel
  : sketch.drawing && chainMasks ? (
    <Board variantPuzzle={variant?.puzzle} givens={givens} values={values} position={game.position} errors={errors}
      candidates={chainMasks} annotations={sketch.annotations} label="Sudoku grid for drawing links"
      showGuides={appearance.showGuides} boardRef={boardRef} onCandidate={sketch.select} onCandidateHover={sketch.hover}
      isLinkTarget={sketch.isLinkTarget}
      selectedCandidate={sketch.pending === null ? undefined : chainCandidate(sketch.pending)} />
  ) : (
    <Board variantPuzzle={variant?.puzzle} givens={game.givens} values={values} position={game.position} errors={errors} candidateLayout={advancedModes.candidateLayout}
      candidates={hintDiagram ? hintCandidates : undefined} annotations={hintAnnotations}
      label={variant ? `${VARIANTS[variant.id].name} Sudoku grid` : undefined}
      showGuides={appearance.showGuides}
      highlighting={hintAnnotations ? { ...highlighting, relatedCells: false, matchingDigits: false, matchingCandidates: false } : highlighting}
      highlightedDigit={mobileResults ? null : selectedDigit} selected={mobileResults ? undefined : selected} active={active}
      highlightCandidateCount={!hintAnnotations && highlightCandidatePairs ? 2 : null}
      boardRef={boardRef} onCell={canSelectCell && !paintingCandidates ? clickCell : undefined}
      onCellDoubleClick={canSelectCell && !paintingCandidates && !hintAnnotations ? doubleClickCell : undefined}
      onPaintCandidate={paintingCandidates ? colorCandidate : undefined} dragSelect={canSelectCell && highlightMode}
      onCellPointerDown={canSelectCell && !paintingCandidates ? startCellDrag : undefined}
      onCellPointerMove={canSelectCell && !paintingCandidates ? continueCellDrag : undefined} />
  )
  const pausedPuzzleStage = (
    <div className={`board-frame puzzle-paused-frame ${appearance.showGuides ? '' : 'guides-hidden'}`}>
      <div className="puzzle-paused" role="status" aria-label="Puzzle paused">
        <span className="puzzle-paused-icon" aria-hidden="true"><Pause size={25} /></span>
        <h2>Puzzle paused</h2>
        <p>Your elapsed time is stopped.</p>
        <button type="button" className="button primary" onClick={() => {
          roomStore.update(game.id, (current) => setGamePaused(current, false))
        }}><Play size={17} aria-hidden="true" /> Resume puzzle</button>
      </div>
    </div>
  )
  const puzzlePanel = (
      <div className="puzzle-column" ref={puzzlePanelRef}>
        <section className="surface puzzle" aria-label={game.title} data-placeholder={Boolean(placeholder) || undefined}
          style={{ '--board-font-scale': appearance.gridTextScale } as CSSProperties}>
        {(!draft || placeholder) && <div className="puzzle-metadata" aria-hidden={Boolean(placeholder) || undefined}>
          {difficulty && <span className="puzzle-difficulty">
            <span className="sr-only">Puzzle difficulty </span>{formatPuzzleRating(difficulty, score)}
          </span>}
          {game.generatedWithAuto && <span className="puzzle-auto-mode">Auto</span>}
          <span className="duration-counter" role="timer" aria-label={`Elapsed time ${formatTime(game.elapsed)}${game.paused ? ', paused' : ''}`}>
            {formatTime(game.elapsed)}
          </span>
        </div>}
        <div className="puzzle-actions">
          {presentationDraft ? (
            <>
              <button className="button secondary" onClick={() => setCancelDraftOpen(true)}><X size={17} /> Cancel</button>
              <button className="button primary publish-button" onClick={onPublish}><Check size={17} /> Save puzzle</button>
            </>
          ) : (
            <>
              {variant && <button type="button" className="button soft variant-rules-button" onClick={() => setVariantRulesOpen(true)}
                aria-label={`${VARIANTS[variant.id].name} Sudoku rules`} aria-haspopup="dialog">
                <Info size={16} aria-hidden="true" />{VARIANTS[variant.id].name}
              </button>}
              {solved && !previewing && <button className="button soft puzzle-view-toggle" aria-pressed={showSolvedGrid} onClick={() => {
                setSolvedView(showSolvedGrid ? 'results' : 'grid')
              }}>{showSolvedGrid ? 'View results' : 'View grid'}</button>}
              {!solved && game.started && !previewing && <button type="button" className="icon-button borderless puzzle-pause-trigger"
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
              </button>}
              <div className="puzzle-menu-wrap" ref={puzzleMenuRef}>
                <button ref={puzzleMenuButtonRef} className="icon-button borderless puzzle-menu-trigger" aria-label="Open puzzle options"
                  title="Puzzle options" disabled={Boolean(placeholder)} aria-expanded={puzzleMenuOpen} aria-controls={puzzleMenuOpen ? 'puzzle-menu' : undefined}
                  onClick={(event) => {
                    if (mobile) event.currentTarget.focus({ preventScroll: true })
                    setActionsOpen(false)
                    setPuzzleMenuOpen((open) => !open)
                  }}>
                  <MoreHorizontal size={20} />
                </button>
                {puzzleMenu}
              </div>
            </>
          )}
        </div>
        <div className={`puzzle-stage${previewing ? ' solution-preview' : sketch.drawing ? ' chain-sketch' : hintAnnotations ? ' hint-preview' : ''}${colorTarget === 'cell' && brush !== null ? ' cell-coloring' : ''}`}>
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
        {presentationDraft && <div className="draft-tip"><PencilLine size={16} /> Enter the givens, then save your puzzle.</div>}

        </section>
      </div>
  )
  const inputPanel = (
      <div className="workspace-controls">
        <Controls mode={mode} pencil={pencil} togglePencil={() => {
          setColorBrush(null); setEraseMode(false); setColorMode(false); setHighlightMode(false); setPencil((current) => !current)
        }}
          candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes}
          colorMode={colorMode} colorTarget={colorTarget} setColorTarget={changeColorTarget} toggleColorMode={() => {
            setColorBrush(null); setEraseMode(false); setPencil(false); setHighlightMode(false); setColorMode((current) => !current)
          }}
          highlightMode={highlightMode} toggleHighlightMode={() => {
            setColorBrush(null); setEraseMode(false); setPencil(false); setColorMode(false); setHighlightMode((current) => !current)
          }}
          eraseMode={eraseMode} toggleEraseMode={() => {
            setColorBrush(null); setColorMode(false); setPencil(false); setHighlightMode(false); setSelected([]); setEraseMode((current) => !current)
          }}
          selectedDigit={colorMode ? selectedColor : selectedDigit} hasCellSelection={selected.length > 0}
          values={values} input={input}
          undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
          onCheck={presentationDraft || previewing ? undefined : () => { void runCheck() }}
          compact={mobile} actionsButtonRef={actionsMenuButtonRef} actionsOpen={actionsOpen}
          actionsMenu={!mobile && !advancedWorkspace ? desktopActionsMenu : undefined}
          onActions={!presentationDraft && !solved && (mobile || !advancedWorkspace) ? () => {
            setPuzzleMenuOpen(false)
            setActionsOpen((open) => !open)
          } : undefined}
          disabled={disabled || sketch.drawing || (solved && !showSolvedGrid)} draft={presentationDraft} inputSize={inputSize} panelHeight={panelHeight}
          setPanelHeight={setPanelHeight} beginResize={beginResize} multi={multi} toggleMulti={toggleMulti} />
      </div>
  )
  const solutionPathPanel = previewing ? (
    <SolutionPath state={solutionPath} index={solutionStep}
      onSelect={selectSolutionStep} onRetry={() => { void showSolutionPath(true) }} onClose={closeSolutionPath}
      onReveal={markSolutionVisible} />
  ) : null
  const advancedHintPanel = hintPanel || (
    <section className="advanced-spoiler-panel" aria-label="Hint">
      <span className="advanced-spoiler-icon" aria-hidden="true"><Lightbulb size={21} /></span>
      <div><h2>Hint</h2><p>Hint contents stay hidden until you choose to reveal them.</p></div>
      <button className="button primary" disabled={busy || solved || draft || game.paused} onClick={() => { void showHint() }}>
        <Eye size={17} /> {busy && hintRevealed ? 'Finding a hint…' : 'Reveal hint'}
      </button>
      <button className="button secondary" disabled={busy || solved || draft || game.paused} onClick={() => { void showHint('all') }}>
        <ListFilter size={17} /> Analyze all moves
      </button>
    </section>
  )
  const advancedSolutionPathPanel = solutionPathRevealed && solutionPath ? (
    <SolutionPath state={solutionPath} index={solutionStep}
      onSelect={selectSolutionStep} onRetry={() => { void showSolutionPath(true) }} onClose={closeSolutionPath}
      onReveal={markSolutionVisible} />
  ) : (
    <section className="advanced-spoiler-panel" aria-label="Solution">
      <span className="advanced-spoiler-icon" aria-hidden="true"><ListOrdered size={21} /></span>
      <div><h2>Solution</h2><p>The solving steps stay hidden until you choose to reveal them.</p></div>
      <button className="button primary" disabled={busy || draft || game.paused} onClick={() => { void showSolutionPath() }}>
        <Eye size={17} /> Reveal solution
      </button>
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
        <div><dt>Elapsed time</dt><dd>{formatTime(game.elapsed)}</dd></div>
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
          hint={advancedHintPanel} solutionPath={advancedSolutionPathPanel}
          techniques={!draft && !variant
            ? <PuzzleAnalysisContents game={game} />
            : <p className="analysis-empty">Available for classic Sudoku puzzles.</p>}
          details={detailsPanel} browser={browserPanel} showLeft={showLeftPanel} showRight={showRightPanel} showBottom={showBottomPanel}
          focusHintRequest={focusHintRequest} focusAnalysisRequest={focusAnalysisRequest}
          focusChainsRequest={chainInspection ? focusChainsRequest : 0}
          onChainsVisibleChange={setDesktopChainsVisible} />
        : desktop
          ? <><div className="standard-puzzle-stack">{puzzlePanel}</div><div className="standard-input-stack">
              {inputPanel}
              {!draft && !variant && <div className="desktop-solution-actions" role="group" aria-label="Solution tools">
                <button type="button" className="button secondary" onClick={() => { void showSolutionPath() }}>
                  <ListOrdered size={17} /> Solution
                </button>
                <button type="button" className="button secondary" onClick={showAnalysis}
                  aria-pressed={analysisCardOpen}>
                  <ListFilter size={17} /> Available techniques
                </button>
              </div>}
              {analysisCardOpen && !draft && !variant && <PuzzleAnalysisCard game={game} close={() => setPinnedAnalysis(false)} />}
              {hintPanel}{solutionPathPanel}
            </div></>
          : <>{puzzlePanel}{mobileResults
            ? <div className="workspace-controls mobile-completion">{completionPanel}</div>
            : <div className={`workspace-controls mobile-solving-controls${mobileHintOpen ? ' with-hint' : ''}`}>
              {mobileHintOpen && hintPanel}{inputPanel}
            </div>}</>}
      <Modal title="Actions" className="puzzle-actions-sheet" open={mobile && actionsOpen} exitDuration={240}
        onClose={() => setActionsOpen(false)}>{mobileActionsMenu}</Modal>
      {variant && variantRulesOpen && <Modal title={`${VARIANTS[variant.id].name} rules`} onClose={() => setVariantRulesOpen(false)}>
        <div className="variant-rules-copy">
          {variant.id !== 'jigsaw' && <p>{VARIANTS.classic.rule}</p>}
          <p>{VARIANTS[variant.id].rule}</p>
        </div>
      </Modal>}
      {analysisOpen && mobile && !draft && !solved && !variant && <PuzzleAnalysis game={game} close={() => setAnalysisOpen(false)} />}
      {dialogResult && <PuzzleCheckResult result={dialogResult} onClose={() => setDialogResult(null)} />}
      {changePuzzleOpen && <Modal title="Change puzzle" onClose={() => setChangePuzzleOpen(false)}>
        <div className="stop-puzzle-options">
          <button type="button" className="new-option" disabled={busy} onClick={() => {
            setChangePuzzleOpen(false)
            onNewPuzzle()
          }}>
            <span className="option-icon"><Plus size={20} aria-hidden="true" /></span>
            <span><strong>New puzzle</strong><small>Choose a difficulty and variant before starting.</small></span>
          </button>
          {!solved && <button type="button" className="new-option" disabled={busy} onClick={() => {
            setChangePuzzleOpen(false)
            onStopPlaying()
          }}>
            <span className="option-icon"><LogOut size={20} aria-hidden="true" /></span>
            <span><strong>Stop playing</strong><small>Save this puzzle for later or remove it from Your puzzles.</small></span>
          </button>}
        </div>
      </Modal>}
      {resetOpen && <Modal title="Reset puzzle" onClose={() => setResetOpen(false)} className="reset-puzzle-dialog">
        <p>Remove all placed digits, candidates, colors, and elapsed time from this puzzle?</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setResetOpen(false)}>Cancel</button>
          <button className="button danger" onClick={() => {
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
          }}>Reset puzzle</button>
        </div>
      </Modal>}
      {cancelDraftOpen && <Modal title={game.editingId ? 'Cancel puzzle editing?' : 'Cancel puzzle creation?'}
        onClose={() => setCancelDraftOpen(false)} className="reset-puzzle-dialog">
        <p>{game.editingId
          ? 'Discard your changes and return to the saved puzzle?'
          : 'Discard this draft and return to your previous puzzle?'}</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setCancelDraftOpen(false)}>Keep editing</button>
          <button className="button danger" onClick={onCancelDraft}>{game.editingId ? 'Discard changes' : 'Discard draft'}</button>
        </div>
      </Modal>}
    </>
  )
}
