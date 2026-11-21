import { playVariantPuzzle } from './fog.ts'
import { difficultyIndex } from './difficulty.ts'
import { EngineError, runEngine, type Difficulty, type EngineRunner, type TechniqueCatalog, type VariantClueLayout, type VariantGenerationRequest, type VariantPosition, type VariantPuzzle } from './engine.ts'
import { type Game, valuesOf } from './game.ts'
import { sizedRuleCandidates } from './sized-rule-play.ts'
import { miniCandidates } from './mini-play.ts'
import { algebraicCandidates } from './algebraic-play.ts'
import { readDisabledHintTechniques } from './hint-preferences.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder, withMediumVariantTechniques } from './variant-generation.ts'
import { hasBetweenAndPairClues, hasPrintedKropki, type PlayableVariant, type VariantGame } from './variants.ts'
import { generationRuleset, isGenerationRulesetId, type VariantGenerationOptions } from './variant-rulesets.ts'

let playProfile: Promise<{ techniqueOrder: string[]; catalog: TechniqueCatalog; tiers: Record<string, Difficulty>; firstBeyondHard: string | undefined }> | undefined

function withRenbanTechniques(order: readonly string[]) {
  return order.flatMap(id => {
    if (id === 'renban') return [id, 'renban-locked-digit']
    if (id === 'little-killer') return [id, 'renban-house-support']
    return [id]
  })
}

function withGroupLineHouses(order: readonly string[]) {
  return order.flatMap(id => id === 'skyscrapers' ? ['group-line-house-support', id] : [id])
}

function withRegionSumTechniques(order: readonly string[], sharedRegion = false) {
  return order.flatMap(id => {
    if (id === 'region-sum') return [id, 'region-sum-distinct']
    if (id === 'skyscrapers' && sharedRegion) return [id, 'region-sum-house']
    return [id]
  })
}

function withLittleKillerHouses(order: readonly string[]) {
  return order.flatMap(id => id === 'little-killer' ? [id, 'little-killer-house-support'] : [id])
}

export function getVariantPlayProfile(puzzle?: VariantPuzzle, layouts?: readonly VariantClueLayout[]) {
  playProfile ??= Promise.all([runEngine({ type: 'techniques', variant: true }), runEngine({ type: 'techniques' })])
    .then(([catalog, classic]) => {
      const tiers = Object.fromEntries([...classic.techniques, ...catalog.techniques].map(technique => [technique.id, technique.difficulty]))
      const techniqueOrder = variantTechniqueOrder(catalog.defaultOrder, classic.difficultyOrder, tiers)
      const firstBeyondHard = techniqueOrder.find(id => difficultyIndex(tiers[id] ?? 'impossible') > difficultyIndex('hard'))
      return { catalog, techniqueOrder, tiers, firstBeyondHard }
    })
    .catch((error) => {
      playProfile = undefined
      throw error
    })
  const rules = puzzle?.rules ?? []
  const renbans = rules.filter(rule => rule.type === 'renban').filter(rule => rule.cells.length >= 2)
  const rays = rules.filter(rule => rule.type === 'little-killer')
  const regionSumLines = rules.filter(rule => rule.type === 'region-sum')
  const hasLinkedClues = hasBetweenAndPairClues(rules, layouts)
  const hasKropki = hasPrintedKropki(rules)
  const hasThermometer = rules.some(rule => rule.type === 'thermometer')
  const hasEntropicLine = rules.some(rule => rule.type === 'entropic')
  const hasGroupPairs = hasEntropicLine && rules.some(rule =>
    rule.type === 'kropki' || rule.type === 'xv' || rule.type === 'adjacent-total' || rule.type === 'inequality')
  if (!renbans.length && !rays.length && !hasEntropicLine && !regionSumLines.length && !hasThermometer && !hasKropki && !hasLinkedClues) return playProfile

  const joined = rays.filter(ray =>
    renbans.some(renban => renban.cells.every(cell => ray.cells.includes(cell))))
  const hasRenbanGroups = renbans.filter(rule => rule.cells.length === 3 || rule.cells.length === 4).length >= 3
  const hasCompanion = joined.some(ray => renbans.some(renban =>
    renban.cells.filter(cell => ray.cells.includes(cell)).length === 1))
  return playProfile.then(({ techniqueOrder: order, catalog, tiers, firstBeyondHard }) => {
    const renbanOrder = renbans.length ? withRenbanTechniques(order) : order
    const rayOrder = rays.length ? withLittleKillerHouses(renbanOrder) : renbanOrder
    const groupOrder = hasEntropicLine ? withGroupLineHouses(rayOrder) : rayOrder
    const sumOrder = regionSumLines.length ? withRegionSumTechniques(groupOrder, regionSumLines.length >= 2) : groupOrder
    const scoped = sumOrder.flatMap(id => {
      if (hasGroupPairs && id === 'group-line-house-support') return [id, 'group-order-contradiction']
      if (id === 'little-killer-house-support' && joined.length) return [id, 'renban-sum']
      if (id === 'sandwich' && joined.length) return [id, 'renban-sum-ray-houses']
      if (id === 'x-sum' && hasCompanion) return [id, 'renban-sum-house']
      if (id === firstBeyondHard) return [
        ...(hasRenbanGroups ? ['renban-group-counts'] : []),
        ...(hasLinkedClues ? ['linked-clue-contradiction'] : []),
        id,
      ]
      return [id]
    })
    const withLateChecks = firstBeyondHard ? scoped : [
      ...scoped,
      ...(hasRenbanGroups ? ['renban-group-counts'] : []),
      ...(hasLinkedClues ? ['linked-clue-contradiction'] : []),
    ]
    const techniqueOrder = withMediumVariantTechniques(withLateChecks, tiers, [
      ...(hasThermometer ? ['thermometer-house-support'] : []),
      ...(hasKropki ? ['kropki-house-support'] : []),
    ])
    return { techniqueOrder, catalog, tiers, firstBeyondHard }
  })
}

export async function getVariantPlayOrder(puzzle?: VariantPuzzle, layouts?: readonly VariantClueLayout[]) {
  return (await getVariantPlayProfile(puzzle, layouts)).techniqueOrder
}

export async function generatePlayableVariant(id: PlayableVariant, difficulty: Difficulty, seed: number, games: readonly Game[], options?: VariantGenerationOptions, run: EngineRunner = runEngine) {
  if (options?.ruleset !== undefined && !isGenerationRulesetId(id, options.ruleset))
    throw new EngineError('This ruleset is unavailable for this variant.', 'unsupported')
  const { techniqueOrder: order, tiers } = await getVariantPlayProfile()
  const techniqueOrder = id === 'renban' ? withRenbanTechniques(order)
    : id === 'little-killer' ? withLittleKillerHouses(order)
      : id === 'entropic' ? withGroupLineHouses(order)
        : id === 'region-sum' ? withRegionSumTechniques(order, true)
          : id === 'thermometer' ? withMediumVariantTechniques(order, tiers, ['thermometer-house-support'])
            : id === 'kropki' ? withMediumVariantTechniques(order, tiers, ['kropki-house-support']) : order
  const ruleset = generationRuleset(id, options?.ruleset)
  const recipes = variantSeeds[id][difficulty]?.filter(recipe => !ruleset || recipe.minDifference === ruleset.minDifference)
  if (!recipes?.length) throw new EngineError('This difficulty is unavailable for this variant.', 'unsupported')
  // Equivalent clues can give an imported puzzle a different variant label.
  // Let the native logical key compare complete definitions across that history.
  const excluded = games.flatMap(game => game.variant ? [game.variant.puzzle] : [])
  const tryGenerate = async (request: VariantGenerationRequest) => {
    if (excluded.length) request.exclude = excluded
    try {
      const result = await run(request)
      // A sampled positive marker layout can contain only one symbol.
      if (id === 'xv' && !result.puzzle.rules?.some(rule =>
        rule.type === 'xv' && rule.five?.pairs?.length && rule.ten?.pairs?.length)) return
      // Two-cell sums includes at least one clue beyond the two XV totals.
      if (id === 'adjacent-total' && !result.puzzle.rules?.some(rule =>
        rule.type === 'adjacent-total' && rule.sum !== 5 && rule.sum !== 10)) return
      return result
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }

  const initial = seed % recipes.length
  for (let attempt = 0; attempt <= recipes.length; attempt++) {
    const recipe = recipes[(initial + Math.max(0, attempt - 1)) % recipes.length]
    const request = variantGenerationRequest(id, difficulty, recipe, techniqueOrder, attempt === 0 ? seed : recipe.seed)
    if (attempt === 0) request.maxNodes = 20_000
    const result = await tryGenerate(request)
    if (result) return result
  }
  const recipe = recipes[initial]
  if (recipe.retryAttempts) {
    const request = variantGenerationRequest(id, difficulty, recipe, techniqueOrder, seed)
    request.maxNodes = 20_000
    request.maxAttempts = recipe.retryAttempts
    const result = await tryGenerate(request)
    if (result) return result
  }
  throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
}

export function variantPosition(
  variant: VariantGame, position?: { entries: string; eliminations?: readonly number[] },
): VariantPosition {
  const puzzle = playVariantPuzzle(variant, position?.entries) ?? variant.puzzle
  const entries = variant.fog && position
    ? [...position.entries].map((digit, cell) => puzzle.givens[cell] === '0' ? digit : '0').join('')
    : position?.entries
  return { puzzle, entries, eliminations: position?.eliminations }
}

export async function playCandidates(game: Game, run: EngineRunner = runEngine) {
  if (game.sized && game.grid) return sizedRuleCandidates(game.sized, game.grid, valuesOf(game), game.position.eliminations, run)
  if (game.algebraic) return algebraicCandidates(game.algebraic, valuesOf(game), game.position.eliminations, run)
  if (game.grid) return miniCandidates(valuesOf(game), game.position.eliminations, run)
  if (!game.variant) return run({ type: 'notes', values: valuesOf(game) })
  try {
    return await run({ type: 'variant', operation: 'candidates', position: variantPosition(game.variant, game.position) })
  } catch (error) {
    if (error instanceof EngineError && (error.code === 'conflict' || error.code === 'unsolvable')) return null
    throw error
  }
}

export async function variantHintOrder(puzzle: VariantPuzzle) {
  const disabled = new Set(readDisabledHintTechniques())
  return (await getVariantPlayOrder(puzzle)).filter((id) => !disabled.has(id))
}
