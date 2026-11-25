import { miniSingles } from './mini-play.ts'
import { checkAlgebraicHintPosition } from './algebraic-play.ts'
import type { AdvancedModes } from './preferences.ts'
import type { EngineRunner } from './engine.ts'
import { runEngine } from './engine.ts'
import { hintEliminations } from './game.ts'
import type { Game } from './game.ts'
import { sizedRuleSingles } from './sized-rule-play.ts'
import { playVariantPuzzle } from './fog.ts'
import { puzzleForVariantTools } from './variants.ts'

type SolveSingleOptions = {
  eliminations?: readonly number[]
  displayedCandidates?: readonly number[]
  run?: EngineRunner
  variantRules?: AdvancedModes['solveSinglesVariants']
}

/** Solve singles in classic rules first, then apply the configured variant rules. */
export async function solveSingleValues(
  { grid, variant, algebraic, sized, position }: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'sized'> & Partial<Pick<Game, 'position'>>,
  values: string,
  { eliminations, displayedCandidates, run = runEngine, variantRules }: SolveSingleOptions = {}
) {
  if (sized && grid) return sizedRuleSingles(sized, grid, values, eliminations, displayedCandidates, run)
  if (grid?.size === 4) {
    if (algebraic) checkAlgebraicHintPosition(algebraic, values, hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size))
    return miniSingles(values, eliminations, displayedCandidates, run)
  }

  // Always solve singles from standard Sudoku rules first so disabled variant rules
  // cannot hide a classic single.
  const classicValues = await run({
    type: 'solve-singles',
    values,
    eliminations,
    displayedCandidates: variant ? undefined : displayedCandidates,
  })
  if (!variant || !variantRules?.length) return classicValues

  const puzzle = playVariantPuzzle(variant, position?.entries) ?? variant.puzzle
  const filteredPuzzle = puzzleForVariantTools(puzzle, variantRules)
  const entries = [...classicValues].map((digit, cell) => (filteredPuzzle.givens[cell] === '0' ? digit : '0')).join('')
  return run({
    type: 'variant',
    operation: 'solve-singles',
    position: { puzzle: filteredPuzzle, entries, eliminations },
  })
}
