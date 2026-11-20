import { EngineError, runEngine, type HintChoices, type TechniqueCatalog } from './engine.ts'
import { completeCandidateMasks, hintEliminations, valuesOf, type Game } from './game.ts'
import { miniHints, miniSolutionTrace, visibleMiniHints } from './mini-play.ts'
import { sizedRuleHintChoices, sizedRuleSolutionTrace } from './sized-rule-play.ts'
import { algebraicHintChoices, algebraicSolutionTrace } from './algebraic-play.ts'
import { techniqueHintsFromMatches } from './puzzle-analysis.ts'
import { variantHintChoice, variantSolutionPath } from './variant-hints.ts'
import { getVariantPlayOrder, variantHintOrder, variantPosition } from './variant-play.ts'
import { variantHouseMasks } from './variants.ts'

const catalogs = new Map<boolean, Promise<TechniqueCatalog>>()

/** Imported and generated variant games retain their verified unique completion. */
export function variantHintProblem(game: Pick<Game, 'variant'>, values: string, eliminations?: readonly number[]) {
  const solution = game.variant?.solution
  if (!solution) return undefined
  for (let cell = 0; cell < 81; cell++) {
    if (values[cell] !== '0' && values[cell] !== solution[cell]) return 'conflict' as const
  }
  if (eliminations) {
    for (let cell = 0; cell < 81; cell++) {
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
  const problem = variantHintProblem(game, values, eliminations)
  if (problem) throw new EngineError(problem === 'conflict'
    ? 'The placed digits conflict with this puzzle’s solution.' : 'A required candidate is missing.', problem)
  if (game.variant) {
    const { variant } = game
    const request = {
      type: 'variant', operation: 'hints', position: { ...variantPosition(variant, game.position), eliminations },
      techniqueOrder: technique ? [technique] : await variantHintOrder(),
      limit: technique || limit === 'all' ? 0xffff_ffff : limit,
      preferProgress: !technique, difficulty: game.difficulty ?? 'medium',
    } as const
    const candidates = variantHouseMasks(variant.puzzle, values, eliminations)
    if (collection !== undefined) {
      const first = await run({ ...request, collection })
      return { ...first, choices: first.choices.map((hint) => variantHintChoice(hint, variant.puzzle)), candidates }
    }
    const found = await run(request, { interactive: Boolean(technique) })
    return { choices: found.map((hint) => variantHintChoice(hint, variant.puzzle)), available: found.length,
      candidates }
  }
  if (!technique) return run({ type: 'hints', values, eliminations, limit, collection, includePatterns: true,
    preferProgress: true, difficulty: game.difficulty ?? 'medium' })
  const [matches, { candidates }] = await Promise.all([
    run({ type: 'deductions', values, eliminations, techniqueOrder: [technique] }, { interactive: true }),
    run({ type: 'hints', values, eliminations, includePatterns: true, limit: 0 }),
  ])
  const choices = techniqueHintsFromMatches(matches, technique)
  return { choices, available: choices.length, candidates }
}

/** Pages use the same runner that owns the exhaustive collection. */
export async function puzzleHintPage(variant: Game['variant'], collection: number, index: number, run = runEngine) {
  if (!variant) return run({ type: 'hint-page', collection, index })
  const page = await run({ type: 'hint-page', collection, index, variant: true })
  return { ...page, choices: page.choices.map(hint => variantHintChoice(hint, variant.puzzle)) }
}

/** Solution walkthroughs start at the givens, without changing the saved game. */
export async function puzzleSolution(game: Game, run = runEngine) {
  if (game.sized && game.grid) return sizedRuleSolutionTrace(game.sized, game.grid, game.givens, run)
  if (game.algebraic) return algebraicSolutionTrace(game.algebraic, game.givens, run)
  if (game.grid) return miniSolutionTrace(game.givens, run)
  return game.variant ? variantSolutionPath(await run({
    type: 'variant', operation: 'trace', position: variantPosition(game.variant), techniqueOrder: await getVariantPlayOrder(),
  })) : run({ type: 'logical-solve', values: game.givens, includeStepDetails: true, includeMoveAvailability: true })
}
