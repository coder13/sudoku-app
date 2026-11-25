import { useMemo } from 'react'
import { fogView } from '../../sudoku/fog'
import { CLASSIC_GRID } from '../../sudoku/grid'
import { completeCandidateMasks, conflictsOf, hasUniquenessProof, puzzleIdentity, valuesOf, type Game } from '../../sudoku/game'
import { variantRuleSections } from '../../sudoku/variants'
import type { HintPosition } from '../../sudoku/puzzle-help'
import { candidateDigitColorSummaries } from './play-model'
import { variantPosition } from '../../sudoku/variant-play'

/** Derive the immutable puzzle view consumed by Play tools and panels. */
export function usePlayGameModel(game: Game) {
  const { id, givens, difficulty, score, variant, algebraic, sized, grid, source, uniquenessProof } = game
  const gridSize = (grid ?? CLASSIC_GRID).size
  const fog = useMemo(() => fogView(variant, game.position.entries), [variant, game.position.entries])
  const visibleGivens = fog?.puzzle.givens ?? givens
  const start = fog && !fog.cells.has(40) ? [...fog.cells].find(cell => visibleGivens[cell] === '0') ?? 40
    : visibleGivens[40] === '0' ? 40 : Math.max(0, visibleGivens.indexOf('0'))
  const values = useMemo(() => valuesOf(game), [givens, game.position.entries, variant])
  const { center, corner, eliminations } = game.position
  const aqreShades = useMemo(() => variant ? variantPosition(variant, game.position).shades : undefined,
    [variant, game.position.entries, game.position.shades])
  const displayedCandidates = useMemo(() => completeCandidateMasks(game), [values, center, corner])
  const candidateDigitColors = useMemo(() => candidateDigitColorSummaries({ values, masks: displayedCandidates,
    colors: game.position.candidateColors, gridSize, visibleCells: fog?.cells }),
  [values, displayedCandidates, game.position.candidateColors, gridSize, fog?.cells])
  const puzzle = fog?.puzzle ?? variant?.puzzle
  const hintPosition = useMemo<HintPosition>(() => ({
    gameId: id, givens, values, puzzle: variant?.puzzle, grid, algebraic, sized, center, corner, eliminations,
  }), [id, givens, values, variant?.puzzle, grid, algebraic, sized, center, corner, eliminations])
  const conflicts = useMemo(() => conflictsOf(values, puzzle, grid, sized?.rules), [values, puzzle, grid, sized])
  const draft = game.source === 'draft'
  const mixedVariant = !grid && variant?.id === 'mixed'
  const ruleSections = useMemo(() => puzzle ? variantRuleSections(puzzle, variant?.fog) : [], [puzzle, variant?.fog])
  const solutionIdentity = useMemo(() => puzzleIdentity({ givens, variant, algebraic, grid, sized }), [givens, variant, algebraic, grid, sized])
  const verifiedOriginal = useMemo(() => hasUniquenessProof({ givens, variant, grid, source, uniquenessProof }),
    [givens, variant, grid, source, uniquenessProof])

  return {
    id, givens, difficulty, score, variant, algebraic, sized, grid, gridSize, source, uniquenessProof,
    generatedWithAuto: game.generatedWithAuto, nonUnique: game.nonUnique,
    fog, visibleGivens, start, values, center, corner, eliminations, displayedCandidates, candidateDigitColors, aqreShades,
    puzzle, hintPosition, conflicts, draft, mixedVariant, ruleSections, solutionIdentity, verifiedOriginal,
  }
}
