import { customRuleIds, selectedMarkerRules, type CustomDifficulty, type CustomRule, type MarkerRule } from './custom-modes.ts'
import { EngineError, withGenerationWorker, type VariantClueLayout, type VariantPuzzle, type VariantRule, type MarkedPairs } from './engine.ts'
import { EMPTY, type Game } from './game.ts'
import { regionIndex } from './region-sum.ts'
import { jigsawLayout, reflectVariant, variantSeeds } from './variant-generation.ts'
import { generatePlayableVariant, getVariantPlayOrder } from './variant-play.ts'
import { WINDOKU_REGIONS } from './variants.ts'

type Pair = [number, number]
const cells = Array.from({ length: 81 }, (_, cell) => cell)
const edges: Pair[] = cells.flatMap(cell => [
  ...(cell % 9 < 8 ? [[cell, cell + 1] as Pair] : []),
  ...(cell < 72 ? [[cell, cell + 9] as Pair] : []),
])
const neighbors = cells.map(cell => cells.filter(other => other !== cell &&
  Math.abs(cell % 9 - other % 9) <= 1 && Math.abs(Math.floor(cell / 9) - Math.floor(other / 9)) <= 1))
const triples = cells.flatMap(a => neighbors[a].flatMap(b => neighbors[b].filter(c => c !== a).map(c => [a, b, c] as const)))

function randomFor(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function sample<T>(values: readonly T[], count: number, random: () => number): T[] {
  const pool = [...values]
  for (let i = 0; i < count && i < pool.length; i++) {
    const other = i + Math.floor(random() * (pool.length - i))
    const value = pool[i]
    pool[i] = pool[other]
    pool[other] = value
  }
  return pool.slice(0, count)
}

const rayDirections = ['north-east', 'north-west', 'south-east', 'south-west'] as const
const rays = rayDirections.flatMap(direction => {
  const dr = direction.startsWith('north') ? -1 : 1
  const dc = direction.endsWith('east') ? 1 : -1
  return cells.filter(cell => {
    const row = Math.floor(cell / 9), col = cell % 9
    return row - dr < 0 || row - dr > 8 || col - dc < 0 || col - dc > 8
  }).map(cell => {
    const path = []
    for (let row = Math.floor(cell / 9), col = cell % 9; row >= 0 && row < 9 && col >= 0 && col < 9; row += dr, col += dc) path.push(row * 9 + col)
    return { type: 'outside', clue: 'little-killer', direction, cells: path } as const
  }).filter(ray => ray.cells.length >= 3 && ray.cells.length <= 7)
})

function modeTemplate(selected: ReadonlySet<CustomRule>, random: () => number) {
  const rules: VariantRule[] = []
  if (selected.has('diagonal') || selected.has('diagonal-main')) rules.push({ type: 'diagonal', diagonal: 'main' })
  if (selected.has('diagonal') || selected.has('diagonal-anti')) rules.push({ type: 'diagonal', diagonal: 'anti' })
  if (selected.has('windoku')) rules.push(...WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })))
  for (const type of ['anti-knight', 'anti-king', 'global-entropy'] as const) if (selected.has(type)) rules.push({ type })
  const whiteDots = selected.has('kropki') || selected.has('kropki-white')
  if (selected.has('non-consecutive')) rules.push({ type: 'non-consecutive',
    ...(whiteDots && { except: sample(edges, 26, random) }) })
  const regions = selected.has('jigsaw')
    ? reflectVariant({ version: 1, givens: EMPTY, regions: jigsawLayout(sample(variantSeeds.jigsaw.easy!, 1, random)[0].regions!) },
      Math.floor(random() * 8)).regions
    : undefined
  return { version: 1, givens: EMPTY, rules, ...(regions && { regions }) } satisfies VariantPuzzle
}

function addClues(template: VariantPuzzle, chosen: ReadonlySet<CustomRule>, markers: readonly MarkerRule[],
  negative: ReadonlySet<MarkerRule>, solution: string, difficulty: CustomDifficulty, random: () => number) {
  const rules = [...template.rules ?? []]
  const layouts: VariantClueLayout[] = []
  const digits = Array.from(solution, Number)

  function marks(rule: MarkerRule, matches: (a: number, b: number) => boolean, count: number, complete = false): MarkedPairs | undefined {
    if (!markers.includes(rule)) return
    const matching = edges.filter(([a, b]) => matches(digits[a], digits[b]))
    const all = negative.has(rule)
    return { pairs: all || complete ? matching : sample(matching, count, random), ...(all && { negative: true }) }
  }

  const nonConsecutive = chosen.has('non-consecutive')
  const ratioTwo = marks('kropki-black', (a, b) => a === 2 * b || b === 2 * a, 4)
  const consecutive = marks('kropki-white', (a, b) => Math.abs(a - b) === 1, 5, nonConsecutive)
  const five = marks('xv-five', (a, b) => a + b === 5, 4)
  const ten = marks('xv-ten', (a, b) => a + b === 10, 4)
  if ([consecutive, ratioTwo, five, ten].some(layer => layer && !layer.negative && !layer.pairs?.length)) return
  if (consecutive || ratioTwo) {
    if (nonConsecutive && consecutive) {
      const index = rules.findIndex(rule => rule.type === 'non-consecutive')
      // The construction template allowed extra edges. Keep precisely the
      // edges whose white dots actually permit consecutive digits.
      rules[index] = { type: 'non-consecutive', except: consecutive.pairs }
    }
    rules.push({ type: 'kropki', ...(consecutive && { consecutive }), ...(ratioTwo && { ratioTwo }) })
  }
  if (five || ten) rules.push({ type: 'xv', ...(five && { five }), ...(ten && { ten }) })
  if (chosen.has('adjacent-total')) {
    const totals = sample(edges.filter(([a, b]) => ![5, 10].includes(digits[a] + digits[b])), 5, random)
    if (!totals.length) return
    for (const pair of totals) layouts.push({ type: 'adjacent-total', cells: pair })
  }
  if (chosen.has('inequality')) for (const pair of sample(edges, 5, random)) layouts.push({ type: 'inequality', cells: pair })
  if (chosen.has('parity')) layouts.push({ type: 'parity', cells: sample(cells, 10, random) })
  if (chosen.has('quadruple')) for (const topLeft of sample(cells.filter(cell => cell % 9 < 8 && cell < 72), 6, random)) {
    layouts.push({ type: 'quadruple', topLeft, clueSize: 3 })
  }
  if (chosen.has('killer-cages')) {
    // Straight connected cages keep distinct digits because they lie in one house.
    const vertical = random() < 0.5
    const cages = Array.from({ length: 9 }, (_, line) => {
      const lengths = sample([2, 3, 4], 3, random)
      let start = 0
      return lengths.map(length => {
        const group = Array.from({ length }, (_, offset) => vertical ? 9 * (start + offset) + line : 9 * line + start + offset)
        start += length
        return group
      })
    }).flat()
    layouts.push({ type: 'killer-cages', cages, coverGrid: true })
  }
  if (chosen.has('clone')) {
    const groups = sample([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, random).map(digit => sample(cells.filter(cell => digits[cell] === digit), 2, random))
    rules.push({ type: 'clone', groups })
  }
  // These outside techniques are graded Hard. Medium grids use fewer clues so
  // the givens can uniquely determine the grid with lower-graded techniques.
  const outsideCount = difficulty === 'medium' ? 1 : 4
  for (const clue of ['sandwich', 'x-sum', 'skyscrapers'] as const) if (chosen.has(clue)) {
    for (const line of sample(cells.slice(0, 18), outsideCount, random)) {
      const horizontal = line < 9
      const reverse = random() < 0.5
      const path = Array.from({ length: 9 }, (_, i) => horizontal ? line * 9 + i : i * 9 + line - 9)
      if (reverse) path.reverse()
      layouts.push({ type: 'outside', clue, cells: path, direction: horizontal ? reverse ? 'west' : 'east' : reverse ? 'north' : 'south' })
    }
  }
  if (chosen.has('little-killer')) layouts.push(...sample(rays, 4, random))

  function addPaths(matches: (a: number, b: number, c: number, path: readonly number[]) => boolean,
    rule: (path: readonly [number, number, number]) => VariantRule) {
    const valid = triples.filter(path => matches(digits[path[0]], digits[path[1]], digits[path[2]], path))
    const available = sample(valid, valid.length, random)
    const used = new Set<number>()
    let added = 0
    for (const path of available) {
      if (path.some(cell => used.has(cell))) continue
      rules.push(rule(path))
      path.forEach(cell => used.add(cell))
      if (++added === 3) break
    }
    return added > 0
  }

  for (const type of ['thermometer', 'between', 'arrow', 'renban', 'palindrome', 'entropic', 'modular', 'region-sum', 'whispers', 'dutch-whispers'] as const) {
    if (!chosen.has(type)) continue
    if (!addPaths((a, b, c, path) => {
      switch (type) {
        case 'thermometer': return a < b && b < c
        case 'between': return Math.min(a, c) < b && b < Math.max(a, c)
        case 'arrow': return a === b + c
        case 'renban': return new Set([a, b, c]).size === 3 && Math.max(a, b, c) - Math.min(a, b, c) === 2
        case 'palindrome': return a === c
        case 'entropic': return new Set([a, b, c].map(digit => Math.floor((digit - 1) / 3))).size === 3
        case 'modular': return new Set([a % 3, b % 3, c % 3]).size === 3
        case 'whispers': case 'dutch-whispers': return Math.min(Math.abs(a - b), Math.abs(b - c)) >= (type === 'whispers' ? 5 : 4)
        case 'region-sum': {
          const [first, middle, last] = path.map(cell => regionIndex(cell, template.regions))
          return first === middle && middle !== last && a + b === c || first !== middle && middle === last && a === b + c
        }
      }
    }, path => type === 'arrow' ? { type, circle: path[0], cells: path.slice(1) }
      : type === 'whispers' || type === 'dutch-whispers' ? { type: 'whispers', cells: path, minDifference: type === 'whispers' ? 5 : 4 }
        : { type, cells: path })) return
  }

  return { puzzle: { ...template, givens: solution, rules }, layouts }
}

/** Generate a uniquely solvable puzzle at the requested grade with every selected rule. */
export async function generateCustomSudoku(rules: readonly CustomRule[], difficulty: CustomDifficulty, seed: number,
  games: readonly Game[], options: { negativeMarkers?: readonly MarkerRule[]; signal?: AbortSignal } = {}) {
  const { signal } = options
  signal?.throwIfAborted()
  const chosen = new Set(customRuleIds.filter(rule => rules.includes(rule)))
  if (!chosen.size) throw new EngineError('Choose at least one rule.', 'unsupported')
  const markers = selectedMarkerRules(rules)
  const negative = new Set(options.negativeMarkers?.filter(marker => markers.includes(marker)))
  const timeout = AbortSignal.timeout(10_000)
  const searchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const exhausted = () => new EngineError('No puzzle found for these rules at this difficulty.', 'search-limit')

  try {
    return await withGenerationWorker(searchSignal, async run => {
      const [only] = chosen
      if (!negative.size && chosen.size === 1 && Object.hasOwn(variantSeeds, only) && only !== 'whispers') {
        const family = only as keyof typeof variantSeeds
        if (variantSeeds[family][difficulty]?.length) return generatePlayableVariant(family, difficulty, seed, games, undefined, run)
      }

      const random = randomFor(seed)
      const techniqueOrder = await getVariantPlayOrder()
      const exclude = games.flatMap(game => game.variant ? [game.variant.puzzle] : [])
      const maxLayouts = negative.size ? 36 : difficulty === 'hard' ? 24 : 12
      for (let attempt = 0; attempt < maxLayouts; attempt++) {
        searchSignal.throwIfAborted()
        const template = modeTemplate(chosen, random)
        const samplingSeed = Math.floor(random() * 0x1_0000_0000)
        try {
          const solution = await run({ type: 'variant', operation: 'solve', position: { puzzle: template }, seed: samplingSeed, maxNodes: 20_000 })
          const clues = addClues(template, chosen, markers, negative, solution, difficulty, random)
          if (!clues) continue
          return await run({ type: 'generate-variant', seed: Math.floor(random() * 0x1_0000_0000), maxAttempts: 2,
            maxNodes: 20_000, template: clues.puzzle, derivedClues: clues.layouts,
            givens: [0, difficulty === 'easy' ? 40 : 35], difficulty, techniqueOrder, exclude })
        } catch (error) {
          if (!(error instanceof EngineError && ['search-limit', 'unsolvable', 'conflict'].includes(error.code ?? ''))) throw error
        }
      }
      throw exhausted()
    })
  } catch (error) {
    signal?.throwIfAborted()
    if (timeout.aborted) throw exhausted()
    throw error
  }
}
