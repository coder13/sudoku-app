import { useMemo } from 'react'
import type { CandidateRecovery } from '../../sudoku/candidate-recovery'
import type { HintChoice } from '../../sudoku/engine'
import { hasCandidate, type Game } from '../../sudoku/game'
import { CLASSIC_GRID } from '../../sudoku/grid'
import { cellReference, describeHint, describeHintDigits, HINT_CANDIDATES_ERROR, NO_HINT, techniqueLabel,
  type CellReferenceStyle, type HintStage, type PuzzleHint } from '../../sudoku/hints'
import { hintLocation, lessonDiagram } from '../../sudoku/lesson-diagram'
import { practiceSearch } from '../../sudoku/lesson-guidance'
import { lessonRoutes } from '../../sudoku/lessons'
import { techniqueDifficulties } from '../../sudoku/technique-difficulties'
import type { HintPosition } from '../../sudoku/puzzle-help'
import type { HintSource } from '../../sudoku/play-session'

export type HintState = {
  source: HintSource
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

type Options = {
  game: Game
  hintState: HintState | null
  hintRevealed: boolean
  mobile: boolean
  solved: boolean
  draft: boolean
  solutionHintOpen: boolean
  hintPosition: HintPosition
  cellReferenceStyle: CellReferenceStyle
}

/** Resolve the current hint phase, explanation, and overlay from puzzle and hint state. */
export function usePlayHintModel({
  game, hintState, hintRevealed, mobile, solved, draft, solutionHintOpen, hintPosition, cellReferenceStyle,
}: Options) {
  const grid = game.grid
  const gridSize = (grid ?? CLASSIC_GRID).size
  const hint = hintState?.position === hintPosition ? hintState : null
  const visibleHint = hintRevealed ? hint : null
  const hintLoading = hintRevealed && !game.paused && !draft && !solved && !visibleHint
  const hintOpen = (hintRevealed && !game.paused && !draft && !solved) || hintLoading || visibleHint !== null || solutionHintOpen
  const mobileHintOpen = mobile && hintOpen && !solutionHintOpen
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
    if (!deduction?.pattern || !deduction.actions.length || !hintCandidates || hintStage !== 'technique' || recovery || game.variant || grid || game.algebraic || game.sized) return undefined
    return practiceSearch({ deduction, candidates: hintCandidates, pattern: deduction.pattern }).start.text
  }, [deduction, hintCandidates, hintStage, recovery, game.variant, grid, game.algebraic, game.sized])
  const locationClue = useMemo(() => deduction && hintStage === 'location'
    ? hintLocation(deduction, cellReferenceStyle, hintDifficulty, grid) : undefined,
  [deduction, hintStage, cellReferenceStyle, hintDifficulty, grid])
  const endpointMarks = locationClue?.annotations.candidates
  const hintBoardPosition = useMemo(() => {
    if (!endpointMarks) return { center: game.position.center, corner: game.position.corner }
    const hintCorner = [...game.position.corner]
    for (const [cell, marks] of endpointMarks) {
      for (const digit of marks.keys()) {
        if (!hasCandidate(game.position.center[cell], digit)) hintCorner[cell] |= 1 << (digit - 1)
      }
    }
    return { center: game.position.center, corner: hintCorner }
  }, [endpointMarks, game.position.center, game.position.corner])
  const hintDiagram = useMemo(() => {
    if (!fullHint || !deduction || !hintCandidates) return undefined
    return lessonDiagram({ deduction, candidates: hintCandidates }, deduction.pattern, {
      cellReferenceStyle, difficulty: hintDifficulty, grid,
    })
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

  return {
    hint, visibleHint, hintLoading, mobileHintOpen, hintOpen, deduction, hintCount, hintStage, recovery,
    recoveryCell, recoveryLocationVisible, fullHint, hintDifficulty, hintCandidates, techniqueStartClue,
    locationClue, endpointMarks, hintBoardPosition, hintDiagram, availableHintAnnotations, playerVisualsSelected,
    hintVisualsActive, hintAnnotations, hintCopy,
  }
}
