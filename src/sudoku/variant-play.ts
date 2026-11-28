import { playVariantPuzzle } from './fog.ts'
import { puzzleForVariantTools, type VariantToolId } from './variants.ts'
import { currentDifficulty, difficultyIndex } from './difficulty.ts'
import { EngineError, runEngine, type Difficulty, type EngineRunner, type TechniqueCatalog, type VariantClueLayout, type VariantGenerationRequest, type VariantPosition, type VariantPuzzle } from './engine.ts'
import { type Game, valuesOf } from './game.ts'
import { sizedRuleCandidates } from './sized-rule-play.ts'
import { miniCandidates } from './mini-play.ts'
import { algebraicCandidates } from './algebraic-play.ts'
import { readDisabledHintTechniques } from './hint-preferences.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder, withMediumVariantTechniques } from './variant-generation.ts'
import { hasBetweenAndPairClues, hasMatchingAndPairClues, hasPrintedKropki, type PlayableVariant, type VariantGame } from './variants.ts'
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
  const rays = [...rules.filter(rule => rule.type === 'little-killer'), ...(layouts ?? []).flatMap(
    layout => layout.type === 'outside' && layout.clue === 'little-killer' ? [layout] : [])]
  const regionSumLines = rules.filter(rule => rule.type === 'region-sum')
  const hasMatchingCells = rules.some(rule => rule.type === 'palindrome' || rule.type === 'clone')
  const hasLinkedClues = hasBetweenAndPairClues(rules, layouts) || hasMatchingAndPairClues(rules, layouts)
  const hasKropki = hasPrintedKropki(rules) || layouts?.some(layout => layout.type === 'markers' && layout.family === 'kropki')
  const hasThermometer = rules.some(rule => rule.type === 'thermometer')
  const hasGroupLine = rules.some(rule => rule.type === 'entropic' || rule.type === 'modular')
  const hasGroupPairs = hasGroupLine && (rules.some(rule =>
    rule.type === 'kropki' || rule.type === 'xv' || rule.type === 'adjacent-total' || rule.type === 'inequality') ||
    layouts?.some(layout => layout.type === 'markers' || layout.type === 'adjacent-total' || layout.type === 'inequality'))
  if (!renbans.length && !rays.length && !hasGroupLine && !regionSumLines.length && !hasThermometer && !hasKropki && !hasLinkedClues && !hasMatchingCells) return playProfile

  const joined = rays.filter(ray =>
    renbans.some(renban => renban.cells.every(cell => ray.cells.includes(cell))))
  const hasRenbanGroups = renbans.filter(rule => rule.cells.length === 3 || rule.cells.length === 4).length >= 3
  const hasCompanion = joined.some(ray => renbans.some(renban =>
    renban.cells.filter(cell => ray.cells.includes(cell)).length === 1))
  return playProfile.then(({ techniqueOrder: order, catalog, tiers, firstBeyondHard }) => {
    const renbanOrder = renbans.length ? withRenbanTechniques(order) : order
    const rayOrder = rays.length ? withLittleKillerHouses(renbanOrder) : renbanOrder
    const groupOrder = hasGroupLine ? withGroupLineHouses(rayOrder) : rayOrder
    const sumOrder = regionSumLines.length ? withRegionSumTechniques(groupOrder, regionSumLines.length >= 2) : groupOrder
    const scoped = sumOrder.flatMap(id => {
      if (hasGroupPairs && id === 'group-line-house-support') return [id, 'group-order-contradiction', 'group-order-elimination']
      if (id === 'little-killer-house-support' && joined.length) return [id, 'renban-sum']
      if (id === 'sandwich' && joined.length) return [id, 'renban-sum-ray-houses']
      if (id === 'x-sum' && hasCompanion) return [id, 'renban-sum-house']
      if (hasMatchingCells && id === 'aic') return ['matching-layout-forcing', id]
      if (id === firstBeyondHard) return [
        ...(hasRenbanGroups ? ['renban-group-counts'] : []),
        ...(hasLinkedClues ? ['linked-clue-contradiction'] : []),
        ...(hasMatchingCells ? ['matching-digit-contradiction'] : []),
        id,
      ]
      return [id]
    })
    const withLateChecks = firstBeyondHard ? scoped : [
      ...scoped,
      ...(hasRenbanGroups ? ['renban-group-counts'] : []),
      ...(hasLinkedClues ? ['linked-clue-contradiction'] : []),
      ...(hasMatchingCells ? ['matching-digit-contradiction'] : []),
    ]
    const techniqueOrder = withMediumVariantTechniques(withLateChecks, tiers, [
      ...(hasThermometer ? ['thermometer-house-support'] : []),
      ...(hasKropki ? ['kropki-house-support'] : []),
    ])
    if (puzzle?.extendedLogic) techniqueOrder.sort((a, b) => difficultyIndex(tiers[a] ?? 'impossible') - difficultyIndex(tiers[b] ?? 'impossible'))
    return { techniqueOrder, catalog, tiers, firstBeyondHard }
  })
}

export async function getVariantPlayOrder(puzzle?: VariantPuzzle, layouts?: readonly VariantClueLayout[]) {
  return (await getVariantPlayProfile(puzzle, layouts)).techniqueOrder
}

export async function generatePlayableVariant(id: PlayableVariant, difficulty: Difficulty, seed: number, games: readonly Game[], options?: VariantGenerationOptions, run?: EngineRunner) {
  if (options?.ruleset !== undefined && !isGenerationRulesetId(id, options.ruleset))
    throw new EngineError('This ruleset is unavailable for this variant.', 'unsupported')
  const { generateCustomSudoku } = await import('./custom-generation.ts')
  const rule = id === 'whispers' && options?.ruleset === 'dutch' ? 'dutch-whispers' : id
  return generateCustomSudoku([rule], currentDifficulty(difficulty), seed, games, options, run)
}

export async function tryVariantRecipe(id: PlayableVariant, difficulty: Difficulty, seed: number, games: readonly Game[], options: VariantGenerationOptions, run: EngineRunner) {
  const ruleset = generationRuleset(id, options?.ruleset)
  const recipes = variantSeeds[id][difficulty]?.filter(recipe => !ruleset || recipe.minDifference === ruleset.minDifference)
  if (!recipes?.length) return
  // Equivalent clues can give an imported puzzle a different variant label.
  // Let the native logical key compare complete definitions across that history.
  const excluded = games.flatMap(game => game.variant ? [game.variant.puzzle] : [])
  const tryGenerate = async (request: VariantGenerationRequest) => {
    request.techniqueOrder = await getVariantPlayOrder(request.template, request.derivedClues)
    if (excluded.length) request.exclude = excluded
    try {
      const result = await run(request, { signal: options.signal })
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
    const request = variantGenerationRequest(id, difficulty, recipe, [], attempt === 0 ? seed : recipe.seed)
    if (attempt === 0) request.maxNodes = 20_000
    const result = await tryGenerate(request)
    if (result) return result
  }
  const recipe = recipes[initial]
  if (recipe.retryAttempts) {
    const request = variantGenerationRequest(id, difficulty, recipe, [], seed)
    request.maxNodes = 20_000
    request.maxAttempts = recipe.retryAttempts
    const result = await tryGenerate(request)
    if (result) return result
  }
}

export function variantPosition(
  variant: VariantGame, position?: { entries: string; eliminations?: readonly number[]; shades?: string },
): VariantPosition {
  const puzzle = playVariantPuzzle(variant, position?.entries) ?? variant.puzzle
  const entries = variant.fog && position
    ? [...position.entries].map((digit, cell) => puzzle.givens[cell] === '0' ? digit : '0').join('')
    : position?.entries
  const hasAqre = puzzle.rules?.some(rule => rule.type === 'aqre')
  const shades = hasAqre ? position?.shades ?? (() => {
    const initial = Array(puzzle.givens.length).fill('0')
    for (const rule of puzzle.rules ?? []) if (rule.type === 'aqre') for (const given of rule.givenShades) {
      initial[given.cell] = given.shade === 'shaded' ? '2' : '1'
    }
    return initial.join('')
  })() : undefined
  return { puzzle, entries, eliminations: position?.eliminations,
    ...(hasAqre && { shades }) }
}

export async function playCandidates(game: Game, run: EngineRunner = runEngine, variantRules?: readonly VariantToolId[]) {
  if (game.sized && game.grid) return sizedRuleCandidates(game.sized, game.grid, valuesOf(game), game.position.eliminations, run)
  if (game.algebraic) return algebraicCandidates(game.algebraic, valuesOf(game), game.position.eliminations, run)
  if (game.grid) return miniCandidates(valuesOf(game), game.position.eliminations, run)
  if (!game.variant) return run({ type: 'notes', values: valuesOf(game) })
  try {
    const position = variantPosition(game.variant, game.position)
    if (variantRules) position.puzzle = puzzleForVariantTools(position.puzzle, variantRules)
    return await run({ type: 'variant', operation: 'candidates', position })
  } catch (error) {
    if (error instanceof EngineError && (error.code === 'conflict' || error.code === 'unsolvable')) return null
    throw error
  }
}

export async function variantHintOrder(puzzle: VariantPuzzle) {
  const disabled = new Set(readDisabledHintTechniques())
  return (await getVariantPlayOrder(puzzle)).filter((id) => !disabled.has(id))
}
