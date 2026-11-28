import { customRuleIds, ruleSelectionConflict, selectedMarkerRules, type CustomDifficulty, type CustomRule, type MarkerRule } from './custom-modes.ts'
import { EngineError, withGenerationWorker, type EngineRunner, type VariantClueLayout, type VariantGenerationRequest, type VariantPuzzle, type VariantRule, type MarkedPairs } from './engine.ts'
import { EMPTY, type Game } from './game.ts'
import { connectedGridCells } from './grid.ts'
import { regionIndex } from './region-sum.ts'
import { jigsawLayout, reflectVariant, variantSeeds } from './variant-generation.ts'
import { tryVariantRecipe, getVariantPlayOrder } from './variant-play.ts'
import { quadrupleCells, WINDOKU_REGIONS } from './variants.ts'
import { DIFFICULTY_LEVELS, difficultyIndex } from './difficulty.ts'
import { miracleSymmetry, offersMiracle } from './miracle.ts'
import { arrowSumPaths, regionSumPaths } from './miracle-paths.ts'
import { markerTrade } from './marker-construction.ts'
import { hasReadableArrowLayout, MAX_GENERATED_ARROWS, selectReadableArrows } from './arrow-layout.ts'
import { hasGeneratedVariantLayout, isBentKillerCage, isSquareJigsawRegion } from './variant-layout-quality.ts'

type Pair = [number, number]
const cells = Array.from({ length: 81 }, (_, cell) => cell)
const edges: Pair[] = cells.flatMap(cell => [
  ...(cell % 9 < 8 ? [[cell, cell + 1] as Pair] : []),
  ...(cell < 72 ? [[cell, cell + 9] as Pair] : []),
])
const neighbors = cells.map(cell => cells.filter(other => other !== cell &&
  Math.abs(cell % 9 - other % 9) <= 1 && Math.abs(Math.floor(cell / 9) - Math.floor(other / 9)) <= 1))
const edgeNeighbors = neighbors.map((otherCells, cell) => otherCells.filter(other =>
  cell % 9 === other % 9 || Math.floor(cell / 9) === Math.floor(other / 9)))
const cellPairs = cells.flatMap((a, index) => cells.slice(index + 1).map(b => [a, b] as const))
const classicRegions = Array.from({ length: 9 }, (_, i) => cells.filter(cell => regionIndex(cell) === i))
const jigsawStarts = variantSeeds.jigsaw.easy!.map(recipe => jigsawLayout(recipe.regions!).regions)
const triples = cells.flatMap(a => neighbors[a].flatMap(b => neighbors[b].filter(c => c !== a).map(c => [a, b, c] as const)))
const outsideLines = cells.slice(0, 18).map(line => Array.from({ length: 9 }, (_, offset) =>
  line < 9 ? line * 9 + offset : offset * 9 + line - 9))

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
  }).filter(ray => ray.cells.length >= 2)
})
const shortRays = rays.filter(ray => ray.cells.length >= 3 && ray.cells.length <= 7)
const miracleRays = rays.filter(ray => ray.direction === 'south-east' || ray.direction === 'south-west')
const reverseRay = { 'south-east': 'north-west', 'south-west': 'north-east',
  'north-east': 'south-west', 'north-west': 'south-east' } as const

function modeTemplate(selected: ReadonlySet<CustomRule>, random: () => number) {
  const rules: VariantRule[] = []
  if (selected.has('diagonal') || selected.has('diagonal-main')) rules.push({ type: 'diagonal', diagonal: 'main' })
  if (selected.has('diagonal') || selected.has('diagonal-anti')) rules.push({ type: 'diagonal', diagonal: 'anti' })
  if (selected.has('windoku')) rules.push(...WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })))
  for (const type of ['anti-knight', 'anti-king', 'global-entropy'] as const) if (selected.has(type)) rules.push({ type })
  const whiteDots = selected.has('kropki') || selected.has('kropki-white')
  if (selected.has('non-consecutive')) rules.push({ type: 'non-consecutive',
    ...(whiteDots && { except: sample(edges, 26, random) }) })
  const regions = selected.has('jigsaw') ? exchangeRegions(random, undefined,
    random() < 0.5 ? classicRegions : sample(jigsawStarts, 1, random)[0]) : undefined
  if (selected.has('jigsaw') && !regions) return
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

// A 1 and a 2 only change a visibility count when they are the first two
// digits seen. Sample completions with a few increasing runs at the edges.
function placeAnchors(grid: number[], path: readonly number[], digits: readonly number[]) {
  const fits = path.every((cell, offset) => grid[cell] === digits[offset] ||
    !grid[cell] && !cells.some(other => grid[other] === digits[offset] &&
      (Math.floor(other / 9) === Math.floor(cell / 9) || other % 9 === cell % 9 || regionIndex(other) === regionIndex(cell))))
  if (!fits) return false
  path.forEach((cell, offset) => { grid[cell] = digits[offset] })
  return true
}

function borderAnchor(type: 'skyscrapers' | 'little-killer', random: () => number) {
  const grid = cells.map(() => 0)
  if (type === 'skyscrapers') {
    const runs = outsideLines.flatMap(line => [line, [...line].reverse()])
    for (const [index, run] of sample(runs, runs.length, random).entries()) {
      const length = index === 0 ? 6 + Math.floor(random() * 4) : 2 + Math.floor(random() * 3)
      placeAnchors(grid, run.slice(0, length), Array.from({ length }, (_, i) => i + 1))
    }
  } else {
    // A long low ray can force the lowest digits into several different boxes.
    // Alternate it with a high ray to give the solve more than one opening.
    const diagonals = sample(miracleRays, miracleRays.length, random)
    diagonals.sort((a, b) => Number(b.cells.length >= 7) - Number(a.cells.length >= 7))
    const target = 2 + Math.floor(random() * 4)
    let placed = 0
    for (const [index, { cells: path }] of diagonals.entries()) {
      const group = index % 2 === 0 ? [1, 2, 3] : [7, 8, 9]
      const parts = new Map<number, number>()
      for (const cell of path) {
        const region = regionIndex(cell)
        parts.set(region, (parts.get(region) ?? 0) + 1)
      }
      for (let trial = 0; trial < 12; trial++) {
        const digits = [...parts.values()].flatMap(length => sample(group, length, random))
        if (!placeAnchors(grid, path, digits)) continue
        placed++
        break
      }
      if (placed === target) break
    }
  }
  return grid.join('')
}

// Alternating with random completions preserves variety. This family gives
// comparison and visibility clues more consecutive digits along the edges.
function orderedCompletion(random: () => number) {
  const bands = [0, 1, 2]
  const reordered = () => sample(bands, 3, random).flatMap(b => sample(bands, 3, random).map(i => b * 3 + i))
  const identity = cells.slice(0, 9)
  const rows = random() < 0.6 ? reordered() : identity
  const cols = random() < 0.6 ? reordered() : identity
  return cells.map(cell => {
    const row = rows[Math.floor(cell / 9)]
    return 1 + (cols[cell % 9] + 3 * (row % 3) + Math.floor(row / 3)) % 9
  }).join('')
}

// Grow cages from shared edges so each stays connected and has distinct digits.
function growKillerCages(digits: readonly number[], random: () => number, target: number, maxSize: number) {
  const cages = cells.map(c => [c])
  const owner = [...cells]
  let total = cells.length
  function merge(a: number, b: number, requireBend = false) {
    const left = cages[owner[a]], right = cages[owner[b]]
    if (left === right || left.length + right.length > maxSize || right.some(c => left.some(d => digits[d] === digits[c]))) return
    if (requireBend && !isBentKillerCage([...left, ...right])) return
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
  const joins = sample(edges, edges.length, random)
  for (const [a, b] of joins) {
    if (total <= target) break
    merge(a, b, true)
  }
  for (const [a, b] of joins) {
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
  const singleMiracle = miracle && chosen.size === 1
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
  const allDots = singleMiracle && chosen.has('kropki')
  const ratioTwo = marks('kropki-black', (a, b) => a === 2 * b || b === 2 * a, 4, allDots)
  const consecutive = marks('kropki-white', (a, b) => Math.abs(a - b) === 1, 5, nonConsecutive || allDots)
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
  if (chosen.has('inequality')) for (const pair of sample(edges, singleMiracle ? edges.length : count(5, edges.length), random)) {
    layouts.push({ type: 'inequality', cells: pair })
  }
  if (chosen.has('parity')) layouts.push({ type: 'parity', cells: sample(cells, count(10, 81), random) })
  if (chosen.has('quadruple')) for (const topLeft of sample(cells.filter(cell => cell % 9 < 8 && cell < 72), count(6, 48), random)) {
    layouts.push({ type: 'quadruple', topLeft, clueSize: 3 })
  }
  if (chosen.has('killer-cages')) {
    // A looser cage partition leaves room for fish deductions in a Tricky Jigsaw Killer.
    const larger = method === 'ordinary' && difficulty === 'tricky' && chosen.has('jigsaw')
    const target = (miracle ? 29 : larger ? 15 : 20) + Math.floor(random() * (larger ? 8 : 11))
    const maxSize = (miracle ? 3 : larger ? 5 : 4) + Math.floor(random() * 3)
    const cages = growKillerCages(digits, random, target, maxSize)
    if (!cages) return
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
    const lineCount = singleMiracle && clue === 'skyscrapers' ? outsideLines.length : outsideCount
    for (const line of sample(cells.slice(0, outsideLines.length), lineCount, random)) {
      const horizontal = line < 9
      const reverse = random() < 0.5
      const path = [...outsideLines[line]]
      if (reverse) path.reverse()
      layouts.push({ type: 'outside', clue, cells: path, direction: horizontal ? reverse ? 'west' : 'east' : reverse ? 'north' : 'south' })
      if (miracle && clue !== 'sandwich') layouts.push({ type: 'outside', clue, cells: [...path].reverse(),
        direction: horizontal ? reverse ? 'east' : 'west' : reverse ? 'south' : 'north' })
    }
  }
  if (chosen.has('little-killer')) {
    if (miracle) {
      for (const ray of sample(miracleRays, singleMiracle ? miracleRays.length : count(5, miracleRays.length), random)) {
        const opposite = reverseRay[ray.direction]
        layouts.push(random() < 0.5 ? ray : { ...ray, direction: opposite, cells: [...ray.cells].reverse() })
      }
    } else layouts.push(...sample(shortRays, count(4, shortRays.length), random))
  }

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
    if (type === 'arrow') {
      const pool = miracle ? arrowSumPaths(digits, neighbors) :
        triples.filter(([circle, a, b]) => digits[circle] === digits[a] + digits[b])
          .map(([circle, a, b]) => ({ type, circle, cells: [a, b] }) as const)
      const choices = sample(pool, pool.length, random)
      if (miracle) {
        // Longer shafts narrow the possible sums while using fewer arrows.
        choices.sort((a, b) => Math.min(4, b.cells.length) - Math.min(4, a.cells.length))
      }
      const picked = selectReadableArrows(choices, miracle ? (singleMiracle ? MAX_GENERATED_ARROWS : 8) : count(3, 12))
      if (!picked.length) return
      rules.push(...picked)
      continue
    }
    if (miracle && type === 'region-sum') {
      const pool = regionSumPaths(digits, neighbors, template.regions)
      const usage = cells.map(() => 0)
      const maximumUse = 2 + Math.floor(random() * (singleMiracle ? 6 : 2))
      let remaining = count(3, 72)
      const initial = rules.length
      for (const path of sample(pool, pool.length, random)) {
        const cells = path.cells
        if (cells.some(cell => usage[cell] >= maximumUse)) continue
        rules.push(path)
        cells.forEach(cell => { usage[cell]++ })
        if (--remaining === 0) break
      }
      if (rules.length === initial) return
      continue
    }
    if (!addPaths((a, b, c, path) => {
      switch (type) {
        case 'thermometer': return a < b && b < c
        case 'between': return Math.min(a, c) < b && b < Math.max(a, c)
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
    }, path => type === 'whispers' || type === 'dutch-whispers' ? { type: 'whispers', cells: path, minDifference: type === 'whispers' ? 5 : 4 }
        : { type, cells: path })) return
  }

  return { puzzle: { ...template, givens: solution, rules }, layouts }
}

const globalRules = new Set<CustomRule>(['diagonal', 'diagonal-main', 'diagonal-anti', 'windoku', 'jigsaw',
  'anti-king', 'anti-knight', 'non-consecutive', 'global-entropy'])
const editableMiracleClues = new Set<CustomRule>(['arrow', 'region-sum', 'thermometer',
  'little-killer', 'x-sum', 'skyscrapers', 'adjacent-total', 'inequality', 'quadruple'])

// Swap boundary cells while keeping both regions connected. A known solution
// restricts exchanges to equal digits so the new regions still fit that grid.
function exchangeRegions(random: () => number, solution?: string, start: readonly (readonly number[])[] = classicRegions) {
  const regions = start.map(region => [...region])
  const owner = cells.map(cell => regions.findIndex(region => region.includes(cell)))
  const squares = regions.map(isSquareJigsawRegion)
  let remaining = squares.filter(Boolean).length
  const changed = new Set<number>()
  const pairs = solution ? cellPairs.filter(([a, b]) => solution[a] === solution[b]) : cellPairs
  const target = (solution ? 5 : 8) + Math.floor(random() * 5)
  for (const [a, b] of sample(pairs, pairs.length, random)) {
    const i = owner[a], j = owner[b]
    if (i === j || changed.has(a) || changed.has(b)) continue
    if (remaining && !squares[i] && !squares[j]) continue
    if (!edgeNeighbors[a].some(cell => cell !== b && owner[cell] === j)
      || !edgeNeighbors[b].some(cell => cell !== a && owner[cell] === i)) continue
    const left = regions[i].map(c => c === a ? b : c)
    const right = regions[j].map(c => c === b ? a : c)
    if (isSquareJigsawRegion(left) || isSquareJigsawRegion(right) || !connectedGridCells(left, 9) || !connectedGridCells(right, 9)) continue
    regions[i] = left
    regions[j] = right
    owner[a] = j
    owner[b] = i
    changed.add(a)
    changed.add(b)
    remaining -= Number(squares[i]) + Number(squares[j])
    squares[i] = squares[j] = false
    if (!remaining && changed.size >= 2 * target) break
  }
  return remaining ? undefined : { type: 'jigsaw' as const, regions }
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
    template.regions = exchangeRegions(random, solution)
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
  difficulty: CustomDifficulty, miracle: boolean, seed: number) {
  const bank = miracle ? (await import('./checked-miracle-puzzles.ts')).checkedMiraclePuzzles
    : (await import('./checked-variant-puzzles.ts')).checkedVariantPuzzles
  const antiXSums = miracle && chosen.size === 2 && chosen.has('diagonal-anti') && chosen.has('x-sum')
  const rules = antiXSums ? 'diagonal-main,x-sum' : [...chosen].sort().join(',')
  const markings = negative.size ? '/negative=' + [...negative].sort().join(',') : ''
  const layouts = bank[rules + markings]
  function templatesFor(level: CustomDifficulty) {
    const choices = layouts?.[level] ?? []
    return choices.map((_, offset) => {
      const item = choices[((seed >>> 0) + offset) % choices.length]
      const template: VariantPuzzle = { version: 1, extendedLogic: true, givens: item.givens, rules: item.rules,
        ...(item.regions && { regions: jigsawLayout(item.regions) }),
        ...((item.regions || chosen.has('global-entropy')) && { logicVersion: 29 }) }
      return antiXSums ? reflectVariant(template, 2) : template
    }).filter(hasGeneratedVariantLayout)
  }
  const target = templatesFor(difficulty)
  const grade = difficultyIndex(difficulty)
  const nearby = miracle && !target.length && layouts ? DIFFICULTY_LEVELS
    .filter(level => layouts[level]?.length)
    .sort((left, right) => Math.abs(difficultyIndex(left) - grade) - Math.abs(difficultyIndex(right) - grade))
    .slice(0, 2)
    .flatMap(templatesFor) : []
  return { target, nearby }
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
      async function generate(request: VariantGenerationRequest) {
        const result = await run(request)
        if (!hasGeneratedVariantLayout(result.puzzle)) throw exhausted()
        return result
      }

      const [only] = chosen
      const family = only === 'dutch-whispers' ? 'whispers' : only
      const requiredRules = [...chosen].map(rule => rule === 'windoku' ? 'extra-house' : rule === 'whispers' ? 'german-whispers' : rule)
      const exclude = games.flatMap(game => game.variant && (game.variant.puzzle.givens === EMPTY) === miracle
        ? [game.variant.puzzle] : [])
      const { target: checked, nearby } = await checkedTemplates(chosen, negative, difficulty, miracle, seed)
      for (const template of checked) {
        const givenCells = cells.filter(c => template.givens[c] !== '0')
        if ((givenCells.length === 0) !== miracle) continue
        try {
          // The request seed rotates the layouts. A fixed search order reproduces each certificate.
          return await generate({ type: 'generate-variant', template, givens: givenCells.length, givenCells,
            difficulty, maxAttempts: 1, maxNodes: miracle ? 60_000 : 20_000, seed: 7, requiredRules,
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
      const fixedGlobalRules = !chosen.has('jigsaw') && !markers.includes('kropki-white') &&
        [...chosen].filter(rule => globalRules.has(rule)).length >= 2
      let checkedGlobal = false
      let globalCompletion: string | undefined
      const exchange = difficulty === 'impossible' && !miracle && !negative.size && rules.every(rule => rule === 'jigsaw' || !globalRules.has(rule))
      const templates = exchange ? await run({ type: 'impossible-templates' }) : []
      const editable = [...chosen].filter(rule => editableMiracleClues.has(rule))
      const checkedSolutions = new Map<VariantPuzzle, string>()
      const revisable = checked.length ? checked : nearby
      // These searches can reject a layout before reaching the difficulty check.
      const shaped = chosen.has('jigsaw') || chosen.has('killer-cages')
      const needsMoreLayouts = negative.size && chosen.size > 1
        || shaped && difficultyIndex(difficulty) >= difficultyIndex('tricky')
      const maxLayouts = needsMoreLayouts ? 360 : miracle || hardOrHigher ? 72 : 36
      for (let attempt = 0; attempt < maxLayouts; attempt++) {
        searchSignal.throwIfAborted()
        const template = modeTemplate(chosen, random)
        if (!template) continue
        const samplingSeed = Math.floor(random() * 0x1_0000_0000)
        try {
          if (miracle && revisable.length && (!checked.length || exclude.length) && attempt % 3 === 0) {
            // Retune checked clues after the stored layouts have been played
            // or when starting from a neighboring difficulty.
            const index = Math.floor(attempt / 3)
            const source = revisable[Math.floor(index / 2) % revisable.length]
            let solution = checkedSolutions.get(source)
            if (!solution) {
              solution = await run({ type: 'variant', operation: 'solve', position: { puzzle: source }, maxNodes: 20_000 })
              checkedSolutions.set(source, solution)
            }
            const extraRule = index % 2 === 1 && editable.length ? editable[Math.floor(index / 2) % editable.length] : undefined
            let extra = extraRule ? addClues({ ...source, rules: [] }, new Set([extraRule]), [], new Set(),
              solution, difficulty, random, 'exchange') : undefined
            const rules = [...source.rules ?? [], ...extra?.puzzle.rules ?? []]
            if (!hasReadableArrowLayout(rules)) extra = undefined
            const revised = { ...source, givens: solution, ...(extra && { rules }) }
            return await generate({ type: 'generate-variant', template: revised, derivedClues: extra?.layouts,
              givens: 0, thinClues: true, difficulty, seed: samplingSeed, maxAttempts: 1, maxNodes: 20_000,
              requiredRules, techniqueOrder: await getVariantPlayOrder({ ...revised, givens: EMPTY }, extra?.layouts), exclude })
          }
          if (templates.length && attempt % 3 !== 2) {
            const board = templates[Math.floor(random() * templates.length)]
            const solution = await run({ type: 'solve', values: board })
            const exchanged = solution && exchangeVariantGivens([...chosen], board, solution, samplingSeed)
            if (!exchanged) continue
            return await generate({ type: 'generate-variant', ...exchanged, seed: samplingSeed, maxAttempts: 1,
              maxNodes: 20_000, difficulty, requiredRules, exclude,
              techniqueOrder: await getVariantPlayOrder(exchanged.template, exchanged.derivedClues) })
          }
          let sampling: VariantPuzzle = template
          if (chess && (pureChess || attempt % 2 === 0)) {
            const shift = Math.floor(random() * 9)
            const transform = Math.floor(random() * 8)
            sampling = { ...template, givens: chessAnchor(shift, transform) }
          } else if (miracle && chosen.size === 1 && (only === 'skyscrapers' || only === 'little-killer') && attempt % 3 === 0) {
            sampling = { ...template, givens: borderAnchor(only, random) }
          } else if (miracle && chosen.size === 1 && attempt % 3 === 1 &&
              (only === 'arrow' || only === 'inequality' || only === 'kropki' || only === 'skyscrapers')) {
            sampling = { ...template, givens: orderedCompletion(random) }
          } else if (chosen.size > 1 && negative.has('kropki-white') && !chosen.has('non-consecutive') && attempt % 3 === 1) {
            // A full white-dot layout sampled from an unrestricted grid can
            // determine the entire solution before the companion clues matter.
            // Fewer consecutive edges leave room for those other deductions.
            sampling = { ...template, rules: [...template.rules, { type: 'non-consecutive', except: sample(edges, 8 + attempt % 24, random) }] }
          }
          let solution: string
          if (globalCompletion && attempt % 2 === 1) {
            const transform = [0, 1, 6, 7][Math.floor(attempt / 2) % 4]
            solution = reflectVariant({ ...template, givens: globalCompletion }, transform).givens
            if (attempt % 16 >= 8) solution = Array.from(solution, digit => 10 - Number(digit)).join('')
          } else {
            try {
              solution = await run({ type: 'variant', operation: 'solve', position: { puzzle: sampling }, seed: samplingSeed, maxNodes: 20_000 })
            } catch (error) {
              if (!fixedGlobalRules || checkedGlobal || !(error instanceof EngineError) ||
                  !['search-limit', 'unsolvable', 'conflict'].includes(error.code ?? '')) throw error
              checkedGlobal = true
              try {
                // Fixed global rules need only one satisfiability check for the
                // whole request. The deterministic solver propagates houses too.
                globalCompletion = await run({ type: 'variant', operation: 'solve',
                  position: { puzzle: template }, maxNodes: 400_000 })
                solution = globalCompletion
              } catch (reason) {
                if (reason instanceof EngineError && (reason.code === 'unsolvable' || reason.code === 'conflict')) {
                  throw new EngineError('These rules cannot share a completed 9×9 grid. Change one of the selected rules.', 'unsupported')
                }
                throw reason
              }
            }
          }
          const trade = negative.size && chosen.has('arrow') && !template.rules.length && !template.regions
            ? markerTrade(solution, negative, edges, random) : undefined
          const completed = trade?.solution ?? solution
          const clues = addClues(template, chosen, markers, negative, completed, difficulty, random,
            miracle ? 'miracle' : 'ordinary', trade?.alternative)
          if (!clues) continue
          const techniqueOrder = await getVariantPlayOrder(miracle ? { ...clues.puzzle, givens: EMPTY } : clues.puzzle, clues.layouts)
          // The pure Chess rules allow only 72 labelled completions with no
          // givens. Sparse starting patterns can already be unique. Testing
          // one count skips many dense intermediates that use only singles.
          let givens: number | readonly [number, number] = miracle ? 0 : [1, hardOrHigher ? 32 : 40]
          if (pureChess && (hardOrHigher || difficulty === 'tricky') && attempt % 6 !== 5) givens = 3 + Math.floor(random() * 10)
          else if (pureChess && difficulty === 'beginner' && attempt % 3 === 1) givens = 26 + Math.floor(random() * 15)
          const candidate = chosen.has('killer-cages') ? { ...clues.puzzle, givens: completed } : clues.puzzle
          return await generate({ type: 'generate-variant', seed: Math.floor(random() * 0x1_0000_0000), maxAttempts: 2,
            maxNodes: 20_000, template: candidate, derivedClues: clues.layouts,
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
