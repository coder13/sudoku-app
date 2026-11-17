import { EngineError, runEngine, type HintChoices, type TechniqueCatalog } from './engine.ts'
import { completeCandidateMasks, hintEliminations, valuesOf, type Game } from './game.ts'
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
export async function puzzleHints(game: Game, limit: 10 | 'all' = 10, technique?: string, collection?: number): Promise<HintChoices & { offset?: number }> {
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
      const first = await runEngine({ ...request, collection })
      return { ...first, choices: first.choices.map((hint) => variantHintChoice(hint, variant.puzzle)), candidates }
    }
    const found = await runEngine(request, { interactive: Boolean(technique) })
    return { choices: found.map((hint) => variantHintChoice(hint, variant.puzzle)), available: found.length,
      candidates }
  }
  if (!technique) return runEngine({ type: 'hints', values, eliminations, limit, collection, includePatterns: true,
    preferProgress: true, difficulty: game.difficulty ?? 'medium' })
  const [matches, { candidates }] = await Promise.all([
    runEngine({ type: 'deductions', values, eliminations, techniqueOrder: [technique] }, { interactive: true }),
    runEngine({ type: 'hints', values, eliminations, includePatterns: true, limit: 0 }),
  ])
  const choices = techniqueHintsFromMatches(matches, technique)
  return { choices, available: choices.length, candidates }
}

/** Pages stay on the foreground worker that owns the exhaustive collection. */
export async function puzzleHintPage(variant: Game['variant'], collection: number, index: number) {
  if (!variant) return runEngine({ type: 'hint-page', collection, index })
  const page = await runEngine({ type: 'hint-page', collection, index, variant: true })
  return { ...page, choices: page.choices.map(hint => variantHintChoice(hint, variant.puzzle)) }
}

/** Solution walkthroughs start at the givens, without changing the saved game. */
export async function puzzleSolution(game: Game) {
  return game.variant ? variantSolutionPath(await runEngine({
    type: 'variant', operation: 'trace', position: variantPosition(game.variant), techniqueOrder: await getVariantPlayOrder(),
  })) : runEngine({ type: 'logical-solve', values: game.givens, includeStepDetails: true, includeMoveAvailability: true })
}
