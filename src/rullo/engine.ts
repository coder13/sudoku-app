import { crossingTripleSupport, type CrossingLineChoices } from './crossing-triples.ts'

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
type LineStep = { line: Line; combinations: number; decisions: Decision[] }
type PairComparison = {
  options: readonly [readonly number[], readonly number[]]
  rejected: { options: readonly [number, number]; crossing: Line }[]
}
type CrossingStep = {
  lines: readonly [Line, Line] | readonly [Line, Line, Line]
  crossings: Line[]
  combinations: number
  decisions: Decision[]
  comparison?: PairComparison
}
type ContradictionStep = { assumption: Decision; rejectedBy: Line; deductions: LineStep[]; decisions: Decision[] }
type AdvancedStep = CrossingStep | ContradictionStep
type Step = LineStep | AdvancedStep
type Trace = {
  recordLine: (step: LineStep) => boolean
  recordAdvanced?: (step: AdvancedStep) => boolean
  stopBeforeAdvanced?: () => boolean
  failedLine?: Line
}
export const rulloTechniques = ['Line sum', 'Crossing line sums', 'Three-line sums', 'Contradiction'] as const
export type RulloHint = Decision & { steps: Step[]; technique: typeof rulloTechniques[number] }

export function createRullo(numbers: readonly number[], rows: readonly number[], columns: readonly number[]): RulloPuzzle {
  const width = columns.length
  const height = rows.length
  if (width < 2 || width > 8 || height < 2 || height > 8 ||
    numbers.length !== width * height || numbers.some(number => !Number.isInteger(number) || number < 1 || number > 19)) {
    throw new Error('Invalid Rullo grid')
  }

  // At most eight numbers of 19 fit in a byte. Reuse the buffer for each line.
  const sums = new Uint8Array(1 << Math.max(width, height))
  function line(axis: Line['axis'], index: number, target: number, cells: number[]): Line {
    if (!Number.isInteger(target) || target < 0 || target > cells.reduce((sum, cell) => sum + numbers[cell], 0)) {
      throw new Error('Invalid Rullo target')
    }
    const masks = target === 0 ? [0] : []
    for (const [offset, cell] of cells.entries()) {
      const bit = 1 << offset
      const number = numbers[cell]
      // Extend the subsets of the earlier cells with this cell.
      for (let previous = 0; previous < bit; previous++) {
        const mask = previous | bit
        const sum = sums[previous] + number
        sums[mask] = sum
        if (sum === target) masks.push(mask)
      }
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

function lineSupport(line: Line, domains: readonly number[], matching?: number[]) {
  let kept = 0
  let removed = 0
  for (let offset = 0; offset < line.cells.length; offset++) {
    const domain = domains[line.cells[offset]]
    if (!(domain & KEEP)) removed |= 1 << offset
    if (!(domain & REMOVE)) kept |= 1 << offset
  }
  let anyKeep = 0
  let anyRemove = 0
  let combinations = 0
  for (const mask of line.masks) {
    if ((mask & kept) !== kept || (mask & removed)) continue
    matching?.push(mask)
    anyKeep |= mask
    anyRemove |= ~mask
    combinations++
  }
  return { anyKeep, anyRemove, combinations }
}

export function checkRullo(puzzle: RulloPuzzle, values: readonly number[], { keepUnmarked = false } = {}) {
  const domains = domainsOf(puzzle, values)
  const conflicts = puzzle.lines.filter(line => lineSupport(line, domains).combinations === 0)
  const complete = !conflicts.length && (keepUnmarked
    ? puzzle.lines.every(line => {
      const kept = line.cells.reduce((mask, cell, offset) => mask | (domains[cell] & KEEP ? 1 << offset : 0), 0)
      return line.masks.includes(kept)
    })
    : domains.every(domain => domain === KEEP || domain === REMOVE))
  return { complete, conflicts }
}

type LineChoices = { line: Line } & CrossingLineChoices

function crossingLinesInMask(crossing: readonly LineChoices[], mask: number) {
  return crossing.filter((_, offset) => mask & (1 << offset)).map(({ line }) => line)
}

// For two options per line, a hint can name the first target that rules
// out each rejected pair. Larger crossings use the count in the hint.
function comparePairOptions(first: LineChoices, second: LineChoices, crossings: readonly LineChoices[]): PairComparison {
  const rejected: PairComparison['rejected'] = []
  for (const [i, a] of first.masks.entries()) {
    for (const [j, b] of second.masks.entries()) {
      const failure = crossings.find(({ masks }, offset) => {
        const firstKept = (a >> offset) & 1
        const secondKept = (b >> offset) & 1
        return !masks.some(mask =>
          ((mask >> first.line.index) & 1) === firstKept && ((mask >> second.line.index) & 1) === secondKept)
      })
      if (failure) rejected.push({ options: [i, j], crossing: failure.line })
    }
  }
  return { options: [first.masks, second.masks], rejected }
}

function crossingPair(first: LineChoices, second: LineChoices, crossing: readonly LineChoices[], domains: readonly number[]) {
  // After the line checks, a crossing can restrict a pair only at two undecided cells.
  const variable = first.variable & second.variable
  if (!variable) return undefined
  // Include crossings with fixed cells in the proof.
  let restricted = ((1 << crossing.length) - 1) & ~variable
  let keepWhenRemoved = 0
  let removeWhenRemoved = 0
  let keepWhenKept = 0
  let removeWhenKept = 0
  const firstIndex = first.line.index
  const secondIndex = second.line.index
  for (let offset = 0; offset < crossing.length; offset++) {
    const bit = 1 << offset
    if (!(variable & bit)) continue
    let choices = 0
    const masks = crossing[offset].masks
    for (let i = 0; i < masks.length; i++) {
      const mask = masks[i]
      const pair = ((mask >> firstIndex) & 1) | (((mask >> secondIndex) & 1) << 1)
      choices |= 1 << pair
      if (choices === 0b1111) break
    }
    if (choices === 0b1111) continue
    restricted |= bit
    // Record what the second line must do at this crossing for each first-line choice.
    if (!(choices & 0b0001)) keepWhenRemoved |= bit
    if (!(choices & 0b0100)) removeWhenRemoved |= bit
    if (!(choices & 0b0010)) keepWhenKept |= bit
    if (!(choices & 0b1000)) removeWhenKept |= bit
  }
  if (!(restricted & variable)) return undefined

  let combinations = 0
  let firstKeep = 0
  let firstRemove = 0
  let secondKeep = 0
  let secondRemove = 0
  for (let i = 0; i < first.masks.length; i++) {
    const a = first.masks[i]
    const mustKeep = (~a & keepWhenRemoved) | (a & keepWhenKept)
    const mustRemove = (~a & removeWhenRemoved) | (a & removeWhenKept)
    if (mustKeep & mustRemove) continue
    const constrained = mustKeep | mustRemove
    for (let j = 0; j < second.masks.length; j++) {
      const b = second.masks[j]
      if ((b & constrained) !== mustKeep) continue
      combinations++
      firstKeep |= a
      firstRemove |= ~a
      secondKeep |= b
      secondRemove |= ~b
      // Both choices still fit for every undecided cell. This pair has no move.
      if ((firstKeep & firstRemove) === first.variable &&
        (secondKeep & secondRemove) === second.variable) return undefined
    }
  }
  if (!combinations) return null

  const decisions: Decision[] = []
  const lines = [first.line, second.line] as const
  collectDecisions(first.line, domains, firstKeep, firstRemove, decisions)
  collectDecisions(second.line, domains, secondKeep, secondRemove, decisions)
  if (!decisions.length) return undefined
  const step: CrossingStep = { lines, crossings: crossingLinesInMask(crossing, restricted), combinations, decisions }
  if (combinations === 1 && first.masks.length === 2 && second.masks.length === 2) {
    step.comparison = comparePairOptions(first, second, crossing)
  }
  return step
}

function collectDecisions(line: Line, domains: readonly number[], kept: number, removed: number, decisions: Decision[]) {
  for (const [offset, cell] of line.cells.entries()) {
    if (domains[cell] !== undecided) continue
    const bit = 1 << offset
    if ((kept & bit) && (removed & bit)) continue
    decisions.push({ cell, value: kept & bit ? KEEP : REMOVE })
  }
}

function crossingTriple(
  choices: readonly [LineChoices, LineChoices, LineChoices],
  crossing: readonly LineChoices[],
  domains: readonly number[],
): CrossingStep | null | undefined {
  const [first, second, third] = choices
  // Look for crossings with two or three undecided cells in the chosen lines.
  const variable = (first.variable & second.variable) | (first.variable & third.variable) | (second.variable & third.variable)
  if (!variable) return undefined
  // The inner search caches the final line. Leave the most choices for it.
  let ordered = choices
  if (first.masks.length > second.masks.length && first.masks.length > third.masks.length) {
    ordered = [third, second, first]
  } else if (second.masks.length > third.masks.length) {
    ordered = [first, third, second]
  }
  const firstIndex = ordered[0].line.index
  const secondIndex = ordered[1].line.index
  const thirdIndex = ordered[2].line.index
  let restricted = ((1 << crossing.length) - 1) & ~variable
  const restrictions = []
  for (let offset = 0; offset < crossing.length; offset++) {
    const bit = 1 << offset
    if (!(variable & bit)) continue
    let patterns = 0
    const masks = crossing[offset].masks
    for (let i = 0; i < masks.length; i++) {
      const mask = masks[i]
      const bits = ((mask >> firstIndex) & 1) | (((mask >> secondIndex) & 1) << 1) | (((mask >> thirdIndex) & 1) << 2)
      patterns |= 1 << bits
      if (patterns === 0xff) break
    }
    if (patterns === 0xff) continue
    restricted |= bit
    restrictions.push({ offset, patterns })
  }
  if (!restrictions.length) return undefined
  const support = crossingTripleSupport(ordered, restrictions)
  if (!support) return support
  // Keep the grid order in the hint, regardless of search order.
  const lines = [first.line, second.line, third.line] as const
  const decisions: Decision[] = []
  for (const choice of choices) {
    const index = ordered.indexOf(choice)
    collectDecisions(choice.line, domains, support.kept[index], support.removed[index], decisions)
  }
  return decisions.length ? {
    lines, crossings: crossingLinesInMask(crossing, restricted), combinations: support.count, decisions,
  } : undefined
}

// Two line combinations must use choices that can coexist in each crossing line.
function findCrossingStep(puzzle: RulloPuzzle, domains: readonly number[]): CrossingStep | null | undefined {
  const choices = puzzle.lines.map(line => {
    const masks: number[] = []
    const { anyKeep, anyRemove } = lineSupport(line, domains, masks)
    return { line, masks, variable: anyKeep & anyRemove }
  })
  const rows = choices.slice(0, puzzle.height)
  const columns = choices.slice(puzzle.height)
  const axes = [[rows, columns], [columns, rows]]
  for (const [parallel, crossing] of axes) {
    for (const [index, first] of parallel.entries()) {
      if (first.masks.length < 2) continue
      for (let next = index + 1; next < parallel.length; next++) {
        const second = parallel[next]
        if (second.masks.length < 2) continue
        const step = crossingPair(first, second, crossing, domains)
        if (step !== undefined) return step
      }
    }
  }
  for (const [parallel, crossing] of axes) {
    const varying = parallel.filter(({ masks }) => masks.length > 1)
    for (let a = 0; a < varying.length - 2; a++) {
      for (let b = a + 1; b < varying.length - 1; b++) {
        for (let c = b + 1; c < varying.length; c++) {
          const step = crossingTriple([varying[a], varying[b], varying[c]], crossing, domains)
          if (step !== undefined) return step
        }
      }
    }
  }
}

function findContradictionStep(puzzle: RulloPuzzle, domains: readonly number[]): ContradictionStep | undefined {
  for (const [cell, domain] of domains.entries()) {
    if (domain !== undecided) continue
    for (const value of [KEEP, REMOVE] as const) {
      const trial = domains.slice()
      trial[cell] = value
      if (propagate(puzzle, trial, undefined, cell)) continue

      // Replay the failed choice to record only the line sums that explain it.
      const deductions: LineStep[] = []
      const trace: Trace = {
        recordLine(step) {
          deductions.push(step)
          return false
        },
      }
      const replay = domains.slice()
      replay[cell] = value
      propagate(puzzle, replay, trace, cell)
      const rejectedBy = trace.failedLine
      if (!rejectedBy) continue
      const needed = new Uint8Array(domains.length)
      markLineCells(rejectedBy, needed)
      return {
        assumption: { cell, value }, rejectedBy,
        deductions: relatedProof(deductions, deductions.length, needed),
        decisions: [{ cell, value: value === KEEP ? REMOVE : KEEP }],
      }
    }
  }
}

function propagate(
  puzzle: RulloPuzzle, domains: number[], trace?: Trace, changedCell?: number,
) {
  const allLines = (1 << puzzle.lines.length) - 1
  // A search branch starts from a fully propagated position and changes one cell.
  let pending = changedCell === undefined ? allLines
    : (1 << Math.floor(changedCell / puzzle.width)) | (1 << (puzzle.height + changedCell % puzzle.width))
  while (pending) {
    for (let index = 0; index < puzzle.lines.length; index++) {
      const lineBit = 1 << index
      if (!(pending & lineBit)) continue
      pending &= ~lineBit
      const line = puzzle.lines[index]
      const { anyKeep, anyRemove, combinations } = lineSupport(line, domains)
      if (!combinations) {
        if (trace) trace.failedLine = line
        return false
      }
      const decisions: Decision[] | undefined = trace && []
      for (let offset = 0; offset < line.cells.length; offset++) {
        const cell = line.cells[offset]
        if (domains[cell] !== undecided) continue
        const bit = 1 << offset
        if ((anyKeep & bit) && (anyRemove & bit)) continue
        const value = anyKeep & bit ? KEEP : REMOVE
        domains[cell] = value
        // Every matching choice for this line already includes the new decision.
        // Recheck only the line across it. Keep the row and column scan order for hints.
        pending |= 1 << (line.axis === 'row' ? puzzle.height + offset : offset)
        decisions?.push({ cell, value })
      }
      if (decisions?.length && trace?.recordLine({ line, combinations, decisions })) return true
    }
    if (!pending && trace?.recordAdvanced && domains.includes(undecided)) {
      if (trace.stopBeforeAdvanced?.()) return true
      const crossing = findCrossingStep(puzzle, domains)
      if (crossing === null) return false
      const step = crossing ?? findContradictionStep(puzzle, domains)
      if (step) {
        for (const { cell, value } of step.decisions) domains[cell] = value
        if (trace.recordAdvanced(step)) return true
        pending = allLines
      }
    }
  }
  return true
}

export function findRulloHints(puzzle: RulloPuzzle, values: readonly number[], limit = Infinity): RulloHint[] {
  return collectRulloHints(puzzle, domainsOf(puzzle, values), limit) ?? []
}

/** Return proof steps in order, with each earlier choice visible on the board. */
export function findRulloSolutionHints(puzzle: RulloPuzzle, values: readonly number[]): RulloHint[] {
  return collectRulloHints(puzzle, domainsOf(puzzle, values), Infinity, { replaying: true }) ?? []
}

/** Reuse a complete grid to check compatible hint requests on the same puzzle. */
export function createRulloHintFinder(puzzle: RulloPuzzle) {
  let solution: number[] | undefined
  return (values: readonly number[], limit = Infinity): RulloHint[] => {
    const domains = domainsOf(puzzle, values)
    const compatible = solution !== undefined && solution.every((value, cell) => Boolean(domains[cell] & value))
    const hints = collectRulloHints(puzzle, domains, limit, {
      knownSolution: compatible,
      rememberSolution: verified => { solution = verified },
    })
    // Either search found a completion or the deductions filled the grid.
    if (!compatible && hints !== null && !domains.includes(undecided)) solution = domains
    return hints ?? []
  }
}

type HintTraceOptions = {
  knownSolution?: boolean
  replaying?: boolean
  rememberSolution?: (solution: number[]) => void
}

function collectRulloHints(
  puzzle: RulloPuzzle, domains: number[], limit: number,
  { knownSolution = false, replaying = false, rememberSolution }: HintTraceOptions = {},
): RulloHint[] | null {
  const trace: Step[] = []
  let found = 0
  let reachedCrossings = false
  function record(step: Step) {
    trace.push(step)
    found += step.decisions.length
    return knownSolution && found >= limit
  }
  if (!propagate(puzzle, domains, {
    recordLine: record,
    recordAdvanced: record,
    stopBeforeAdvanced: !knownSolution && Number.isFinite(limit) && limit > 0 ? () => {
      if (reachedCrossings) return false
      reachedCrossings = true
      if (found < limit) return false
      // If line sums found enough hints, a completion lets us skip the more
      // expensive crossing checks. Keep the search small. If it fails, use
      // the full logical pass to preserve the hint and contradiction behavior.
      const values = domains.map(domain => domain === undecided ? 0 : domain)
      const { solution } = solveRullo(puzzle, values, 32)
      if (!solution) return false
      rememberSolution?.(solution)
      return true
    } : undefined,
  })) return null
  const hints: RulloHint[] = []
  const needed = replaying ? undefined : new Uint8Array(domains.length)
  for (const [index, step] of trace.entries()) {
    const technique = 'line' in step ? rulloTechniques[0] : 'assumption' in step ? rulloTechniques[3]
      : step.lines.length === 2 ? rulloTechniques[1] : rulloTechniques[2]
    if (hints.length >= limit) return hints
    const proof = needed ? rulloProof(trace, index, needed) : []
    for (const decision of step.decisions) {
      if (hints.length >= limit) return hints
      const steps = replaying ? [{ ...step, decisions: [decision] }] : [...proof]
      hints.push({ ...decision, steps, technique })
    }
  }
  return hints
}

// All choices from one step have the same proof. Collect the earlier steps
// that fixed a cell used by this step, or by any of those earlier steps.
function rulloProof(trace: readonly Step[], index: number, needed: Uint8Array) {
  needed.fill(0)
  const step = trace[index]
  markStepCells(step, needed)
  const proof = relatedProof(trace, index, needed)
  proof.push(step)
  return proof
}

function relatedProof<T extends Step>(trace: readonly T[], end: number, needed: Uint8Array) {
  const proof: T[] = []
  for (let i = end - 1; i >= 0; i--) {
    const step = trace[i]
    if (!step.decisions.some(({ cell }) => needed[cell])) continue
    proof.push(step)
    markStepCells(step, needed)
  }
  return proof.reverse()
}

function markLineCells(line: Line, needed: Uint8Array) {
  for (const cell of line.cells) needed[cell] = 1
}

function markStepCells(step: Step, needed: Uint8Array) {
  if ('line' in step) {
    markLineCells(step.line, needed)
  } else if ('assumption' in step) {
    markLineCells(step.rejectedBy, needed)
    for (const deduction of step.deductions) markLineCells(deduction.line, needed)
  } else {
    for (const line of step.lines) markLineCells(line, needed)
    for (const line of step.crossings) markLineCells(line, needed)
  }
}

/** Find up to two completions so a caller can distinguish unique puzzles. */
export function solveRullo(puzzle: RulloPuzzle, values: readonly number[] = [], nodeLimit = 20_000) {
  const solutions: number[][] = []
  let nodes = 0
  let limited = false
  function search(domains: number[], changedCell?: number) {
    if (solutions.length === 2) return
    if (nodes >= nodeLimit) {
      limited = true
      return
    }
    nodes++
    if (!propagate(puzzle, domains, undefined, changedCell)) return
    const cell = domains.indexOf(undecided)
    if (cell === -1) {
      solutions.push(domains)
      return
    }
    for (const value of [KEEP, REMOVE]) {
      const next = [...domains]
      next[cell] = value
      search(next, cell)
    }
  }
  search(domainsOf(puzzle, values))
  const status = solutions.length === 2 ? 'multiple' : limited ? 'search-limit'
    : solutions.length === 1 ? 'unique' : 'unsolvable'
  return { status, solution: solutions[0] ?? null, nodes } as const
}
