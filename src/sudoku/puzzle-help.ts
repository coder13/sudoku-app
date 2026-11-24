import { fogView, playVariantPuzzle } from './fog.ts'
import { solveFogPath } from './fog-solution.ts'
import { EngineError, runEngine, type HintChoices, type TechniqueCatalog } from './engine.ts'
import { completeCandidateMasks, hintEliminations, valuesOf, type Game, type Position } from './game.ts'
import { miniHints, miniSolutionTrace, visibleMiniHints } from './mini-play.ts'
import { sizedRuleHintChoices, sizedRuleSolutionTrace } from './sized-rule-play.ts'
import { algebraicHintChoices, algebraicSolutionTrace } from './algebraic-play.ts'
import { techniqueHintsFromMatches } from './puzzle-analysis.ts'
import { practiceTechniqueOrder, variantPracticeTechniqueOrder } from './practice-play.ts'
import { variantHintChoice, variantSolutionPath } from './variant-hints.ts'
import { getVariantPlayOrder, variantHintOrder, variantPosition } from './variant-play.ts'
import { variantHouseMasks } from './variants.ts'

export type HintPosition = Pick<Game, 'givens' | 'grid' | 'algebraic' | 'sized'> &
  Pick<Position, 'center' | 'corner' | 'eliminations'> & {
    gameId: string
    values: string
    puzzle?: NonNullable<Game['variant']>['puzzle']
  }

/** Proofs and removals are valid only for the puzzle definition and inputs used to find them. */
export function matchesHintPosition(game: Game, position: HintPosition) {
  const { center, corner, eliminations } = game.position
  return game.id === position.gameId && game.givens === position.givens && game.variant?.puzzle === position.puzzle &&
    game.grid === position.grid && game.algebraic === position.algebraic && game.sized === position.sized &&
    center === position.center && corner === position.corner && eliminations === position.eliminations &&
    valuesOf(game) === position.values
}

const catalogs = new Map<boolean, Promise<TechniqueCatalog>>()

/** Imported and generated variant games retain their verified unique completion. */
export function variantHintProblem(game: Pick<Game, 'variant'> & Partial<Pick<Game, 'position'>>, values: string, eliminations?: readonly number[]) {
  const solution = game.variant?.solution
  if (!solution) return undefined
  for (let cell = 0; cell < 81; cell++) {
    if (values[cell] !== '0' && values[cell] !== solution[cell]) return 'conflict' as const
  }
  if (eliminations) {
    const fog = fogView(game.variant, game.position?.entries)
    for (let cell = 0; cell < 81; cell++) {
      if (fog && !fog.cells.has(cell)) continue
      if (values[cell] === '0' && (eliminations[cell] & (1 << (Number(solution[cell]) - 1)))) return 'invalid-eliminations' as const
    }
  }
  return undefined
}

export function puzzleTechniqueCatalog(variant: boolean) {
  let request = catalogs.get(variant)
  if (!request) {
    request = runEngine({ type: 'techniques', variant }).catch((error: unknown) => {
      catalogs.delete(variant)
      throw error
    })
    catalogs.set(variant, request)
  }
  return request
}

/** Use the player's current digits and removals, retaining the full rule set. */
export async function puzzleHints(game: Game, limit: 10 | 'all' = 10, technique?: string, collection?: number, run = runEngine): Promise<HintChoices & { offset?: number }> {
  if (game.sized && game.grid) {
    const values = valuesOf(game)
    const eliminations = hintEliminations(values, completeCandidateMasks(game), game.position.eliminations, game.grid.size)
    return visibleMiniHints(await sizedRuleHintChoices(game.sized, game.grid, values, eliminations, run), limit, technique)
  }
  if (game.algebraic && game.grid) {
    const values = valuesOf(game)
    const eliminations = hintEliminations(values, completeCandidateMasks(game), game.position.eliminations, game.grid.size)
    return visibleMiniHints(await algebraicHintChoices(game.algebraic, values, eliminations, run), limit, technique)
  }
  if (game.grid) return miniHints(game, limit, technique, run)
  const values = valuesOf(game)
  const eliminations = hintEliminations(values, completeCandidateMasks(game), game.position.eliminations)
  const practiceOpening = game.practiceTechnique && values === game.givens && !eliminations?.some(Boolean)
    ? game.practiceTechnique : undefined
  const problem = variantHintProblem(game, values, eliminations)
  if (problem) throw new EngineError(problem === 'conflict'
    ? 'The placed digits conflict with this puzzle’s solution.' : 'A required candidate is missing.', problem)
  if (game.variant) {
    const { variant } = game
    const position = variantPosition(variant, game.position)
    const request = {
      type: 'variant', operation: 'hints', position: { ...position, eliminations },
      limit: technique || limit === 'all' ? 0xffff_ffff : limit,
      preferProgress: !technique, difficulty: game.difficulty ?? 'medium',
    } as const
    const candidates = variantHouseMasks(position.puzzle, values, eliminations)
    async function findVariantHints(techniqueOrder: readonly string[]) {
      if (collection !== undefined) {
        const first = await run({ ...request, techniqueOrder, collection })
        return { ...first, choices: first.choices.map(hint => variantHintChoice(hint, position.puzzle)), candidates }
      }
      const found = await run({ ...request, techniqueOrder }, { interactive: Boolean(technique) })
      return { choices: found.map(hint => variantHintChoice(hint, position.puzzle)), available: found.length, candidates }
    }
    if (practiceOpening && !technique) {
      const opening = await findVariantHints([practiceOpening])
      if (opening.available) return opening
    }
    return findVariantHints(technique ? [technique] : await variantHintOrder(position.puzzle))
  }
  if (!technique) {
    const request = { type: 'hints', values, eliminations, limit, collection, includePatterns: true,
      preferProgress: true, difficulty: game.difficulty ?? 'medium' } as const
    if (practiceOpening) {
      const { techniques } = await run({ type: 'techniques' })
      const opening = await run({ ...request, disabledTechniques: techniques.filter(({ id }) => id !== practiceOpening).map(({ id }) => id) })
      if (opening.available > 0) return opening
    }
    return run(request)
  }
  const [matches, { candidates }] = await Promise.all([
    run({ type: 'deductions', values, eliminations, techniqueOrder: [technique] }, { interactive: true }),
    run({ type: 'hints', values, eliminations, includePatterns: true, limit: 0 }),
  ])
  const choices = techniqueHintsFromMatches(matches, technique)
  return { choices, available: choices.length, candidates }
}

/** Pages use the same runner that owns the exhaustive collection. */
export async function puzzleHintPage(variant: Game['variant'], collection: number, index: number, run = runEngine, entries?: string) {
  if (!variant) return run({ type: 'hint-page', collection, index })
  const page = await run({ type: 'hint-page', collection, index, variant: true })
  const puzzle = playVariantPuzzle(variant, entries) ?? variant.puzzle
  return { ...page, choices: page.choices.map(hint => variantHintChoice(hint, puzzle)) }
}

/** Solution walkthroughs start at the givens, without changing the saved game. */
export async function puzzleSolution(game: Game, run = runEngine) {
  if (game.sized && game.grid) return sizedRuleSolutionTrace(game.sized, game.grid, game.givens, run)
  if (game.algebraic) return algebraicSolutionTrace(game.algebraic, game.givens, run)
  if (game.grid) return miniSolutionTrace(game.givens, run)
  if (game.variant?.fog) return solveFogPath(game.variant, run, true)
  const { variant } = game
  if (!variant) {
    const techniqueOrder = game.practiceTechnique
      ? practiceTechniqueOrder(await run({ type: 'techniques' }), game.practiceTechnique) : undefined
    return run({ type: 'logical-solve', values: game.givens, techniqueOrder,
      includeStepDetails: true, includeMoveAvailability: true })
  }
  const position = variantPosition(variant)
  const techniqueOrder = game.practiceTechnique ? await variantPracticeTechniqueOrder(game.practiceTechnique, run)
    : await getVariantPlayOrder(variant.puzzle)
  const path = variantSolutionPath(await run({
    type: 'variant', operation: 'trace', position, techniqueOrder,
  }))
  if (path.rating.status !== 'stalled' || game.source === 'draft') return path

  // The stored grid supplies every digit. One node checks that it still
  // satisfies this definition, including for saves older than uniqueness keys.
  const { givens } = position.puzzle
  const entries = [...variant.solution].map((digit, cell) => givens[cell] === '0' ? digit : '0').join('')
  try {
    const solution = await run({ type: 'variant', operation: 'solve', position: { ...position, entries }, maxNodes: 1 })
    if (solution === variant.solution) {
      path.exactPosition = { givens, entries, eliminations: Array<number>(givens.length).fill(0) }
    }
  } catch (error) {
    if (!(error instanceof EngineError)) throw error
  }
  return path
}
