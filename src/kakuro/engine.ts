const allDigits = 0b111111111

export type ClueCell = { across?: number; down?: number }
export type KakuroCell = ClueCell | null
export type KakuroRun = {
  clue: number
  direction: 'across' | 'down'
  total: number
  cells: number[]
}
export type KakuroPuzzle = {
  width: number
  height: number
  cells: readonly KakuroCell[]
  runs: readonly KakuroRun[]
}

const totalsByLength = Array.from({ length: 10 }, () =>
  Array.from({ length: 46 }, () => [] as number[]),
)
const possibleDigits = Array.from({ length: 10 }, () => new Uint16Array(46))
const digitCounts = new Uint8Array(allDigits + 1)
const digitSums = new Uint8Array(allDigits + 1)
for (let mask = 1; mask <= allDigits; mask++) {
  let total = 0
  let length = 0
  for (let digit = 1; digit <= 9; digit++) {
    if (mask & (1 << (digit - 1))) {
      length++
      total += digit
    }
  }
  digitCounts[mask] = length
  digitSums[mask] = total
  totalsByLength[length][total].push(mask)
  possibleDigits[length][total] |= mask
}

// A two-cell run has at most one partner per digit. Map every candidate
// set to the set that can appear across from it at the given total.
const pairPartners = totalsByLength[2].slice(0, 18).map(combinations => {
  const partners = new Uint16Array(allDigits + 1)
  for (const pair of combinations) {
    const low = pair & -pair
    const high = pair ^ low
    partners[low] = high
    partners[high] = low
  }
  for (let mask = 1; mask <= allDigits; mask++) {
    const rest = mask & (mask - 1)
    if (rest) partners[mask] = partners[mask ^ rest] | partners[rest]
  }
  return partners
})

export function createKakuro(width: number, cells: readonly KakuroCell[]): KakuroPuzzle {
  const height = cells.length / width
  if (!Number.isInteger(width) || width < 3 || !Number.isInteger(height) || height < 3) {
    throw new Error('Kakuro needs a rectangular board at least three cells wide and tall.')
  }

  const acrossCoverage = new Set<number>()
  const downCoverage = new Set<number>()
  const runs: KakuroRun[] = []
  cells.forEach((cell, clue) => {
    if (cell === null) return
    for (const direction of ['across', 'down'] as const) {
      const total = cell[direction]
      if (total === undefined) continue
      const covered = direction === 'across' ? acrossCoverage : downCoverage
      const indices: number[] = []
      let row = Math.floor(clue / width)
      let column = clue % width
      while (true) {
        if (direction === 'across') column++
        else row++
        if (column >= width || row >= height) break
        const index = row * width + column
        if (cells[index] !== null) break
        indices.push(index)
        covered.add(index)
      }
      if (indices.length < 2 || !totalsByLength[indices.length]?.[total]?.length) {
        throw new Error(`Invalid Kakuro ${direction} clue at cell ${clue}.`)
      }
      runs.push({ clue, direction, total, cells: indices })
    }
  })
  if (!runs.length || cells.some((cell, i) => cell === null && (!acrossCoverage.has(i) || !downCoverage.has(i)))) {
    throw new Error('Each white cell needs one across clue and one down clue.')
  }
  return { width, height, cells, runs }
}

function digitMask(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 9 ? 1 << (value - 1) : 0
}

function createDomains(puzzle: KakuroPuzzle, values: readonly number[]): number[] {
  return puzzle.cells.map((cell, i) => {
    if (cell !== null) return 0
    const value = values[i] ?? 0
    return value === 0 ? allDigits : digitMask(value)
  })
}

// The work arrays are reused across runs. Only the first run.cells.length
// entries belong to the current run, and callers read them before the next run.
type RunScratch = {
  allowed: number[]
  order: number[]
  support: number[]
  commonAtTail?: number[]
  memo: Int8Array
}

// Each cell in the final pair must use the digit that the other cell does not use.
function firstOfPair(pair: number, first: number, second: number): number {
  const other = pair & second
  if (other === pair) return pair & first
  return other ? pair & first & ~other : 0
}

// Match the first two cells in candidate-count order, then look up the final pair.
function matchQuadruple(total: number, allowed: number[], order: readonly number[], start: number) {
  const first = order[start]
  const second = order[start + 1]
  const third = order[start + 2]
  const fourth = order[start + 3]
  const a = allowed[first]
  const b = allowed[second]
  const c = allowed[third]
  const d = allowed[fourth]
  let firstSupport = 0
  let secondSupport = 0
  let thirdSupport = 0
  let fourthSupport = 0
  for (let choices = a; choices; choices &= choices - 1) {
    const firstDigit = choices & -choices
    for (let pairs = b & ~firstDigit; pairs; pairs &= pairs - 1) {
      const secondDigit = pairs & -pairs
      const used = firstDigit | secondDigit
      const partners = pairPartners[total - digitSums[used]]
      if (!partners) continue
      const available = c & ~used & partners[d & ~used]
      if (!available) continue
      firstSupport |= firstDigit
      secondSupport |= secondDigit
      thirdSupport |= available
      fourthSupport |= partners[available]
    }
    if (firstSupport === a && secondSupport === b && thirdSupport === c && fourthSupport === d) break
  }
  if (!firstSupport) return null
  allowed[first] = firstSupport
  allowed[second] = secondSupport
  allowed[third] = thirdSupport
  allowed[fourth] = fourthSupport
  return allowed
}

// A digit set can support a cell only if every digit in the set can be
// assigned to a different cell. Memoize by the remaining digits, which
// also gives the next position in the sorted cell order.
function runSupport(run: KakuroRun, domains: readonly number[], scratch: RunScratch): number[] | null {
  const { allowed, order, support, commonAtTail, memo } = scratch
  const length = run.cells.length
  if (length === 2) {
    const partners = pairPartners[run.total]
    if (!partners) return null
    const first = domains[run.cells[0]] & partners[domains[run.cells[1]]]
    if (!first) return null
    support[0] = first
    support[1] = partners[first]
    return support
  }
  const possible = possibleDigits[length][run.total]
  let fixed = 0
  let union = 0
  let common = possible
  for (let i = 0; i < length; i++) {
    const mask = domains[run.cells[i]] & possible
    if (!mask) return null
    allowed[i] = mask
    union |= mask
    common &= mask
    if (digitCounts[mask] === 1) {
      if (fixed & mask) return null
      fixed |= mask
    }
  }

  const combinations = totalsByLength[length][run.total]
  if (common === possible) return allowed
  if (digitCounts[fixed] === length) {
    return combinations.includes(fixed) ? allowed : null
  }

  if (length === 3) {
    // Try the cell with the fewest choices, then match the other two.
    let first = 0
    if (digitCounts[allowed[1]] < digitCounts[allowed[first]]) first = 1
    if (digitCounts[allowed[2]] < digitCounts[allowed[first]]) first = 2
    const second = (first + 1) % 3
    const third = (first + 2) % 3
    support[0] = support[1] = support[2] = 0
    for (let choices = allowed[first]; choices; choices &= choices - 1) {
      const digit = choices & -choices
      const partners = pairPartners[run.total - digitFromMask(digit)]
      const available = allowed[second] & ~digit & partners[allowed[third] & ~digit]
      if (!available) continue
      support[first] |= digit
      support[second] |= available
      support[third] |= partners[available]
    }
    return support[first] ? support : null
  }

  const remaining = length - digitCounts[fixed]
  if (remaining <= 2) {
    // Subtract the fixed digits and match the remaining one or two cells directly.
    let first = -1
    let second = -1
    for (let index = 0; index < length; index++) {
      if (digitCounts[allowed[index]] === 1) continue
      if (first === -1) first = index
      else second = index
    }
    const total = run.total - digitSums[fixed]
    if (second === -1) {
      allowed[first] &= digitMask(total) & ~fixed
      return allowed[first] ? allowed : null
    }
    const partners = pairPartners[total]
    if (!partners) return null
    allowed[first] &= partners[allowed[second] & ~fixed] & ~fixed
    if (!allowed[first]) return null
    allowed[second] = partners[allowed[first]]
    return allowed
  }

  for (let i = 0; i < length; i++) {
    const count = digitCounts[allowed[i]]
    support[i] = count === 1 ? allowed[i] : 0
    let j = i
    while (j > 0 && digitCounts[allowed[order[j - 1]]] > count) {
      order[j] = order[j - 1]
      j--
    }
    order[j] = i
  }
  if (remaining === 4) {
    const start = length - remaining
    for (let i = start; i < length; i++) allowed[order[i]] &= ~fixed
    return matchQuadruple(run.total - digitSums[fixed], allowed, order, start)
  }

  if (commonAtTail) {
    // If all remaining cells accept every remaining digit, every order works.
    commonAtTail[3] = allowed[order[length - 1]] & allowed[order[length - 2]] & allowed[order[length - 3]]
    for (let count = 4; count <= remaining; count++) {
      commonAtTail[count] = commonAtTail[count - 1] & allowed[order[length - count]]
    }
  }
  memo.fill(0)
  const last = order[length - 1]
  function collectSupport(remaining: number): boolean {
    if (memo[remaining]) return memo[remaining] > 0
    const count = digitCounts[remaining]
    const index = order[length - count]
    if (count >= 3 && commonAtTail && (commonAtTail[count] & remaining) === remaining) {
      for (let i = length - count; i < length; i++) support[order[i]] |= remaining
      memo[remaining] = 1
      return true
    }
    let supported = remaining & allowed[index]
    if (count === 2) {
      supported = firstOfPair(remaining, supported, allowed[last])
      if (supported) support[last] |= supported === remaining ? remaining : remaining ^ supported
    } else if (count === 3) {
      // Pick the first digit and match the final pair without another recursive call.
      const middle = order[length - 2]
      let choices = supported
      const allowedMiddle = remaining & allowed[middle]
      const allowedLast = remaining & allowed[last]
      supported = 0
      while (choices) {
        const digit = choices & -choices
        choices ^= digit
        const pair = remaining ^ digit
        const first = firstOfPair(pair, allowedMiddle, allowedLast)
        if (!first) continue
        supported |= digit
        support[middle] |= first
        support[last] |= first === pair ? pair : pair ^ first
      }
    } else if (count > 3) {
      let choices = supported
      supported = 0
      while (choices) {
        const digit = choices & -choices
        if (collectSupport(remaining ^ digit)) supported |= digit
        choices ^= digit
      }
    }
    // Each prefix uses digits from a valid sum combination. A matching
    // suffix completes that run, so it can contribute support here.
    support[index] |= supported
    memo[remaining] = supported ? 1 : -1
    return supported !== 0
  }

  let found = false
  // The sorted order starts with all fixed cells. Match only the remaining digits.
  for (const combination of combinations) {
    if ((combination & union) !== combination || (combination & fixed) !== fixed) continue
    if (collectSupport(combination ^ fixed)) found = true
    let complete = true
    for (let i = 0; i < length; i++) {
      if (support[i] === allowed[i]) continue
      complete = false
      break
    }
    if (complete) break
  }
  return found ? support : null
}

function runFitsEntries(run: KakuroRun, values: readonly number[]): boolean {
  let entered = 0
  for (const cell of run.cells) {
    const value = values[cell] ?? 0
    if (value === 0) continue
    const digit = digitMask(value)
    if (!digit || (entered & digit)) return false
    entered |= digit
  }

  // Empty cells have no candidate restrictions during a rule check.
  // Any valid digit set that contains the entries can fill those cells.
  return totalsByLength[run.cells.length][run.total].some(mask => (mask & entered) === entered)
}

export function checkKakuro(puzzle: KakuroPuzzle, values: readonly number[]) {
  const conflicts = puzzle.runs.filter(run => !runFitsEntries(run, values))
  const complete = !conflicts.length && puzzle.cells.every((cell, i) => cell !== null || digitMask(values[i]) !== 0)
  return { conflicts, complete }
}

function digitFromMask(mask: number) {
  return 32 - Math.clz32(mask)
}

type KakuroCandidateChange = { cell: number; removedMask: number; remainingMask: number }
type KakuroHintStep = { run: KakuroRun; changes: KakuroCandidateChange[] }
type KakuroPlacement = { cell: number; digit: number; depth: number }
export type KakuroHint = KakuroPlacement & {
  runs: KakuroRun[]
  steps: KakuroHintStep[]
}

function createPropagationScratch(puzzle: KakuroPuzzle, commonAtTail?: number[]) {
  const across = new Uint32Array(puzzle.cells.length)
  const down = new Uint32Array(puzzle.cells.length)
  for (const [index, run] of puzzle.runs.entries()) {
    const indices = run.direction === 'across' ? across : down
    for (const cell of run.cells) indices[cell] = index
  }
  return {
    support: {
      allowed: Array<number>(9),
      order: Array<number>(9),
      support: Array<number>(9),
      commonAtTail,
      memo: new Int8Array(allDigits + 1),
    },
    across,
    down,
    pending: new Uint8Array(puzzle.runs.length),
  }
}

function propagate(
  puzzle: KakuroPuzzle,
  domains: number[],
  recordStep?: (run: KakuroRun, domains: readonly number[], support: readonly number[], depth: number) => boolean | void,
  work = createPropagationScratch(puzzle),
  matchRun = runSupport,
): boolean {
  const { support: scratch, across, down, pending } = work
  pending.fill(1)
  let changed = true
  let depth = 0
  while (changed) {
    changed = false
    depth++
    for (let index = 0; index < puzzle.runs.length; index++) {
      if (!pending[index]) continue
      pending[index] = 0
      const run = puzzle.runs[index]
      const { cells } = run
      const support = matchRun(run, domains, scratch)
      if (!support) return false
      let firstChange = 0
      while (firstChange < cells.length && support[firstChange] === domains[cells[firstChange]]) firstChange++
      if (firstChange < cells.length) {
        if (recordStep?.(run, domains, support, depth)) return true
        const crossing = run.direction === 'across' ? down : across
        for (let i = firstChange; i < cells.length; i++) {
          const cell = cells[i]
          if (domains[cell] === support[i]) continue
          domains[cell] = support[i]
          // The current run already supports these digits. Recheck only the crossing run.
          pending[crossing[cell]] = 1
        }
        changed = true
      }
    }
  }
  return true
}

export function findKakuroHint(puzzle: KakuroPuzzle, values: readonly number[]): KakuroHint | null {
  return findKakuroHints(puzzle, values, 1)[0] ?? null
}

export function findKakuroHints(puzzle: KakuroPuzzle, values: readonly number[], limit = Infinity): KakuroHint[] {
  return collectKakuroHints(puzzle, createDomains(puzzle, values), limit, false) ?? []
}

/** Reuse a completed run check for compatible hint requests on the same puzzle. */
export function createKakuroHintFinder(puzzle: KakuroPuzzle) {
  let settled: number[] | undefined
  return (values: readonly number[], limit = Infinity): KakuroHint[] => {
    const domains = createDomains(puzzle, values)
    const previous = settled
    // Run support can only shrink as its input shrinks. As long as every
    // settled candidate still fits, the new run checks cannot remove them all.
    const consistent = previous !== undefined && previous.every((mask, cell) => (mask & domains[cell]) === mask)
    const hints = collectKakuroHints(puzzle, domains, limit, consistent)
    if (!consistent && hints !== null) settled = domains
    return hints ?? []
  }
}

type PropagationScratch = ReturnType<typeof createPropagationScratch>

function replayKakuro<Step extends KakuroPlacement>(
  puzzle: KakuroPuzzle, values: readonly number[],
  next: (domains: number[], verified: boolean, work: PropagationScratch) => Step | undefined,
  limit = Infinity,
): Step[] {
  const initial = createDomains(puzzle, values)
  const domains = initial.slice()
  const work = createPropagationScratch(puzzle)
  const hints: Step[] = []
  const empty = initial.reduce((count, mask) => mask === allDigits ? count + 1 : count, 0)
  const steps = Math.min(limit, empty)

  // The first pass checks that propagation has a consistent fixed point.
  // Later placements use digits from that fixed point, so proofs can stop early.
  for (let i = 0; i < steps; i++) {
    const step = next(domains, i > 0, work)
    if (!step) break
    hints.push(step)
    if (i + 1 === steps) break
    initial[step.cell] = digitMask(step.digit)
    for (let cell = 0; cell < domains.length; cell++) domains[cell] = initial[cell]
  }
  return hints
}

/** Return placements in order, with earlier digits visible during each proof. */
export function findKakuroSolutionHints(puzzle: KakuroPuzzle, values: readonly number[]): KakuroHint[] {
  return replayKakuro(puzzle, values, (domains, verified, work) =>
    collectKakuroHints(puzzle, domains, 1, verified, work)?.[0])
}

/** Measure the same placement order without building proofs for the generator. */
export function kakuroSolutionDepth(puzzle: KakuroPuzzle, count: number): number | null {
  const placements = replayKakuro(puzzle, [], (domains, verified, work) => {
    let first: KakuroPlacement | undefined
    const valid = propagate(puzzle, domains, (run, domains, support, depth) => {
      if (first) return
      for (let i = 0; i < run.cells.length; i++) {
        const cell = run.cells[i]
        const mask = support[i]
        if (domains[cell] === mask || digitCounts[mask] !== 1) continue
        first = { cell, digit: digitFromMask(mask), depth }
        return verified
      }
    }, work)
    return valid ? first : undefined
  }, count)
  return placements.length === count ? placements.reduce((max, placement) => Math.max(max, placement.depth), 0) : null
}

function collectKakuroHints(
  puzzle: KakuroPuzzle, domains: number[], limit: number, stopAtLimit: boolean,
  work?: PropagationScratch,
): KakuroHint[] | null {
  const trace: KakuroHintStep[] = []
  const placements: (KakuroPlacement & { through: number })[] = []
  const consistent = propagate(puzzle, domains, (run, domains, support, depth) => {
    if (placements.length >= limit) return
    const changes: KakuroCandidateChange[] = []
    for (const [i, cell] of run.cells.entries()) {
      const remainingMask = support[i]
      const removedMask = domains[cell] & ~remainingMask
      if (!removedMask) continue
      changes.push({ cell, removedMask, remainingMask })
      if (placements.length < limit && digitCounts[remainingMask] === 1) {
        placements.push({ cell, digit: digitFromMask(remainingMask), depth, through: trace.length + 1 })
      }
    }
    trace.push({ run, changes })
    return stopAtLimit && placements.length >= limit
  }, work)
  if (!consistent) return null
  return placements.map(({ through, ...placement }) => {
    // Keep each step that narrowed a cell used by a later step in this proof.
    const needed = new Set([placement.cell])
    const steps: KakuroHintStep[] = []
    for (let index = through - 1; index >= 0; index--) {
      const step = trace[index]
      if (!step.changes.some(({ cell }) => needed.has(cell))) continue
      steps.push(step)
      for (const cell of step.run.cells) needed.add(cell)
    }
    steps.reverse()
    return { ...placement, runs: [...new Set(steps.map(step => step.run))], steps }
  })
}

export type KakuroSolution = {
  status: 'unsolvable' | 'unique' | 'multiple' | 'search-limit'
  solution: number[] | null
  nodes: number
}

export function solveKakuro(
  puzzle: KakuroPuzzle,
  values: readonly number[] = [],
  nodeLimit = 20_000,
): KakuroSolution {
  let nodes = 0
  let limited = false
  const solutions: number[][] = []
  const work = createPropagationScratch(puzzle)
  const visit = (domains: number[]) => {
    if (nodes >= nodeLimit) {
      limited = true
      return
    }
    nodes++
    if (!propagate(puzzle, domains, undefined, work)) return
    let branch = -1
    let smallest = 10
    domains.forEach((mask, index) => {
      const count = digitCounts[mask]
      if (count > 1 && count < smallest) {
        branch = index
        smallest = count
      }
    })
    if (branch === -1) {
      solutions.push(domains.map(digitFromMask))
      return
    }
    for (let remaining = domains[branch]; remaining && solutions.length < 2 && !limited; remaining &= remaining - 1) {
      const next = [...domains]
      next[branch] = remaining & -remaining
      visit(next)
    }
  }
  visit(createDomains(puzzle, values))
  const status = limited ? 'search-limit' : (['unsolvable', 'unique', 'multiple'] as const)[solutions.length]
  return { status, solution: solutions[0] ?? null, nodes }
}

// A trial fill often changes just two totals. Cache matches whose total
// and supported input digits stay the same across the trial fills.
function createTrialRunMatcher(): typeof runSupport {
  const capacity = 8192
  const firstKeys = new Uint32Array(capacity)
  const lastKeys = new Uint32Array(capacity)
  const firstSupports = new Uint32Array(capacity)
  const lastSupports = new Uint32Array(capacity)
  return (run, domains, scratch) => {
    const { cells, total } = run
    const length = cells.length
    if (length < 4 || length > 6) return runSupport(run, domains, scratch)
    const possible = possibleDigits[length][total]
    const a = domains[cells[0]] & possible
    const b = domains[cells[1]] & possible
    const c = domains[cells[2]] & possible
    const d = domains[cells[3]] & possible
    const e = length >= 5 ? domains[cells[4]] & possible : possible
    const f = length === 6 ? domains[cells[5]] & possible : possible
    // With every digit available in every cell, any matching digit set can
    // use any order. Skip the cache key and the assignment search.
    if (possible && (a & b & c & d & e & f) === possible) {
      scratch.allowed.fill(possible, 0, length)
      return scratch.allowed
    }
    // Each key word holds three nine-bit masks. Split the total across
    // both words and include the length in the second word.
    const first = (a | (b << 9) | (c << 18) | (total << 27)) >>> 0
    const last = (d | (e << 9) | (f << 18) | ((total >>> 5) << 27) | (length << 28)) >>> 0
    const hash = Math.imul(first, 0x9e3779b1) ^ Math.imul(last, 0x85ebca6b)
    const index = (hash ^ (hash >>> 16)) & (capacity - 1)
    if (firstKeys[index] === first && lastKeys[index] === last) {
      const left = firstSupports[index]
      if (!left) return null
      const right = lastSupports[index]
      const { support } = scratch
      support[0] = left & allDigits
      support[1] = (left >>> 9) & allDigits
      support[2] = left >>> 18
      support[3] = right & allDigits
      support[4] = (right >>> 9) & allDigits
      support[5] = right >>> 18
      return support
    }
    const result = runSupport(run, domains, scratch)
    firstKeys[index] = first
    lastKeys[index] = last
    firstSupports[index] = result ? result[0] | (result[1] << 9) | (result[2] << 18) : 0
    lastSupports[index] = result ? result[3] | ((length >= 5 ? result[4] : 0) << 9)
      | ((length === 6 ? result[5] : 0) << 18) : 0
    return result
  }
}

// Count the candidates left after run deductions. Reuse the work arrays
// across trial fills of the same grid, and start each check with every digit.
export function createKakuroCandidateCounter(puzzle: KakuroPuzzle) {
  const initial = createDomains(puzzle, [])
  const domains = initial.slice()
  // Trial fills often leave several cells in a long run with room for every digit.
  const work = createPropagationScratch(puzzle, [])
  const matchRun = createTrialRunMatcher()
  return (): number | null => {
    for (let cell = 0; cell < domains.length; cell++) domains[cell] = initial[cell]
    if (!propagate(puzzle, domains, undefined, work, matchRun)) return null
    return domains.reduce((count, mask) => count + digitCounts[mask], 0)
  }
}
