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
  totalsByLength[length][total].push(mask)
  possibleDigits[length][total] |= mask
}

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

// A digit set can support a cell only if every digit in the set can be
// assigned to a different cell. Memoize by the remaining digits, which
// also gives the next position in the sorted cell order.
function runSupport(run: KakuroRun, domains: readonly number[], memo: Int8Array): number[] | null {
  const length = run.cells.length
  const possible = possibleDigits[length][run.total]
  const allowed = Array<number>(length)
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

  const order = allowed.map((_, i) => i).sort((a, b) => digitCounts[allowed[a]] - digitCounts[allowed[b]])
  const support = allowed.map(mask => digitCounts[mask] === 1 ? mask : 0)
  memo.fill(0)
  function collectSupport(remaining: number): boolean {
    if (memo[remaining]) return memo[remaining] > 0
    const count = digitCounts[remaining]
    const index = order[length - count]
    let supported = remaining & allowed[index]
    if (count > 1) {
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
    if (support.every((mask, i) => mask === allowed[i])) break
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
export type KakuroHint = {
  cell: number
  digit: number
  runs: KakuroRun[]
  depth: number
  steps: KakuroHintStep[]
}

function propagate(
  puzzle: KakuroPuzzle,
  domains: number[],
  recordStep?: (run: KakuroRun, domains: readonly number[], support: readonly number[], depth: number) => void,
): boolean {
  const memo = new Int8Array(allDigits + 1)
  const narrowedAt = new Uint32Array(domains.length)
  const checkedAt = new Uint32Array(puzzle.runs.length)
  let revision = 0
  let changed = true
  let depth = 0
  while (changed) {
    changed = false
    depth++
    for (const [index, run] of puzzle.runs.entries()) {
      // Each value that survives a run check still belongs to a full
      // assignment for that run. Check again only after another run
      // narrows one of its cells.
      if (depth > 1 && !run.cells.some(cell => narrowedAt[cell] > checkedAt[index])) continue
      const support = runSupport(run, domains, memo)
      if (!support) return false
      const firstChange = run.cells.findIndex((cell, i) => support[i] !== domains[cell])
      if (firstChange !== -1) {
        recordStep?.(run, domains, support, depth)
        revision++
        for (let i = firstChange; i < run.cells.length; i++) {
          const cell = run.cells[i]
          if (domains[cell] === support[i]) continue
          domains[cell] = support[i]
          narrowedAt[cell] = revision
        }
        changed = true
      }
      checkedAt[index] = revision
    }
  }
  return true
}

export function findKakuroHint(puzzle: KakuroPuzzle, values: readonly number[]): KakuroHint | null {
  return findKakuroHints(puzzle, values, 1)[0] ?? null
}

export function findKakuroHints(puzzle: KakuroPuzzle, values: readonly number[], limit = Infinity): KakuroHint[] {
  const trace: KakuroHintStep[] = []
  const placements: (Pick<KakuroHint, 'cell' | 'digit' | 'depth'> & { through: number })[] = []
  const consistent = propagate(puzzle, createDomains(puzzle, values), (run, domains, support, depth) => {
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
  })
  if (!consistent) return []
  return placements.map(({ through, ...placement }) => {
    // Keep each step that narrowed a cell used by a later step in this proof.
    const needed = new Set([placement.cell])
    const steps = trace.slice(0, through).reverse().filter(({ run, changes }) => {
      if (!changes.some(({ cell }) => needed.has(cell))) return false
      for (const cell of run.cells) needed.add(cell)
      return true
    }).reverse()
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
  const visit = (domains: number[]) => {
    if (nodes >= nodeLimit) {
      limited = true
      return
    }
    nodes++
    if (!propagate(puzzle, domains)) return
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

// Count the candidates left after run deductions. A fully resolved puzzle
// has exactly one candidate per white cell.
export function countKakuroCandidates(puzzle: KakuroPuzzle): number | null {
  const domains = createDomains(puzzle, [])
  if (!propagate(puzzle, domains)) return null
  return domains.reduce((count, mask) => count + digitCounts[mask], 0)
}
