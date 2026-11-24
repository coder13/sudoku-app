import { difficultyIndex, SINGLE_TECHNIQUES } from './difficulty.ts'
import { EngineError, type EngineRunner, type GeneratedPuzzle, type TechniqueCatalog, type VariantPracticeExercise, type VariantPuzzle } from './engine.ts'
import { practiceBases } from './practice-bases.ts'
import { reflectVariant } from './variant-generation.ts'

const singles = new Set(SINGLE_TECHNIQUES)

// Variant trainers whose rules and givens support a verified opening in Play.
const variantPractice: Readonly<Record<string, 'singles' | 'fallback' | { singles: boolean; seeds: readonly number[] }>> = {
  'adjacent-total': 'singles',
  'anti-king': 'fallback',
  'anti-knight': 'singles',
  arrow: 'singles',
  between: { singles: true, seeds: [3, 26, 33] },
  'cage-combinations': 'singles',
  'cage-house-sum': 'singles',
  clone: 'singles',
  'consecutive-run': { singles: true, seeds: [12] },
  'digit-order': { singles: true, seeds: [12, 140, 153, 316, 323] },
  'digit-restriction': { singles: true, seeds: [27, 31] },
  'entropy-quadruple': 'singles',
  entropic: 'singles',
  'global-entropy': 'fallback',
  'group-line-house-support': 'singles',
  'group-order-contradiction': 'singles',
  'group-order-elimination': 'fallback',
  inequality: 'singles',
  'inside-grid': { singles: true, seeds: [14, 25] },
  kropki: { singles: true, seeds: [1, 13, 15, 43] },
  'kropki-house-support': { singles: true, seeds: [100, 184, 351] },
  'little-killer': 'singles',
  'locked-candidates': { singles: false, seeds: [13, 16] },
  'matching-digit-contradiction': 'fallback',
  modular: 'singles',
  'non-consecutive': 'singles',
  'non-consecutive-bivalue': 'fallback',
  'non-consecutive-locked-candidates-2': 'fallback',
  'non-consecutive-locked-candidates-3': 'fallback',
  'non-consecutive-trivalue': { singles: false, seeds: [48, 129, 177, 269, 310, 347] },
  palindrome: 'singles',
  parity: 'singles',
  quadruple: { singles: true, seeds: [9] },
  'region-sum': 'singles',
  'region-sum-distinct': { singles: false, seeds: [12] },
  'region-sum-house': 'singles',
  renban: 'singles',
  'renban-group-counts': 'fallback',
  'renban-house-support': { singles: true, seeds: [14, 25, 44] },
  'renban-locked-digit': { singles: true, seeds: [3, 4, 8, 16] },
  'renban-sum-house': { singles: false, seeds: [27, 34, 39, 47] },
  'renban-sum-ray-houses': { singles: false, seeds: [20] },
  sandwich: { singles: true, seeds: [5] },
  skyscrapers: { singles: true, seeds: [10, 13, 25, 32] },
  thermometer: 'singles',
  'thermometer-house-support': 'singles',
  whispers: 'singles',
  'x-sum': 'singles',
  xv: 'singles',
}

export function hasVariantPracticePuzzles(technique: unknown): boolean {
  return typeof technique === 'string' && Object.hasOwn(variantPractice, technique)
}

export function hasPracticePuzzles(technique: unknown): technique is string {
  return typeof technique === 'string' && (Object.hasOwn(practiceBases, technique) || hasVariantPracticePuzzles(technique))
}

function difficultyRank({ difficulty, cost }: TechniqueCatalog['techniques'][number]) {
  return difficultyIndex(difficulty) * 10_000 + cost
}

export function practiceTechniqueOrder(catalog: TechniqueCatalog, technique: string): readonly string[] {
  const { defaultOrder, techniques } = catalog
  const index = defaultOrder.indexOf(technique)
  const focus = practiceBases[technique]?.focus
  if (index >= 0 && !focus) return defaultOrder.slice(0, index + 1)

  const target = techniques.find(({ id }) => id === technique)
  if (!target) return []
  const byId = new Map(techniques.map(item => [item.id, item]))
  const before = defaultOrder.filter(id => id !== technique && byId.has(id) && difficultyRank(byId.get(id)!) <= difficultyRank(target))
  if (focus === 'opening') return [technique, ...before]
  if (focus === 'after-singles') {
    return [...before.filter(id => singles.has(id)), technique, ...before.filter(id => !singles.has(id))]
  }
  const afterTarget = defaultOrder.findIndex(id => byId.has(id) && difficultyRank(byId.get(id)!) > difficultyRank(target))
  return [...(afterTarget < 0 ? defaultOrder : defaultOrder.slice(0, afterTarget)), technique]
}

export async function generatePracticePuzzle(
  technique: string, seed: number, exclude: readonly string[], run: EngineRunner,
): Promise<GeneratedPuzzle> {
  if (!Object.hasOwn(practiceBases, technique)) throw new Error('Full puzzles are unavailable for this technique.')
  const bases = practiceBases[technique]
  const techniqueOrder = practiceTechniqueOrder(await run({ type: 'techniques' }), technique)
  if (!techniqueOrder.length) throw new Error('Full puzzles are unavailable for this technique.')
  const seen = new Set(exclude)
  for (const [templates, preferSingles] of [[bases.singles, true], [bases.fallback, false]] as const) {
    if (!templates?.length) continue
    const start = seed % templates.length
    // Try a small change to the givens before falling back to digit and grid permutations.
    for (const extraGivens of [1, 0]) {
      for (let i = 0; i < Math.max(8, templates.length * 2); i++) {
        const template = templates[(start + i) % templates.length]
        const givens = 81 - (template.match(/0/g)?.length ?? 0)
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        try {
          const puzzle = await run({
            type: 'generate-constrained', seed, maxAttempts: 4, clues: [givens, givens + extraGivens],
            templates: [template], technique: { id: technique, mode: 'first' }, techniqueOrder,
            score: [0, 10_000], includeRating: true,
          })
          const { counts, hardest } = puzzle.rating.score
          if (seen.has(puzzle.board) || puzzle.rating.status === 'stalled' || hardest !== technique) continue
          if (preferSingles && ((!singles.has(technique) && counts[technique] !== 1) ||
            Object.keys(counts).some(id => id !== technique && !singles.has(id)))) continue
          if (bases.focus === 'opening' && (await run({
            type: 'rate', values: puzzle.board, techniqueOrder: SINGLE_TECHNIQUES,
          })).status !== 'stalled') continue
          return puzzle
        } catch (error) {
          if (!(error instanceof EngineError) || error.code !== 'search-limit') throw error
        }
      }
    }
  }
  throw new Error('Could not generate a practice puzzle. Try again.')
}

export async function variantPracticeTechniqueOrder(technique: string, run: EngineRunner) {
  const variant = await run({ type: 'techniques', variant: true })
  const classic = await run({ type: 'techniques' })
  const catalog = new Map([...classic.techniques, ...variant.techniques].map(item => [item.id, item]))
  const target = catalog.get(technique)
  if (!target) return []
  const order = new Set([...variant.defaultOrder, ...classic.defaultOrder])
  return [...SINGLE_TECHNIQUES, technique, ...[...order].filter(id => {
    const item = catalog.get(id)
    return item && id !== technique && !singles.has(id) && !id.startsWith('direct-') &&
      difficultyRank(item) <= difficultyRank(target)
  })]
}

export async function generateVariantPracticePuzzle(
  technique: string, seed: number, exclude: readonly VariantPuzzle[], run: EngineRunner,
) {
  if (!hasVariantPracticePuzzles(technique)) throw new Error('Full puzzles are unavailable for this technique.')
  const techniqueOrder = await variantPracticeTechniqueOrder(technique, run)
  const seen = new Set(exclude.map(puzzle => JSON.stringify(puzzle)))
  const current = exclude.length ? JSON.stringify(exclude[0]) : undefined
  const plan = variantPractice[technique]
  const preferSingles = typeof plan === 'string' ? plan === 'singles' : plan.singles
  let fallback: VerifiedVariantPractice | undefined
  let earlierPuzzle: VerifiedVariantPractice | undefined
  const withPlacements = (givens: string, entries: string) =>
    [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')

  async function verifyPuzzle(puzzle: VariantPuzzle) {
    try {
      const start = await run({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: SINGLE_TECHNIQUES })
      if (start.rating.status !== 'stalled') return
      puzzle = { ...puzzle, givens: withPlacements(puzzle.givens, start.end.entries) }
      const path = await run({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder })
      const { rating } = path
      if (path.steps[0]?.technique !== technique || rating.hardest !== technique || rating.status === 'stalled') return
      const verified = await run({ type: 'variant', operation: 'solve-unique', position: { puzzle } })
      if (verified.status !== 'unique') return
      return { puzzle, rating, solution: verified.solution, followedBySingles: path.steps.slice(1).every(step => singles.has(step.technique)) }
    } catch (error) {
      if (!(error instanceof EngineError) || !['conflict', 'unsolvable', 'search-limit'].includes(error.code ?? '')) throw error
    }
  }

  function verifyExercise({ position }: VariantPracticeExercise) {
    return verifyPuzzle({ ...position.puzzle, givens: withPlacements(position.puzzle.givens, position.entries) })
  }

  type VerifiedVariantPractice = NonNullable<Awaited<ReturnType<typeof verifyPuzzle>>>

  function accept(result: VerifiedVariantPractice | undefined) {
    if (!result) return
    const key = JSON.stringify(result.puzzle)
    if (seen.has(key)) {
      if (key !== current && (!earlierPuzzle || result.followedBySingles)) earlierPuzzle = result
      return
    }
    if (result.followedBySingles || !preferSingles) return result
    fallback ??= result
  }

  async function generateExercise(exampleSeed: number) {
    try {
      return await run({ type: 'generate-practice-example', variant: true, technique, seed: exampleSeed, exclude: '0'.repeat(81) })
    } catch (error) {
      if (!(error instanceof EngineError) || !['invalid-lesson', 'search-limit'].includes(error.code ?? '')) throw error
    }
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const exercise = await generateExercise(seed)
    if (!exercise) continue
    const result = accept(await verifyExercise(exercise))
    if (result) return result
  }

  const seeded = typeof plan === 'string' ? [] : await Promise.all(plan.seeds.map(generateExercise))
  const examples = [...seeded.filter(example => example !== undefined), ...await run({ type: 'practice-examples', technique, variant: true })]
  const bases = (await Promise.all(examples.map(verifyExercise))).filter(base => base !== undefined)
  for (const base of bases) {
    for (let i = 0; i < 8; i++) {
      const puzzle = reflectVariant(base.puzzle, (seed + i) % 8)
      const result = accept(await verifyPuzzle(puzzle))
      if (result) return result
    }
  }
  const next = fallback ?? earlierPuzzle
  if (next) return next
  throw new Error('Could not generate a practice puzzle. Try again.')
}
