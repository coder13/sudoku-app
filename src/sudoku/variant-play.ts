import { EngineError, runEngine, type Difficulty, type VariantPosition } from './engine.ts'
import { type Game, type Position, valuesOf } from './game.ts'
import { readDisabledHintTechniques } from './hint-preferences.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder } from './variant-generation.ts'
import { variantIdForPuzzle, type PlayableVariant, type VariantGame } from './variants.ts'

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

export async function generatePlayableVariant(id: PlayableVariant, difficulty: Difficulty, seed: number, games: readonly Game[]) {
  const techniqueOrder = await getVariantPlayOrder()
  const recipes = variantSeeds[id][difficulty]
  if (!recipes?.length) throw new EngineError('This difficulty is unavailable for this variant.', 'unsupported')
  const excluded = games.flatMap(game => game.variant && variantIdForPuzzle(game.variant.puzzle) === id ? [game.variant.puzzle] : [])
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
  throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
}

export function variantPosition(
  variant: VariantGame, position?: Pick<Position, 'entries' | 'eliminations'>,
): VariantPosition {
  return { puzzle: variant.puzzle, entries: position?.entries, eliminations: position?.eliminations }
}

export async function playCandidates(game: Game) {
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
