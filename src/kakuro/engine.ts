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
function runSupport(run: KakuroRun, domains: readonly number[]): number[] | null {
  const allowed = run.cells.map(cell => domains[cell])
  if (allowed.includes(0)) return null
  const length = allowed.length
  const combinations = totalsByLength[length][run.total]
  if (allowed.every(mask => mask === allDigits)) {
    return new Array<number>(length).fill(possibleDigits[length][run.total])
  }
  const union = allowed.reduce((mask, digits) => mask | digits, 0)
  if (allowed.every(mask => digitCounts[mask] === 1)) {
    return combinations.includes(union) ? allowed : null
  }

  const order = allowed.map((_, i) => i).sort((a, b) => digitCounts[allowed[a]] - digitCounts[allowed[b]])
  const support = allowed.map(() => 0)
  const memo = new Int8Array(allDigits + 1)
  const walked = new Uint8Array(allDigits + 1)
  function canAssign(remaining: number): boolean {
    if (!remaining) return true
    if (memo[remaining]) return memo[remaining] > 0
    const index = order[order.length - digitCounts[remaining]]
    for (let choices = remaining & allowed[index]; choices; choices &= choices - 1) {
      if (canAssign(remaining ^ (choices & -choices))) {
        memo[remaining] = 1
        return true
      }
    }
    memo[remaining] = -1
    return false
  }

  function collect(remaining: number): void {
    if (!remaining || walked[remaining]) return
    walked[remaining] = 1
    const index = order[order.length - digitCounts[remaining]]
    for (let choices = remaining & allowed[index]; choices; choices &= choices - 1) {
      const digit = choices & -choices
      const next = remaining ^ digit
      if (canAssign(next)) {
        support[index] |= digit
        collect(next)
      }
    }
  }

  for (const combination of combinations) {
    if ((combination & union) === combination && canAssign(combination)) collect(combination)
    if (support.every((mask, i) => mask === allowed[i])) break
  }
  return support[0] ? support : null
}

export function checkKakuro(puzzle: KakuroPuzzle, values: readonly number[]) {
  const domains = createDomains(puzzle, values)
  const conflicts = puzzle.runs.filter(run => !runSupport(run, domains))
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
  let changed = true
  let depth = 0
  while (changed) {
    changed = false
    depth++
    for (const run of puzzle.runs) {
      const support = runSupport(run, domains)
      if (!support) return false
      const firstChange = run.cells.findIndex((cell, i) => support[i] !== domains[cell])
      if (firstChange === -1) continue
      recordStep?.(run, domains, support, depth)
      for (let i = firstChange; i < run.cells.length; i++) domains[run.cells[i]] = support[i]
      changed = true
    }
  }
  return true
}

export function findKakuroHint(puzzle: KakuroPuzzle, values: readonly number[]): KakuroHint | null {
  const trace: KakuroHintStep[] = []
  let placement: Pick<KakuroHint, 'cell' | 'digit' | 'depth'> | undefined
  const consistent = propagate(puzzle, createDomains(puzzle, values), (run, domains, support, depth) => {
    if (placement) return
    const changes: KakuroCandidateChange[] = []
    for (const [i, cell] of run.cells.entries()) {
      const remainingMask = support[i]
      const removedMask = domains[cell] & ~remainingMask
      if (!removedMask) continue
      changes.push({ cell, removedMask, remainingMask })
      if (!placement && digitCounts[remainingMask] === 1) {
        placement = { cell, digit: digitFromMask(remainingMask), depth }
      }
    }
    trace.push({ run, changes })
  })
  if (!consistent || !placement) return null

  // Keep each step that narrowed a cell used by a later step in this proof.
  const needed = new Set([placement.cell])
  const steps = trace.reverse().filter(({ run, changes }) => {
    if (!changes.some(({ cell }) => needed.has(cell))) return false
    for (const cell of run.cells) needed.add(cell)
    return true
  }).reverse()
  return { ...placement, runs: [...new Set(steps.map(step => step.run))], steps }
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
