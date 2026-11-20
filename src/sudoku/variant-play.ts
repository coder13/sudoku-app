import { EngineError, runEngine, type Difficulty, type VariantPosition } from './engine.ts'
import { type Game, type Position, valuesOf } from './game.ts'
import { sizedRuleCandidates } from './sized-rule-play.ts'
import { miniCandidates } from './mini-play.ts'
import { algebraicCandidates } from './algebraic-play.ts'
import { readDisabledHintTechniques } from './hint-preferences.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder } from './variant-generation.ts'
import type { PlayableVariant, VariantGame } from './variants.ts'
import { generationRuleset, isGenerationRulesetId, type VariantGenerationOptions } from './variant-rulesets.ts'

let playOrder: Promise<string[]> | undefined

export function getVariantPlayOrder() {
  playOrder ??= Promise.all([runEngine({ type: 'techniques', variant: true }), runEngine({ type: 'techniques' })])
    .then(([variant, classic]) => variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
      Object.fromEntries([...classic.techniques, ...variant.techniques].map((t) => [t.id, t.difficulty]))))
    .catch((error) => {
      playOrder = undefined
      throw error
    })
  return playOrder
}

export async function generatePlayableVariant(id: PlayableVariant, difficulty: Difficulty, seed: number, games: readonly Game[], options?: VariantGenerationOptions) {
  if (options?.ruleset !== undefined && !isGenerationRulesetId(id, options.ruleset))
    throw new EngineError('This ruleset is unavailable for this variant.', 'unsupported')
  const techniqueOrder = await getVariantPlayOrder()
  const ruleset = generationRuleset(id, options?.ruleset)
  const recipes = variantSeeds[id][difficulty]?.filter(recipe => !ruleset || recipe.minDifference === ruleset.minDifference)
  if (!recipes?.length) throw new EngineError('This difficulty is unavailable for this variant.', 'unsupported')
  // Equivalent clues can give an imported puzzle a different variant label.
  // Let the native logical key compare complete definitions across that history.
  const excluded = games.flatMap(game => game.variant ? [game.variant.puzzle] : [])
  const initial = seed % recipes.length
  for (let attempt = 0; attempt <= recipes.length; attempt++) {
    const recipe = recipes[(initial + Math.max(0, attempt - 1)) % recipes.length]
    const request = variantGenerationRequest(id, difficulty, recipe, techniqueOrder, attempt === 0 ? seed : recipe.seed)
    if (attempt === 0) request.maxNodes = 20_000
    if (excluded.length) request.exclude = excluded
    try {
      return await runEngine(request)
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }
  const recipe = recipes[initial]
  if (recipe.retryAttempts) {
    const request = variantGenerationRequest(id, difficulty, recipe, techniqueOrder, seed)
    request.maxNodes = 20_000
    request.maxAttempts = recipe.retryAttempts
    if (excluded.length) request.exclude = excluded
    try {
      return await runEngine(request)
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }
  throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
}

export function variantPosition(
  variant: VariantGame, position?: Pick<Position, 'entries' | 'eliminations'>,
): VariantPosition {
  return { puzzle: variant.puzzle, entries: position?.entries, eliminations: position?.eliminations }
}

export async function playCandidates(game: Game) {
  if (game.sized && game.grid) return sizedRuleCandidates(game.sized, game.grid, valuesOf(game), game.position.eliminations)
  if (game.algebraic) return algebraicCandidates(game.algebraic, valuesOf(game), game.position.eliminations)
  if (game.grid) return miniCandidates(valuesOf(game), game.position.eliminations)
  if (!game.variant) return runEngine({ type: 'notes', values: valuesOf(game) })
  try {
    return await runEngine({ type: 'variant', operation: 'candidates', position: variantPosition(game.variant, game.position) })
  } catch (error) {
    if (error instanceof EngineError && (error.code === 'conflict' || error.code === 'unsolvable')) return null
    throw error
  }
}

export async function variantHintOrder() {
  const disabled = new Set(readDisabledHintTechniques())
  return (await getVariantPlayOrder()).filter((id) => !disabled.has(id))
}
