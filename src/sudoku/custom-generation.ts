import { customRuleIds, ruleSelectionConflict, selectedMarkerRules, type CustomDifficulty, type CustomRule, type MarkerRule } from './custom-modes.ts'
import { EngineError, withGenerationWorker, type EngineRunner, type VariantClueLayout, type VariantPuzzle, type VariantRule, type MarkedPairs } from './engine.ts'
import { EMPTY, type Game } from './game.ts'
import { connectedGridCells } from './grid.ts'
import { regionIndex } from './region-sum.ts'
import { jigsawLayout, reflectVariant, variantSeeds } from './variant-generation.ts'
import { tryVariantRecipe, getVariantPlayOrder } from './variant-play.ts'
import { quadrupleCells, WINDOKU_REGIONS } from './variants.ts'
import { difficultyIndex } from './difficulty.ts'
import { miracleSymmetry, offersMiracle } from './miracle.ts'
import { markerTrade } from './marker-construction.ts'

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
  return { version: 1, extendedLogic: true, givens: EMPTY, rules, ...(regions && { regions }),
    ...((regions || selected.has('global-entropy')) && { logicVersion: 29 }) } satisfies VariantPuzzle
}

// This cyclic completion obeys all three Chess rules. Its rotations,
// reflections and cyclic digit shifts still have no adjacent 1 and 9.
// Use alternating unrestricted samples for modes with additional global rules.
function chessAnchor(shift: number, transform: number) {
  const givens = cells.map(cell => {
    const row = Math.floor(cell / 9), col = cell % 9
    return 1 + (18 + 4 * col - 3 * (row % 3) + 5 * Math.floor(row / 3) + shift) % 9
  }).join('')
  return reflectVariant({ version: 1, givens }, transform).givens
}

// With zero givens, row-only partitions can leave two columns interchangeable.
// Grow cages across shared edges, keeping distinct digits and at least two cells per cage.
function miracleCages(digits: readonly number[], random: () => number) {
  const cages = cells.map(c => [c])
  const owner = [...cells]
  let total = cells.length
  const target = 29 + Math.floor(random() * 11)
  const maxSize = 3 + Math.floor(random() * 3)
  function merge(a: number, b: number) {
    const left = cages[owner[a]], right = cages[owner[b]]
    if (left === right || left.length + right.length > maxSize || right.some(c => left.some(d => digits[d] === digits[c]))) return
    for (const c of right) owner[c] = owner[a]
    left.push(...right)
    right.length = 0
    total--
  }
  for (const [a, b] of sample(edges, edges.length, random)) {
    if (cages[owner[a]].length === 1 && cages[owner[b]].length === 1) merge(a, b)
  }
  for (const [a, b] of sample(edges, edges.length, random)) {
    if (cages[owner[a]].length === 1 || cages[owner[b]].length === 1) merge(a, b)
  }
  if (cages.some(cage => cage.length === 1)) return
  for (const [a, b] of sample(edges, edges.length, random)) {
    if (total <= target) break
    merge(a, b)
  }
  return cages.filter(cage => cage.length)
}

function addClues(template: VariantPuzzle, chosen: ReadonlySet<CustomRule>, markers: readonly MarkerRule[],
  negative: ReadonlySet<MarkerRule>, solution: string, difficulty: CustomDifficulty, random: () => number,
  method: 'ordinary' | 'miracle' | 'exchange',
  alternative?: readonly number[]) {
  const rules = [...template.rules ?? []]
  const layouts: VariantClueLayout[] = []
  const digits = Array.from(solution, Number)
  // Vary clue coverage across layouts. Dense clues can give a zero-given
  // puzzle its opening. In combinations, leave room for the companion rules.
  const miracle = method === 'miracle'
  const coverage = miracle ? (0.55 + 0.45 * random()) / Math.sqrt(chosen.size) : 0
  const count = (usual: number, total: number) => method === 'exchange' ? 1 : Math.max(usual, Math.ceil(coverage * total))

  function marks(rule: MarkerRule, matches: (a: number, b: number) => boolean, usual: number, complete = false): MarkedPairs | undefined {
    if (!markers.includes(rule)) return
    const matching = edges.filter(([a, b]) => matches(digits[a], digits[b]) && (!alternative || matches(alternative[a], alternative[b])))
    const all = negative.has(rule)
    const size = method === 'exchange' ? 1
      : !all && !complete && chosen.size > 1 && negative.size ? 1 + Math.floor(random() * usual) : usual
    return { pairs: all || complete ? matching : sample(matching, Math.max(size, Math.ceil(coverage * matching.length)), random), ...(all && { negative: true }) }
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
    const totals = sample(edges.filter(([a, b]) => ![5, 10].includes(digits[a] + digits[b])), count(5, 85), random)
    if (!totals.length) return
    for (const pair of totals) layouts.push({ type: 'adjacent-total', cells: pair })
  }
  if (chosen.has('inequality')) for (const pair of sample(edges, count(5, edges.length), random)) layouts.push({ type: 'inequality', cells: pair })
  if (chosen.has('parity')) layouts.push({ type: 'parity', cells: sample(cells, count(10, 81), random) })
  if (chosen.has('quadruple')) for (const topLeft of sample(cells.filter(cell => cell % 9 < 8 && cell < 72), count(6, 48), random)) {
    layouts.push({ type: 'quadruple', topLeft, clueSize: 3 })
  }
  if (chosen.has('killer-cages') && miracle) {
    const cages = miracleCages(digits, random)
    if (!cages) return
    layouts.push({ type: 'killer-cages', cages, coverGrid: true })
  } else if (chosen.has('killer-cages')) {
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
    const groups = sample([1, 2, 3, 4, 5, 6, 7, 8, 9], method === 'exchange' ? 1 : 3, random)
      .map(digit => sample(cells.filter(cell => digits[cell] === digit), 2, random))
    rules.push({ type: 'clone', groups })
  }
  // One outside clue leaves room for a Medium technique to set the grade.
  // Simple facts at the edge remain available at the lower grades.
  const outsideCount = count(difficulty === 'medium' ? 1 : 4, 18)
  for (const clue of ['sandwich', 'x-sum', 'skyscrapers'] as const) if (chosen.has(clue)) {
    for (const line of sample(cells.slice(0, 18), outsideCount, random)) {
      const horizontal = line < 9
      const reverse = random() < 0.5
      const path = Array.from({ length: 9 }, (_, i) => horizontal ? line * 9 + i : i * 9 + line - 9)
      if (reverse) path.reverse()
      layouts.push({ type: 'outside', clue, cells: path, direction: horizontal ? reverse ? 'west' : 'east' : reverse ? 'north' : 'south' })
      if (miracle && clue !== 'sandwich') layouts.push({ type: 'outside', clue, cells: [...path].reverse(),
        direction: horizontal ? reverse ? 'east' : 'west' : reverse ? 'south' : 'north' })
    }
  }
  if (chosen.has('little-killer')) layouts.push(...sample(rays, count(4, rays.length), random))

  function addPaths(matches: (a: number, b: number, c: number, path: readonly number[]) => boolean,
    rule: (path: readonly [number, number, number]) => VariantRule) {
    const valid = triples.filter(path => matches(digits[path[0]], digits[path[1]], digits[path[2]], path))
    const available = sample(valid, valid.length, random)
    if (alternative) {
      const survives = ([a, b, c]: readonly [number, number, number]) => Number(matches(alternative[a], alternative[b], alternative[c], [a, b, c]))
      available.sort((left, right) => survives(left) - survives(right))
    }
    const used = new Set<number>()
    let added = 0
    for (const path of available) {
      if (miracle ? path.every(cell => used.has(cell)) : path.some(cell => used.has(cell))) continue
      rules.push(rule(path))
      path.forEach(cell => used.add(cell))
      if (++added === count(3, 56)) break
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

const globalRules = new Set<CustomRule>(['diagonal', 'diagonal-main', 'diagonal-anti', 'windoku', 'jigsaw',
  'anti-king', 'anti-knight', 'non-consecutive', 'global-entropy'])

// Exchanging equal digits across a boundary preserves the digits in both regions.
function exchangeRegions(solution: string, random: () => number) {
  const regions = Array.from({ length: 9 }, (_, i) => cells.filter(c => regionIndex(c) === i))
  const owner = cells.map(c => regionIndex(c))
  const changed = new Set<number>()
  const pairs = cells.flatMap(a => cells.filter(b => b > a && solution[a] === solution[b]).map(b => [a, b] as const))
  const target = 1 + Math.floor(random() * 5)
  for (const [a, b] of sample(pairs, pairs.length, random)) {
    const i = owner[a], j = owner[b]
    if (i === j || changed.has(a) || changed.has(b)) continue
    const left = regions[i].map(c => c === a ? b : c)
    const right = regions[j].map(c => c === b ? a : c)
    if (!connectedGridCells(left, 9) || !connectedGridCells(right, 9)) continue
    regions[i] = left
    regions[j] = right
    owner[a] = j
    owner[b] = i
    changed.add(a)
    changed.add(b)
    if (changed.size === 2 * target) break
  }
  return changed.size ? { type: 'jigsaw' as const, regions } : undefined
}

function clueCells(clue: VariantRule | VariantClueLayout): readonly number[] {
  switch (clue.type) {
    case 'arrow': return [clue.circle, ...clue.cells]
    case 'clone': return clue.groups.flat()
    case 'quadruple': return quadrupleCells(clue.topLeft)
    case 'kropki': return [...clue.consecutive?.pairs ?? [], ...clue.ratioTwo?.pairs ?? []].flat()
    case 'xv': return [...clue.five?.pairs ?? [], ...clue.ten?.pairs ?? []].flat()
    case 'killer-cages': return clue.cages.flatMap(cage => 'cells' in cage ? cage.cells : cage)
    default: return 'cells' in clue ? clue.cells : []
  }
}

/** Replace a different given for each drawn rule, keeping the original completion. */
export function exchangeVariantGivens(selected: readonly CustomRule[], givens: string, solution: string, seed: number) {
  if (selected.some(rule => globalRules.has(rule) && rule !== 'jigsaw')) return
  const random = randomFor(seed)
  const template: VariantPuzzle = { version: 1, extendedLogic: true, givens: solution, rules: [] }
  const rules: VariantRule[] = []
  const derivedClues: VariantClueLayout[] = []
  const removed = new Set<number>()
  if (selected.includes('jigsaw')) {
    template.logicVersion = 29
    template.regions = exchangeRegions(solution, random)
    if (!template.regions) return
    removed.add(sample(cells.filter(c => givens[c] !== '0'), 1, random)[0])
  }
  for (const rule of selected) {
    if (rule === 'jigsaw') continue
    const clues = addClues(template, new Set([rule]), selectedMarkerRules([rule]), new Set(),
      solution, 'impossible', random, 'exchange')
    if (!clues) return
    const covered = new Set([...clues.puzzle.rules, ...clues.layouts].flatMap(clueCells))
    const available = [...covered].filter(cell => givens[cell] !== '0' && !removed.has(cell))
    if (!available.length) return
    removed.add(sample(available, 1, random)[0])
    rules.push(...clues.puzzle.rules)
    derivedClues.push(...clues.layouts)
  }
  const givenCells = cells.filter(cell => givens[cell] !== '0' && !removed.has(cell))
  return { template: { ...template, rules }, derivedClues, givenCells, givens: givenCells.length }
}

async function checkedTemplates(chosen: ReadonlySet<CustomRule>, negative: ReadonlySet<MarkerRule>,
  difficulty: CustomDifficulty, miracle: boolean, seed: number): Promise<VariantPuzzle[]> {
  const { checkedVariantPuzzles } = await import('./checked-variant-puzzles.ts')
  const antiXSums = miracle && chosen.size === 2 && chosen.has('diagonal-anti') && chosen.has('x-sum')
  const rules = antiXSums ? 'diagonal-main,x-sum' : [...chosen].sort().join(',')
  const markings = negative.size ? '/negative=' + [...negative].sort().join(',') : ''
  const key = rules + (miracle ? '/miracle' : '') + markings
  const bank = checkedVariantPuzzles[key]?.[difficulty] ?? []
  return bank.map((_, offset) => {
    const item = bank[((seed >>> 0) + offset) % bank.length]
    const template: VariantPuzzle = { version: 1, extendedLogic: true, givens: item.givens, rules: item.rules,
      ...(item.regions && { regions: jigsawLayout(item.regions) }),
      ...((item.regions || chosen.has('global-entropy')) && { logicVersion: 29 }) }
    return antiXSums ? reflectVariant(template, 2) : template
  })
}

/** Generate a uniquely solvable puzzle at the requested grade with every selected rule. */
export async function generateCustomSudoku(rules: readonly CustomRule[], difficulty: CustomDifficulty, seed: number,
  games: readonly Game[], options: { negativeMarkers?: readonly MarkerRule[]; signal?: AbortSignal; miracle?: boolean } = {}, recipeRunner?: EngineRunner) {
  const { signal } = options
  signal?.throwIfAborted()
  const chosen = new Set(customRuleIds.filter(rule => rules.includes(rule)))
  if (!chosen.size) throw new EngineError('Choose at least one rule.', 'unsupported')
  if (rules.some(rule => !chosen.has(rule))) throw new EngineError('This mode includes an unknown rule.', 'unsupported')
  const markers = selectedMarkerRules(rules)
  const negative = new Set(options.negativeMarkers?.filter(marker => markers.includes(marker)))
  const conflict = ruleSelectionConflict([...chosen], [...negative])
  if (conflict) throw new EngineError(conflict, 'unsupported')
  const miracle = options.miracle === true
  if (miracle) {
    if (!offersMiracle(difficulty, rules)) throw new EngineError('Miracle puzzles start at Hard.', 'unsupported')
    const reason = miracleSymmetry(rules)
    if (reason) throw new EngineError(reason, 'unsupported')
  }
  const timeout = AbortSignal.timeout(15_000)
  const searchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const exhausted = () => new EngineError(`No ${difficulty} puzzle found for these rules.`, 'search-limit')

  try {
    return await withGenerationWorker(searchSignal, async run => {
      const [only] = chosen
      const family = only === 'dutch-whispers' ? 'whispers' : only
      const requiredRules = [...chosen].map(rule => rule === 'windoku' ? 'extra-house' : rule === 'whispers' ? 'german-whispers' : rule)
      const exclude = games.flatMap(game => game.variant ? [game.variant.puzzle] : [])
      for (const template of await checkedTemplates(chosen, negative, difficulty, miracle, seed)) {
        const givenCells = cells.filter(c => template.givens[c] !== '0')
        if ((givenCells.length === 0) !== miracle) continue
        try {
          // The request seed rotates the layouts. A fixed search order reproduces each certificate.
          return await run({ type: 'generate-variant', template, givens: givenCells.length, givenCells,
            difficulty, maxAttempts: 1, maxNodes: 20_000, seed: 7, requiredRules,
            techniqueOrder: await getVariantPlayOrder(template),
            exclude: exclude.filter(p => p.givens.replaceAll('0', '').length === givenCells.length) })
        } catch (error) {
          if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
        }
      }
      if (!miracle && !negative.size && chosen.size === 1 && Object.hasOwn(variantSeeds, family)) {
        const calibrated = await tryVariantRecipe(family as keyof typeof variantSeeds, difficulty, seed, games,
          { ruleset: only === 'dutch-whispers' ? 'dutch' : undefined, signal: searchSignal }, recipeRunner ?? run)
        if (calibrated) return calibrated
      }

      const random = randomFor(seed)
      const hardOrHigher = difficultyIndex(difficulty) >= difficultyIndex('hard')
      const chess = chosen.has('anti-king') && chosen.has('anti-knight') && chosen.has('non-consecutive') && !markers.includes('kropki-white')
      const pureChess = chess && chosen.size === 3
      const exchange = difficulty === 'impossible' && !miracle && !negative.size && rules.every(rule => rule === 'jigsaw' || !globalRules.has(rule))
      const templates = exchange ? await run({ type: 'impossible-templates' }) : []
      // Higher target grades need more layouts, especially when every edge is marked.
      const maxLayouts = negative.size && chosen.size > 1 ? 360 : miracle || hardOrHigher ? 72 : 36
      for (let attempt = 0; attempt < maxLayouts; attempt++) {
        searchSignal.throwIfAborted()
        const template = modeTemplate(chosen, random)
        const samplingSeed = Math.floor(random() * 0x1_0000_0000)
        try {
          if (templates.length && attempt % 3 !== 2) {
            const board = templates[Math.floor(random() * templates.length)]
            const solution = await run({ type: 'solve', values: board })
            const exchanged = solution && exchangeVariantGivens([...chosen], board, solution, samplingSeed)
            if (!exchanged) continue
            return await run({ type: 'generate-variant', ...exchanged, seed: samplingSeed, maxAttempts: 1,
              maxNodes: 20_000, difficulty, requiredRules, exclude,
              techniqueOrder: await getVariantPlayOrder(exchanged.template, exchanged.derivedClues) })
          }
          let sampling: VariantPuzzle = template
          if (chess && (pureChess || attempt % 2 === 0)) {
            const shift = Math.floor(random() * 9)
            const transform = Math.floor(random() * 8)
            sampling = { ...template, givens: chessAnchor(shift, transform) }
          } else if (chosen.size > 1 && negative.has('kropki-white') && !chosen.has('non-consecutive') && attempt % 3 === 1) {
            // A full white-dot layout sampled from an unrestricted grid can
            // determine the entire solution before the companion clues matter.
            // Fewer consecutive edges leave room for those other deductions.
            sampling = { ...template, rules: [...template.rules, { type: 'non-consecutive', except: sample(edges, 8 + attempt % 24, random) }] }
          }
          const solution = await run({ type: 'variant', operation: 'solve', position: { puzzle: sampling }, seed: samplingSeed, maxNodes: 20_000 })
          const trade = negative.size && chosen.has('arrow') && !template.rules.length && !template.regions
            ? markerTrade(solution, negative, edges, random) : undefined
          const clues = addClues(template, chosen, markers, negative, trade?.solution ?? solution, difficulty, random,
            miracle ? 'miracle' : 'ordinary', trade?.alternative)
          if (!clues) continue
          const techniqueOrder = await getVariantPlayOrder(clues.puzzle, clues.layouts)
          // The pure Chess rules allow only 72 labelled completions with no
          // givens. Sparse starting patterns can already be unique. Testing
          // one count skips many dense intermediates that use only singles.
          let givens: number | readonly [number, number] = miracle ? 0 : [1, hardOrHigher ? 32 : 40]
          if (pureChess && (hardOrHigher || difficulty === 'tricky') && attempt % 6 !== 5) givens = 3 + Math.floor(random() * 10)
          else if (pureChess && difficulty === 'beginner' && attempt % 3 === 1) givens = 26 + Math.floor(random() * 15)
          return await run({ type: 'generate-variant', seed: Math.floor(random() * 0x1_0000_0000), maxAttempts: 2,
            maxNodes: 20_000, template: clues.puzzle, derivedClues: clues.layouts,
            givens, thinClues: miracle, requiredRules, difficulty, techniqueOrder, exclude })
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
