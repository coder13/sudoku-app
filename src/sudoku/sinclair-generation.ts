import { generateClassic } from './classic-generation.ts'
import { difficultyIndex } from './difficulty.ts'
import { EngineError, runEngine, type Difficulty, type GeneratedVariant, type VariantGenerationRequest, type VariantPuzzle } from './engine.ts'
import type { Game } from './game.ts'
import { classicLayouts, jigsawRegions, killerCages, pairedLines } from './sinclair-layout.ts'
import { sinclairDistance, sinclairSelection as selection } from './sinclair-score.ts'
import type { TechniqueProgress } from './technique-progress.ts'
import { variantGenerationRequest, variantSeeds } from './variant-generation.ts'
import { getVariantPlayOrder } from './variant-play.ts'
import type { PlayableVariant } from './variants.ts'

export async function generateSinclairClassic(difficulty: Difficulty, seed: number, progress?: readonly TechniqueProgress[],
  previousPuzzles: readonly string[] = [], signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (difficulty === 'impossible') {
    const { generateImpossible } = await import('./sinclair-impossible.ts')
    const result = await generateImpossible(seed, progress, previousPuzzles, signal)
    if (result) return result
    signal?.throwIfAborted()
  }
  const original = await generateClassic(difficulty, seed, progress, previousPuzzles)
  const { techniqueOrder } = original.rating
  const layouts = new Map([[original.board, 'original']])
  const layoutLimit = difficultyIndex(difficulty) >= difficultyIndex('master') ? 1 : 3
  for (const grid of classicLayouts(original.board, seed, layoutLimit)) if (!layouts.has(grid)) layouts.set(grid, 'rearranged')
  // A new removal pattern on the same solution is a different puzzle. Reordering
  // rows and columns alone would preserve the original puzzle's abstract structure.
  if (difficultyIndex(difficulty) <= difficultyIndex('tricky') && (await runEngine({ type: 'capabilities' })).variants) {
    const solution = await runEngine({ type: 'solve', values: original.board }, { background: true })
    if (!solution) throw new Error('The generated grid has no solution.')
    const target = original.board.replaceAll('0', '').length
    const seen = previousPuzzles.length ? new Set(await runEngine({ type: 'canonical-puzzles', values: previousPuzzles })) : undefined
    for (let i = 0; i < 4; i++) {
      const sample = await attempt({ type: 'generate-variant', seed: (seed + Math.imul(i, 0x9e3779b9)) >>> 0,
        template: { version: 1, givens: solution }, maxAttempts: 1, maxNodes: 20_000, halfTurnClues: true,
        givens: [Math.max(17, target - 2), target], techniqueOrder: ['full-house', 'naked-single', 'hidden-single'],
      }, signal)
      if (!sample) continue
      const grid = sample.puzzle.givens
      if (seen && seen.has((await runEngine({ type: 'canonical-puzzles', values: [grid] }))[0])) continue
      if (!layouts.has(grid)) layouts.set(grid, 'paired-carving')
    }
  }
  let best
  let candidates = 0
  for (const [board, method] of layouts) {
    signal?.throwIfAborted()
    if (board !== original.board && !await runEngine({ type: 'accepts-difficulty', values: board, difficulty })) continue
    const { steps, rating } = await runEngine({ type: 'logical-solve', values: board, techniqueOrder }, { background: true })
    if (rating.status === 'stalled' || rating.status.solved !== difficulty || (original.focus && !rating.score.counts[original.focus])) continue
    const style = selection(method, { version: 1, givens: board }, sinclairDistance('classic', difficulty, steps))
    candidates++
    if (!best || style.rank < best.style.rank) best = { board, rating, canonical: rating, style }
  }
  if (!best) throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
  return { ...best, style: { ...best.style, candidates } }
}

function pairedRequest(id: PlayableVariant, request: VariantGenerationRequest) {
  const seed = request.seed
  request.maxNodes = 20_000
  request.halfTurnClues = true
  if (id === 'jigsaw') {
    request.template = { version: 1, givens: '0'.repeat(81), regions: { type: 'jigsaw', regions: jigsawRegions(seed) } }
  } else if (id === 'killer-cages') {
    request.derivedClues = [{ type: 'killer-cages', cages: killerCages(seed), coverGrid: true }]
  } else if (id === 'thermometer' || id === 'arrow') {
    const solution = request.template.givens
    request.template = { version: 1, givens: solution, rules: pairedLines(id, seed, solution, request.template.rules?.length ?? 6) }
  }
  return request
}

// Move an orphan given beside its rotated partner, or add a missing partner. An exact
// mask lets the engine certify these cheap edits with the same contract as fresh generation.
function* editedMasks(grid: string, seed: number) {
  const mask = [...grid].map(d => d === '0' ? '0' : '1')
  const orphans = mask.flatMap((v, i) => v === '1' && mask[80-i] === '0' ? [i] : [])
  const optional = mask.flatMap((v, i) => v === '0' && i < 40 && mask[80-i] === '0' ? [i] : [])
  const length = orphans.length
  const start = seed % Math.max(1, length)
  for (let i = 0; i < Math.min(5, length); i++) {
    const a = orphans[(start + i) % length]
    const next = [...mask]
    next[80-a] = '1'
    yield next.join('')
    if (length > 1) {
      const b = orphans[(start + i + 1 + seed % (length - 1)) % length]
      next[b] = '0'
      yield next.join('')
    }
  }
  for (let i = 0; i < Math.min(3, optional.length); i++) {
    const a = optional[(seed + i) % optional.length]
    const next = [...mask]
    next[a] = next[80-a] = '1'
    yield next.join('')
  }
}

async function attempt(request: VariantGenerationRequest, signal?: AbortSignal) {
  signal?.throwIfAborted()
  try { return await runEngine(request) }
  catch (error) {
    if (error instanceof EngineError && error.code === 'search-limit') return undefined
    throw error
  }
}

export async function generateSinclairVariant(id: PlayableVariant, difficulty: Difficulty, seed: number,
  games: readonly Game[], signal?: AbortSignal) {
  const order = await getVariantPlayOrder()
  const recipes = variantSeeds[id][difficulty]
  if (!recipes?.length) throw new EngineError('This difficulty is unavailable for this variant.', 'unsupported')
  const exclude = games.flatMap(g => g.variant?.id === id ? [g.variant.puzzle] : [])
  let best: { generated: GeneratedVariant; style: ReturnType<typeof selection> } | undefined
  let candidates = 0
  async function consider(generated: GeneratedVariant, method: string) {
    signal?.throwIfAborted()
    const { steps } = await runEngine({ type: 'variant', operation: 'trace',
      position: { puzzle: generated.puzzle }, techniqueOrder: order }, { background: true })
    const style = selection(method, generated.puzzle, sinclairDistance(id, difficulty, steps))
    if (!best || style.rank < best.style.rank) best = { generated, style }
    candidates++
    exclude.push(generated.puzzle)
  }
  function edits(parent: GeneratedVariant): VariantGenerationRequest {
    return { type: 'generate-variant', seed, maxAttempts: 1, maxNodes: 20_000,
      template: { ...parent.puzzle, givens: parent.solution }, requiredRule: id === 'windoku' ? 'extra-house' : id,
      givens: [0, parent.givens], difficulty, techniqueOrder: order, exclude }
  }
  const first = (seed >>> 0) % recipes.length
  for (let i = 0; i < 3; i++) {
    const recipe = recipes[(first + i) % recipes.length]
    const nextSeed = (seed + Math.imul(i, 0x9e3779b9)) >>> 0
    const request = pairedRequest(id, variantGenerationRequest(id, difficulty, recipe, order, nextSeed))
    const fresh = await attempt({ ...request, exclude }, signal)
    if (fresh) await consider(fresh, 'paired-carving')
  }
  // Calibrated seeds also give rare grades an editable, unique starting position.
  // History exclusions apply to the child, so replaying a parent can still yield a new puzzle.
  for (let i = 0; candidates < 3 && i < recipes.length; i++) {
    const recipe = recipes[(first + i) % recipes.length]
    const base = variantGenerationRequest(id, difficulty, recipe, order)
    const parent = await attempt(base, signal)
    if (!parent) continue
    const certify = { ...edits(parent), givens: base.givens }
    for (const givenMask of editedMasks(parent.puzzle.givens, (seed + i) >>> 0)) {
      const edited = await attempt({ ...certify, givenMask }, signal)
      if (edited) await consider(edited, 'edited-givens')
      if (candidates >= 3) break
    }
    if (candidates === 0) {
      const original = await attempt({ ...certify, maxNodes: undefined, givenMask: parent.puzzle.givens.replace(/[1-9]/g, '1') }, signal)
      if (original) await consider(original, 'recipe')
    }
    if (candidates > 0) break
  }
  if (!best) throw new EngineError('No unseen puzzle found for this difficulty.', 'search-limit')
  // Continue improving a weak starting layout while a certified edit improves the rank.
  // Fixed clue counts also protect the upper limit of the originating recipe.
  const rounds = difficultyIndex(difficulty) >= difficultyIndex('master') ? 1 : 3
  for (let round = 0; round < rounds && best.style.pairing.score < .82; round++) {
    const parent = best.generated, request = edits(parent)
    let tried = 0
    for (const givenMask of editedMasks(parent.puzzle.givens, (seed + 17 * (round + 1)) >>> 0)) {
      if (givenMask.split('1').length - 1 !== parent.givens) continue
      if (++tried > 5) break
      const edited = await attempt({ ...request, givenMask }, signal)
      if (edited) {
        await consider(edited, 'edited-givens')
        if (best.generated !== parent) break
      }
    }
    if (best.generated === parent) break
  }
  return { ...best.generated, style: { ...best.style, candidates } }
}
