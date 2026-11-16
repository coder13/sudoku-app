import {
  type CSSProperties, type Dispatch, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { ArrowRight, Braces, Check, CheckCheck, Eye, Info, Lightbulb, ListFilter, ListOrdered, LogOut, MoreHorizontal, PencilLine, RotateCcw, Share2, X } from 'lucide-react'
import { chainCandidate, makeChainGraph } from '../sudoku/chains'
import { DIFFICULTY_LABELS, formatPuzzleRating, type DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, replayStep, runEngine, type Candidate, type Deduction, type DeductionAction, type HintChoice } from '../sudoku/engine'
import {
  COLORS, applyDeduction, candidateCount, clearCandidateColors, completeCandidateMasks, conflictsOf, enter, fillEntries,
  formatTime, hintEliminations, isSolved, needsInitialCandidates, paintCandidate, redo, replaceCandidates, restartGame, singleFromCandidates, undo, valuesOf,
  type ColorTarget, type ErrorMode, type Game, type Mode, type Position,
} from '../sudoku/game'
import { describeHint, HINT_CANDIDATES_ERROR, HINT_ERROR, NO_HINT, type CellReferenceStyle, type PuzzleHint } from '../sudoku/hints'
import { functionKeyDigit, givenDigitAt, onlyGivensSelected } from '../sudoku/highlighting'
import { lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { addRatingHints, hintKey, placementHintKey, qualifiesForRating } from '../sudoku/player-rating'
import type { AdvancedModes, AppearancePreferences, HighlightPreferences, WorkspaceMode } from '../sudoku/preferences'
import { rectangleSelection } from '../sudoku/selection'
import { roomStore } from '../sudoku/storage'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
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
import { Modal } from './Modal'
import { PuzzleCheckResult, validation, type DialogResult } from './PuzzleCheckResult'
import { SolutionPath, type SolutionPathState } from './SolutionPath'
import { useChainSketch } from './useChainSketch'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}

async function solveSingleValues(game: Game, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  let board = values
  for (let step = 0; step < 81; step++) {
    const legalMasks = game.variant
      ? await playCandidates({ ...game, position: {
        ...game.position, entries: [...board].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join(''),
      } })
      : await runEngine({ type: 'notes', values: board })
    if (!legalMasks) throw new Error('Singles cannot be solved until the grid conflicts are resolved.')
    const masks = displayedCandidates
      ? legalMasks.map((mask, index) => board[index] === '0' ? mask & displayedCandidates[index] : 0)
      : legalMasks
    const single = singleFromCandidates(board, masks, eliminations, game.variant?.puzzle)
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

type HintState = {
  position: HintPosition
  choices: HintChoice[]
  candidates?: number[]
  index: number
  error?: PuzzleHint
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

function withRatingHints(game: Game, keys: readonly string[], applied = false): Game {
  if (!game.ratingAttempt) return game
  const ratingAttempt = addRatingHints(game.ratingAttempt, keys, applied)
  return ratingAttempt === game.ratingAttempt ? game : { ...game, ratingAttempt }
}

export function Worktable({
  game, games, preferredDifficulty, modalOpen, advancedModes, appearance, highlighting, errorMode, multi, actionsRef, inputSize, panelHeight, setPanelHeight,
  beginResize, toggleMulti, onDifficultyChange, onShare, onPublish, onCancelDraft, onNewPuzzle, onCreatePuzzle, onEditPuzzle, onStopPlaying,
  cellReferenceStyle, workspaceMode, showLeftPanel, showRightPanel, showBottomPanel, puzzleBrowserView, setPuzzleBrowserView,
}: {
  game: Game
  games: Game[]
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
  onNewPuzzle: () => void
  onCreatePuzzle: () => void
  onEditPuzzle: () => void
  showLeftPanel: boolean
  showRightPanel: boolean
  showBottomPanel: boolean
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
  const [puzzleMenuOpen, setPuzzleMenuOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [tooHardOpen, setTooHardOpen] = useState(false)
  const nextAuto = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const [cancelDraftOpen, setCancelDraftOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<{
    values: string; eliminations?: number[]; variant?: Game['variant']; masks: number[] | null; failed?: boolean
  }>()
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
  const anchor = useRef(start)
  const boardRef = useRef<HTMLDivElement>(null)
  const restoreCellFocus = useRef<number | null>(null)
  const puzzlePanelRef = useRef<HTMLDivElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const hintButtonRef = useRef<HTMLButtonElement>(null)
  const mobileHintPanelRef = useRef<HTMLDivElement>(null)
  const hintReturnFocus = useRef<'hint' | 'actions' | null>(null)
  const dragSelection = useRef<{ start: number; base: number[]; additive: boolean; moved: boolean } | null>(null)
  const suppressCellClick = useRef(false)
  const pathRequest = useRef(0)
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries])
  const { center, corner, eliminations } = game.position
  const displayedCandidates = useMemo(() => completeCandidateMasks(game), [values, center, corner])
  const hintPosition = useMemo(() => ({ gameId: game.id, values, center, corner, eliminations }),
    [game.id, values, center, corner, eliminations])
  const conflicts = useMemo(() => conflictsOf(values, game.variant?.puzzle), [values, game.variant])
  const draft = game.source === 'draft'
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencil
    ? advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
    : 'value'
  const solved = isSolved(game)
  const mobileHintOpen = mobile && hintRevealed && !draft && !solved
  const hint = hintState?.position === hintPosition ? hintState : null
  const visibleHint = hintRevealed ? hint : null
  const hintOpen = mobileHintOpen || visibleHint !== null || solutionHintOpen
  const deduction = visibleHint?.choices[visibleHint.index]
  const hintCopy = deduction
    ? describeHint(deduction, { difficulty: techniqueDifficulties[deduction.technique], cellReferenceStyle })
    : visibleHint?.error ?? NO_HINT
  const hintCandidates = visibleHint?.candidates
  const hintDiagram = useMemo(() => {
    if (!deduction || !hintCandidates) return undefined
    return lessonDiagram({ deduction, candidates: hintCandidates }, deduction.pattern)
  }, [deduction, hintCandidates])
  const showResults = solved && solvedView === 'results'
  const showDifficulty = solved && solvedView === 'difficulty'
  const showSolvedGrid = solved && solvedView === 'grid'
  const mobileResults = mobile && (showResults || showDifficulty)
  const { id, givens, difficulty, score, variant } = game
  const canSkipRatedAttempt = !solved && game.ratingAttempt && !game.ratingAttempt.outcome &&
    qualifiesForRating(game.ratingAttempt.grade.difficulty, recommended)
  const ratingPending = !draft && (difficulty === undefined || score === undefined) && !ratingFailed
  const advancedWorkspace = desktop && workspaceMode === 'advanced'
  const previewing = desktop && !draft && solutionPathRevealed && solutionPath !== null
  const disabled = previewing
  const cellColorsDisabled = draft || disabled || (solved && !showSolvedGrid)
  const chainsVisible = advancedWorkspace && showRightPanel && desktopChainsVisible
  const variantEliminations = variant && eliminations
  const currentNotes = notes?.values === values && notes.variant === variant && notes.eliminations === variantEliminations ? notes : undefined
  const masks = currentNotes?.masks
  const autoGenerateCandidates = advancedModes.autoGenerateCandidates && !draft && !solved && needsInitialCandidates(game)
  const hasSingles = useMemo(() => !draft && !solved && Boolean(masks &&
    singleFromCandidates(values, displayedCandidates ?? masks, eliminations, variant?.puzzle)),
    [draft, solved, masks, values, displayedCandidates, eliminations, variant])
  const chainMasks = useMemo(() => chainsVisible && !draft && !solved && !previewing && masks
    ? masks.map((mask, index) => mask & ~(eliminations?.[index] ?? 0)) : null,
  [chainsVisible, draft, solved, previewing, masks, eliminations])
  const chainGraph = useMemo(() => chainMasks && makeChainGraph(chainMasks, variant?.puzzle), [chainMasks, variant])
  const sketch = useChainSketch(chainGraph, `${id}:${values}:${eliminations?.join(',') ?? ''}`, Boolean(chainGraph))
  const canPaint = !cellColorsDisabled && advancedWorkspace && showRightPanel
  const brush = canPaint ? colorBrush : null
  const candidateBrush = colorTarget === 'candidate' && !cellColorsDisabled && !sketch.drawing && !hintDiagram && !mobileHintOpen
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

  useTimer(game.id, !draft && game.started && !solved && !modalOpen && !puzzleMenuOpen && !previewing && dialogResult === null &&
    !resetOpen && !cancelDraftOpen && !tooHardOpen && !variantRulesOpen)

  useLayoutEffect(() => {
    if (!deduction || previewing || solved) return
    roomStore.update(id, (current) => {
      if (!matchesHintPosition(current, hintPosition)) return current
      return withRatingHints(current, [hintKey(deduction.actions)])
    })
  }, [deduction, hintPosition, id, previewing, solved])

  const markSolutionVisible = useCallback(() => roomStore.finishRatingAttempt(id, 'solution'), [id])

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
    setResetOpen(false)
    setTooHardOpen(false)
    setVariantRulesOpen(false)
    setHint(null)
    setHintRevealed(false)
    hintReturnFocus.current = null
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

  useEffect(() => {
    function clearSelectionOutsideGrid(event: globalThis.PointerEvent) {
      const target = event.target
      const puzzleArea = puzzlePanelRef.current
      const clickArea = puzzleArea?.closest('.dv-groupview') ?? puzzleArea
      if (!(target instanceof Node) || !clickArea?.contains(target) || boardRef.current?.contains(target)) return
      setSelected([])
    }
    document.addEventListener('pointerdown', clearSelectionOutsideGrid)
    return () => document.removeEventListener('pointerdown', clearSelectionOutsideGrid)
  }, [])

  useEffect(() => {
    if (!mobile) return
    pathRequest.current++
    setSolutionPath(null)
    setSolutionPathRevealed(false)
    setSolutionHintOpen(false)
  }, [mobile])

  useEffect(() => {
    setSolutionPath(null)
    setSolutionPathRevealed(false)
    setSolutionHintOpen(false)
    return () => { pathRequest.current++ }
  }, [game.id, givens])

  useEffect(() => {
    if (draft || (difficulty !== undefined && score !== undefined)) return
    let current = true
    const rate = variant
      ? getVariantPlayOrder().then((techniqueOrder) => runEngine({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder }))
        .then(({ points, status }) => ({ points, status }))
      : runEngine({ type: 'rate', values: givens }).then(({ score, status }) => ({ points: score.points, status }))
    void rate.then(({ points, status }) => {
      if (!current) return
      const ratedDifficulty = status === 'stalled' ? null : status.solved
      const ratedScore = status === 'stalled' ? null : points
      roomStore.update(id, (latest) => {
        if (latest.givens !== givens || (latest.difficulty !== undefined && latest.score !== undefined)) return latest
        return {
          ...latest,
          difficulty: latest.difficulty === undefined ? ratedDifficulty : latest.difficulty,
          score: latest.score === undefined ? ratedScore : latest.score,
        }
      })
    }).catch(() => {
      if (current) setRatingFailed(true)
    })
    return () => { current = false }
  }, [id, givens, draft, difficulty, score, variant])

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
      if (event.key !== 'Escape' || (event.target instanceof HTMLElement && event.target.closest('dialog[open]'))) return
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
      const trigger = hintReturnFocus.current === 'hint' ? hintButtonRef.current : puzzleMenuButtonRef.current
      if (!solved) trigger?.focus({ preventScroll: true })
      hintReturnFocus.current = null
    }
  }, [mobileHintOpen, solved])

  useEffect(() => {
    if (!solved) setSolvedView('results')
    else if (showSolvedGrid) boardRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true })
  }, [solved, showSolvedGrid])

  useEffect(() => {
    if (!puzzleMenuOpen || mobile) return

    function handlePointerDown(event: PointerEvent) {
      if (!puzzleMenuRef.current?.contains(event.target as Node)) setPuzzleMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setPuzzleMenuOpen(false)
      puzzleMenuButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobile, puzzleMenuOpen])

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

  function input(digit: number, inputMode = highlightMode ? 'value' : mode) {
    setColorBrush(null)
    if (inputMode === 'color') {
      if (digit > COLORS.length) return
      if (colorTarget === 'candidate') {
        setHintRevealed(false)
        setSelectedColor((current) => current === digit ? null : digit)
        return
      }
      if (digit > 0) setEraseMode(false)
      if (!selected.length) {
        setSelectedColor((current) => digit === 0 || current === digit ? null : digit)
        return
      }
      edit((current) => enter(current, selected, inputMode, digit))
      return
    }
    if (digit > 0) setEraseMode(false)
    if (highlightMode && selected.length) {
      if (inputMode === 'value' && digit > 0 && onlyGivensSelected(game.givens, selected)) {
        setSelected([])
        setHighlightCandidatePairs(false)
        setSelectedDigit(digit)
        return
      }
      edit((current) => enter(current, selected, inputMode, digit, { allowMultipleValues: inputMode === 'value' }))
      return
    }
    if (highlightMode && inputMode !== 'value') return
    if (!selected.length) {
      setHighlightCandidatePairs(false)
      setSelectedDigit((current) => digit === 0 || current === digit ? null : digit)
      return
    }
    edit((current) => enter(current, selected, inputMode, digit))
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

  function clickCell(index: number, event: MouseEvent) {
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
      edit((current) => enter(current, [index], mode, armedInput))
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
      if (event.defaultPrevented || previewing || mobileHintOpen || (solved && !showSolvedGrid) || modalOpen || puzzleMenuOpen || dialogResult !== null || resetOpen || cancelDraftOpen || event.altKey ||
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
      const highlightedDigit = functionKeyDigit(event.key)
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
      } else if (!draft && shortcut && !event.shiftKey && /^[1-9]$/.test(key) &&
        selected.some((cell) => values[cell] === '0')) {
        event.preventDefault()
        if (event.repeat) return
        const candidateMode: Mode = advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
        input(Number(key), candidateMode)
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
      } else if (!draft && !shortcut && key === 'n') {
        event.preventDefault()
        setColorBrush(null)
        setEraseMode(false)
        setPencil(false)
        setColorMode(false)
        setHighlightMode(false)
      } else if (!draft && !shortcut && (key === 'c' || key === 'p')) {
        event.preventDefault()
        setColorBrush(null)
        setEraseMode(false)
        setColorMode(false)
        setHighlightMode(false)
        setPencil((current) => !current)
      } else if (!draft && !shortcut && key === 'h') {
        event.preventDefault()
        setColorBrush(null)
        setEraseMode(false)
        setPencil(false)
        setColorMode(false)
        setHighlightMode((current) => !current)
      } else if (!draft && !shortcut && key === 'b' && advancedModes.colorsEnabled) {
        event.preventDefault()
        setColorBrush(null)
        setEraseMode(false)
        setPencil(false)
        setHighlightMode(false)
        setColorMode((current) => !current)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  async function runCheck() {
    if (busy) return
    setPuzzleMenuOpen(false)
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
    if (busy) return
    setPuzzleMenuOpen(false)
    setBusy(true)
    try {
      const result = await solveSingleValues(game, values, eliminations, displayedCandidates ?? undefined)
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values || current.position.eliminations !== eliminations) return
      if (result === values) {
        setDialogResult({ title: 'Puzzle action', text: 'There are no singles to solve right now.', tone: 'neutral' })
        return
      }
      roomStore.update(game.id, (latest) => {
        if (valuesOf(latest) !== values || latest.position.eliminations !== eliminations) return latest
        const keys = [...result].flatMap((digit, cell) => digit !== '0' && values[cell] !== digit ? [placementHintKey(cell, digit)] : [])
        return withRatingHints(fillEntries(latest, result), keys, true)
      })
    } catch (error) {
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function showHint(limit: 10 | 'all' = 10, source: 'hint' | 'actions' = 'actions') {
    if (busy || solved) return
    if (sketch.drawing) sketch.stop()
    if (mobile) {
      hintReturnFocus.current = source
      setHint(null)
    }
    setPuzzleMenuOpen(false)
    setHintRevealed(true)
    setBusy(true)
    let result: HintState
    try {
      const removals = hintEliminations(values, displayedCandidates, eliminations)
      const { choices, candidates } = variant ? {
        choices: (await runEngine({
          type: 'variant', operation: 'hints', position: { ...variantPosition(variant, game.position), eliminations: removals },
          techniqueOrder: await variantHintOrder(), limit: limit === 'all' ? 0xffff_ffff : limit,
        })).map((choice) => variantHintChoice(choice, variant.puzzle)),
        candidates: variantHouseMasks(variant.puzzle, values, removals),
      } : await runEngine({ type: 'hints', values, eliminations: removals, limit, includePatterns: true })
      if (!candidates) throw new Error('Missing hint candidates')
      result = { position: hintPosition, choices, candidates, index: 0 }
    } catch (error) {
      const incorrectCandidates = error instanceof EngineError && (error.code === 'invalid-eliminations' ||
        (error.code === 'unsolvable' && variant && [...values].every((digit, cell) => digit === '0' || digit === variant.solution[cell])))
      const copy = incorrectCandidates ? HINT_CANDIDATES_ERROR : HINT_ERROR
      result = { position: hintPosition, choices: [], index: 0, error: copy }
    } finally {
      setBusy(false)
    }
    const current = roomStore.getSnapshot().games.find((item) => item.id === id)
    if (current && matchesHintPosition(current, hintPosition)) setHint(result)
  }

  function moveHint(offset: -1 | 1) {
    setHint((current) => {
      if (!current) return current
      const index = current.index + offset
      if (index < 0 || index >= current.choices.length) return current
      return { ...current, index }
    })
  }

  function applyToCurrentPosition(actions: readonly DeductionAction[], candidates: readonly number[], hintSnapshot?: HintPosition) {
    let applied = false
    edit((current) => {
      const currentPosition = hintSnapshot ? matchesHintPosition(current, hintSnapshot)
        : valuesOf(current) === values && current.position.eliminations === eliminations
      if (!currentPosition) return current
      const next = applyDeduction(current, actions, candidates)
      applied = next !== current
      return applied && hintSnapshot ? withRatingHints(next, [hintKey(actions)], true) : next
    })
    return applied
  }

  function applyChainEdits(actions: readonly DeductionAction[]) {
    if (chainMasks && applyToCurrentPosition(actions, chainMasks)) sketch.stop()
  }

  function applyHint() {
    if (!deduction || !hintCandidates || !visibleHint) return
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
    actionsRef.current = previewing || (solved && !showSolvedGrid) ? null : { check: () => { void runCheck() } }
    return () => { actionsRef.current = null }
  })

  const solutionHintPanel = previewing && solutionHintOpen && solutionHintCopy
  const explanation = solutionHintPanel ? stepDiagram : hintDiagram
  const hintPanel = (solutionHintPanel || visibleHint || mobileHintOpen) && (
    <div className={`hint-dock${mobile ? ' workspace-controls mobile-hint-panel' : ''}`}
      ref={mobile ? mobileHintPanelRef : undefined} aria-live="polite">
      <HintCard hint={solutionHintPanel ? solutionHintCopy
        : mobileHintOpen && !visibleHint ? { title: 'Finding a hint…', text: '' } : hintCopy}
        onClose={() => solutionHintPanel ? setSolutionHintOpen(false) : setHintRevealed(false)}
        onApply={!solutionHintPanel && deduction && hintCandidates ? applyHint : undefined}
        explanation={explanation?.description ? [explanation.description, explanation.reason].filter(Boolean).join(' ') : undefined}
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
      ratingPending={ratingPending} shortcutEnabled={!modalOpen && !puzzleMenuOpen && !cancelDraftOpen && !tooHardOpen && !variantRulesOpen}
      showGuides={appearance.showGuides} onChooseDifficulty={() => setSolvedView('difficulty')} onChooseVariant={onNewPuzzle} />
  ) : showDifficulty ? (
    <PuzzleDifficulty value={preferredDifficulty} variant={variant?.id} showGuides={appearance.showGuides}
      onBack={() => setSolvedView('results')} onChange={onDifficultyChange} />
  ) : null
  const puzzleMenu = puzzleMenuOpen && (
    <div className="app-menu puzzle-menu" id="puzzle-menu">
      {previewing ? <button onClick={closeSolutionPath} disabled={busy}>
        <ListOrdered size={17} /> Return to puzzle
      </button> : <>
        <button onClick={() => { void generateCandidates() }} disabled={busy || solved}>
          <PencilLine size={17} /> Generate all candidates
        </button>
        <button onClick={() => { void solveAllSingles() }} disabled={busy || solved || !hasSingles}>
          <CheckCheck size={17} /> Solve all singles
        </button>
        <button aria-pressed={highlightCandidatePairs} disabled={solved} onClick={() => {
          setSelectedDigit(null)
          setHighlightCandidatePairs((current) => !current)
          setPuzzleMenuOpen(false)
        }}>
          <Braces size={17} /> Highlight {'{x,y}'} cells
        </button>
        <div className="app-menu-separator" />
        <button onClick={() => { void showHint() }} disabled={busy || solved}>
          <Lightbulb size={17} /> View hint
        </button>
        <button onClick={() => { void showHint('all') }} disabled={busy || solved}>
          <ListFilter size={17} /> Analyze all moves
        </button>
        {desktop && <button onClick={() => { void showSolutionPath() }} disabled={busy}>
          <ListOrdered size={17} /> Show solution
        </button>}
        {canSkipRatedAttempt && <button disabled={busy} onClick={() => {
          setPuzzleMenuOpen(false)
          roomStore.finishRatingAttempt(game.id, 'too-hard')
          setTooHardOpen(true)
        }}><ArrowRight size={17} /> Too hard</button>}
        <div className="app-menu-separator" />
        <button onClick={() => { setPuzzleMenuOpen(false); onShare() }}>
          <Share2 size={17} /> Share puzzle
        </button>
        <button onClick={() => { void runCheck() }} disabled={busy}>
          <Check size={17} /> Check puzzle
        </button>
        <button onClick={() => { setPuzzleMenuOpen(false); setResetOpen(true) }}>
          <RotateCcw size={17} /> Reset puzzle
        </button>
        {!solved && <button onClick={() => { setPuzzleMenuOpen(false); onStopPlaying() }} disabled={busy}>
          <LogOut size={17} /> Stop playing…
        </button>}
      </>}
    </div>
  )
  const canSelectCell = !mobileResults && !mobileHintOpen
  const puzzlePanel = (
      <div className="puzzle-column" ref={puzzlePanelRef}>
        <section className="surface puzzle" aria-label={game.title}
          style={{ '--board-font-scale': appearance.gridTextScale } as CSSProperties}>
        <div className="puzzle-actions">
          {draft ? (
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
              <div className="puzzle-menu-wrap" ref={puzzleMenuRef}>
                <button ref={puzzleMenuButtonRef} className="icon-button borderless puzzle-menu-trigger" aria-label="Open puzzle actions"
                  title="Puzzle actions" aria-expanded={puzzleMenuOpen} aria-controls={puzzleMenuOpen ? 'puzzle-menu' : undefined}
                  aria-haspopup={mobile ? 'dialog' : undefined}
                  onClick={(event) => {
                    if (mobile) event.currentTarget.focus({ preventScroll: true })
                    setPuzzleMenuOpen((open) => !open)
                  }}>
                  <MoreHorizontal size={20} />
                </button>
                {!mobile && puzzleMenu}
              </div>
            </>
          )}
        </div>
        <div className={`puzzle-stage${previewing ? ' solution-preview' : sketch.drawing ? ' chain-sketch' : hintDiagram ? ' hint-preview' : ''}${colorTarget === 'cell' && brush !== null ? ' cell-coloring' : ''}`}>
          {previewing ? (
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
              candidates={hintDiagram ? hintCandidates : undefined} annotations={hintDiagram?.annotations}
              label={variant ? `${VARIANTS[variant.id].name} Sudoku grid` : undefined}
              showGuides={appearance.showGuides}
              highlighting={hintDiagram ? { ...highlighting, relatedCells: false, matchingDigits: false, matchingCandidates: false } : highlighting}
              highlightedDigit={mobileResults ? null : selectedDigit} selected={mobileResults ? undefined : selected} active={active}
              highlightCandidateCount={!hintDiagram && highlightCandidatePairs ? 2 : null}
              boardRef={boardRef} onCell={canSelectCell && !paintingCandidates ? clickCell : undefined}
              onPaintCandidate={paintingCandidates ? colorCandidate : undefined} dragSelect={canSelectCell && highlightMode}
              onCellPointerDown={canSelectCell && !paintingCandidates ? startCellDrag : undefined}
              onCellPointerMove={canSelectCell && !paintingCandidates ? continueCellDrag : undefined} />
          )}
        </div>
        {draft && <div className="draft-tip"><PencilLine size={16} /> Enter the givens, then save your puzzle.</div>}
        {!draft && <div className="puzzle-footer">
          {difficulty && <span className="puzzle-difficulty">
            <span className="sr-only">Puzzle difficulty </span>{formatPuzzleRating(difficulty, score)}
          </span>}
          {game.generatedWithAuto && <span className="puzzle-auto-mode">Auto</span>}
          <span className="duration-counter" role="timer" aria-label={`Elapsed time ${formatTime(game.elapsed)}`}>
            {formatTime(game.elapsed)}
          </span>
        </div>}
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
          onCheck={draft || previewing ? undefined : () => { void runCheck() }}
          compact={mobile} hintButtonRef={hintButtonRef} hintDisabled={busy}
          onHint={mobile && !draft && !solved ? () => { void showHint(10, 'hint') } : undefined}
          disabled={disabled || sketch.drawing || (solved && !showSolvedGrid)} draft={draft} inputSize={inputSize} panelHeight={panelHeight}
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
      <button className="button primary" disabled={busy || solved || draft} onClick={() => { void showHint() }}>
        <Eye size={17} /> {busy && hintRevealed ? 'Finding a hint…' : 'Reveal hint'}
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
      <button className="button primary" disabled={busy || draft} onClick={() => { void showSolutionPath() }}>
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
        <div><dt>Status</dt><dd>{solved ? 'Solved' : game.started ? 'In progress' : 'Not started'}</dd></div>
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
          details={detailsPanel} browser={browserPanel} showLeft={showLeftPanel} showRight={showRightPanel} showBottom={showBottomPanel}
          focusHintRequest={focusHintRequest} focusChainsRequest={chainInspection ? focusChainsRequest : 0}
          onChainsVisibleChange={setDesktopChainsVisible} />
        : desktop
          ? <><div className="standard-puzzle-stack">{puzzlePanel}{hintPanel}</div><div className="standard-input-stack">{inputPanel}{solutionPathPanel}</div></>
          : <>{puzzlePanel}{mobileResults
            ? <div className="workspace-controls mobile-completion">{completionPanel}</div>
            : mobileHintOpen ? hintPanel : inputPanel}</>}
      {mobile && puzzleMenu && <Modal title="Puzzle actions" className="puzzle-actions-sheet"
        onClose={() => setPuzzleMenuOpen(false)}>{puzzleMenu}</Modal>}
      {variant && variantRulesOpen && <Modal title={`${VARIANTS[variant.id].name} rules`} onClose={() => setVariantRulesOpen(false)}>
        <div className="variant-rules-copy">
          {variant.id !== 'jigsaw' && <p>{VARIANTS.classic.rule}</p>}
          <p>{VARIANTS[variant.id].rule}</p>
        </div>
      </Modal>}
      {dialogResult && <PuzzleCheckResult result={dialogResult} onClose={() => setDialogResult(null)} />}
      {tooHardOpen && <Modal title="Too hard" onClose={() => { if (!nextAuto.busy) setTooHardOpen(false) }}>
        <p>You can keep solving this puzzle for practice or start a new {DIFFICULTY_LABELS[recommended]} puzzle with Auto.</p>
        {nextAuto.error && <p className="form-error" role="alert">{nextAuto.error}</p>}
        <div className="dialog-actions">
          <button className="button secondary" disabled={nextAuto.busy} onClick={() => setTooHardOpen(false)}>Keep solving</button>
          <button className="button primary" disabled={nextAuto.busy} onClick={() => { void nextAuto.generate('auto', () => {
            onDifficultyChange('auto')
            setTooHardOpen(false)
          }) }}>
            {nextAuto.busy ? 'Generating…' : preferredDifficulty === 'auto' ? 'Next Auto puzzle' : 'Switch to Auto'}
          </button>
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
