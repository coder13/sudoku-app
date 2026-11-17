import { runEngine, type HintChoices, type TechniqueCatalog } from './engine.ts'
import { completeCandidateMasks, hintEliminations, valuesOf, type Game } from './game.ts'
import { techniqueHintsFromMatches } from './puzzle-analysis.ts'
import { variantHintChoice, variantSolutionPath } from './variant-hints.ts'
import { getVariantPlayOrder, variantHintOrder, variantPosition } from './variant-play.ts'
import { variantHouseMasks } from './variants.ts'

const catalogs = new Map<boolean, Promise<TechniqueCatalog>>()

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
export async function puzzleHints(game: Game, limit: 10 | 'all' = 10, technique?: string): Promise<HintChoices> {
  const values = valuesOf(game)
  const eliminations = hintEliminations(values, completeCandidateMasks(game), game.position.eliminations)
  if (game.variant) {
    const { variant } = game
    const found = await runEngine({
      type: 'variant', operation: 'hints', position: { ...variantPosition(variant, game.position), eliminations },
      techniqueOrder: technique ? [technique] : await variantHintOrder(),
      limit: technique || limit === 'all' ? 0xffff_ffff : limit,
      preferProgress: !technique, difficulty: game.difficulty ?? 'medium',
    }, { interactive: Boolean(technique) })
    return { choices: found.map((hint) => variantHintChoice(hint, variant.puzzle)), available: found.length,
      candidates: variantHouseMasks(variant.puzzle, values, eliminations) }
  }
  if (!technique) return runEngine({ type: 'hints', values, eliminations, limit, includePatterns: true,
    preferProgress: true, difficulty: game.difficulty ?? 'medium' })
  const [matches, { candidates }] = await Promise.all([
    runEngine({ type: 'deductions', values, eliminations, techniqueOrder: [technique] }, { interactive: true }),
    runEngine({ type: 'hints', values, eliminations, includePatterns: true, limit: 0 }),
  ])
  const choices = techniqueHintsFromMatches(matches, technique)
  return { choices, available: choices.length, candidates }
}

/** Solution walkthroughs start at the givens, without changing the saved game. */
export async function puzzleSolution(game: Game) {
  return game.variant ? variantSolutionPath(await runEngine({
    type: 'variant', operation: 'trace', position: variantPosition(game.variant), techniqueOrder: await getVariantPlayOrder(),
  })) : runEngine({ type: 'logical-solve', values: game.givens, includeStepDetails: true, includeMoveAvailability: true })
}
