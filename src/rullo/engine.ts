export const KEEP = 1
export const REMOVE = 2
const undecided = KEEP | REMOVE

type Choice = typeof KEEP | typeof REMOVE
type Line = {
  axis: 'row' | 'column'
  index: number
  target: number
  cells: number[]
  masks: number[]
}

export type RulloPuzzle = {
  width: number
  height: number
  numbers: readonly number[]
  lines: readonly Line[]
}

type Decision = { cell: number; value: Choice }
type Step = { line: Line; combinations: number; decisions: Decision[] }
export type RulloHint = Decision & { steps: Step[] }

export function createRullo(numbers: readonly number[], rows: readonly number[], columns: readonly number[]): RulloPuzzle {
  const width = columns.length
  const height = rows.length
  if (width < 2 || width > 8 || height < 2 || height > 8 ||
    numbers.length !== width * height || numbers.some(number => !Number.isInteger(number) || number < 1 || number > 19)) {
    throw new Error('Invalid Rullo grid')
  }

  function line(axis: Line['axis'], index: number, target: number, cells: number[]): Line {
    if (!Number.isInteger(target) || target < 0 || target > cells.reduce((sum, cell) => sum + numbers[cell], 0)) {
      throw new Error('Invalid Rullo target')
    }
    const masks: number[] = []
    for (let mask = 0; mask < 1 << cells.length; mask++) {
      const total = cells.reduce((sum, cell, offset) => sum + (mask & (1 << offset) ? numbers[cell] : 0), 0)
      if (total === target) masks.push(mask)
    }
    return { axis, index, target, cells, masks }
  }

  const rowLines = rows.map((target, row) =>
    line('row', row, target, Array.from({ length: width }, (_, col) => row * width + col)))
  const columnLines = columns.map((target, col) =>
    line('column', col, target, Array.from({ length: height }, (_, row) => row * width + col)))
  return { width, height, numbers: [...numbers], lines: [...rowLines, ...columnLines] }
}

function domainsOf(puzzle: RulloPuzzle, values: readonly number[]) {
  return puzzle.numbers.map((_, cell) => {
    const value = values[cell] ?? 0
    return value === 0 ? undecided : value === KEEP || value === REMOVE ? value : 0
  })
}

function lineSupport(line: Line, domains: readonly number[]) {
  let kept = 0
  let removed = 0
  for (const [offset, cell] of line.cells.entries()) {
    const domain = domains[cell]
    if (!(domain & KEEP)) removed |= 1 << offset
    if (!(domain & REMOVE)) kept |= 1 << offset
  }
  let anyKeep = 0
  let anyRemove = 0
  let combinations = 0
  for (const mask of line.masks) {
    if ((mask & kept) !== kept || (mask & removed)) continue
    anyKeep |= mask
    anyRemove |= ~mask
    combinations++
  }
  return { anyKeep, anyRemove, combinations }
}

export function checkRullo(puzzle: RulloPuzzle, values: readonly number[]) {
  const domains = domainsOf(puzzle, values)
  const conflicts = puzzle.lines.filter(line => lineSupport(line, domains).combinations === 0)
  return { complete: !conflicts.length && domains.every(domain => domain === KEEP || domain === REMOVE), conflicts }
}

function propagate(puzzle: RulloPuzzle, domains: number[], trace?: Step[]) {
  let changed = true
  while (changed) {
    changed = false
    for (const line of puzzle.lines) {
      const { anyKeep, anyRemove, combinations } = lineSupport(line, domains)
      if (!combinations) return false
      const decisions: Decision[] | undefined = trace && []
      for (const [offset, cell] of line.cells.entries()) {
        if (domains[cell] !== undecided) continue
        const bit = 1 << offset
        if ((anyKeep & bit) && (anyRemove & bit)) continue
        const value = anyKeep & bit ? KEEP : REMOVE
        domains[cell] = value
        changed = true
        decisions?.push({ cell, value })
      }
      if (decisions?.length) trace?.push({ line, combinations, decisions })
    }
  }
  return true
}

export function findRulloHints(puzzle: RulloPuzzle, values: readonly number[], limit = Infinity): RulloHint[] {
  const trace: Step[] = []
  if (!propagate(puzzle, domainsOf(puzzle, values), trace)) return []
  const hints: RulloHint[] = []
  for (const [index, step] of trace.entries()) {
    for (const decision of step.decisions) {
      if (hints.length >= limit) return hints
      const needed = new Set([decision.cell])
      const steps = trace.slice(0, index + 1).reverse().filter(previous => {
        if (!previous.decisions.some(({ cell }) => needed.has(cell))) return false
        for (const cell of previous.line.cells) needed.add(cell)
        return true
      }).reverse()
      hints.push({ ...decision, steps })
    }
  }
  return hints
}

/** Find up to two completions so a caller can distinguish unique puzzles. */
export function solveRullo(puzzle: RulloPuzzle, values: readonly number[] = [], nodeLimit = 20_000) {
  const solutions: number[][] = []
  let nodes = 0
  let limited = false
  function search(domains: number[]) {
    if (solutions.length === 2) return
    if (nodes >= nodeLimit) {
      limited = true
      return
    }
    nodes++
    if (!propagate(puzzle, domains)) return
    const cell = domains.indexOf(undecided)
    if (cell === -1) {
      solutions.push(domains)
      return
    }
    for (const value of [KEEP, REMOVE]) {
      const next = [...domains]
      next[cell] = value
      search(next)
    }
  }
  search(domainsOf(puzzle, values))
  const status = solutions.length === 2 ? 'multiple' : limited ? 'search-limit'
    : solutions.length === 1 ? 'unique' : 'unsolvable'
  return { status, solution: solutions[0] ?? null, nodes } as const
}
