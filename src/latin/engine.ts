type RuleEvidence = {
  label: string
  cells: readonly number[]
  // A hint can highlight fewer cells than its proof needs.
  sourceCells?: readonly number[]
}

export type LatinRule = RuleEvidence & {
  kind?: 'line' | 'extra-region' | 'unnumbered-cage' | 'global-entropy' | 'quadruple' | 'parity' | 'anti-knight' | 'anti-king' | 'minimum' | 'maximum' | 'diagonal' | 'adjacent-clue' | 'non-consecutive' | 'whispers' | 'palindrome' | 'consecutive' | 'thermometer' | 'arrow' | 'pill-arrow' | 'renban' | 'lockout' | 'between' | 'entropic' | 'modular' | 'contradiction' | 'line-total' | 'cage-line' | 'x-wing' | 'naked-pair' | 'naked-triple' | 'inequality' | 'inequality-line' | 'inequality-bound' | 'inequality-chain-line' | 'line-digit-bound' | 'inequality-line-matching'
  // Derived rules are used for solving and hints. The board check uses the basic rules.
  afterBasic?: true
  support: (domains: readonly number[], explain?: (evidence: RuleEvidence) => void) => readonly number[] | null
}

export type LatinPuzzle = {
  size: number
  givens: readonly number[]
  rules: readonly LatinRule[]
}

export function bit(value: number) {
  return value > 0 ? 1 << (value - 1) : 0
}

const counts = Uint8Array.from({ length: 512 }, (_, mask) => {
  let count = 0
  for (; mask; mask &= mask - 1) count++
  return count
})

export function candidateCount(mask: number) {
  return counts[mask]
}

function valueOf(single: number) {
  return 32 - Math.clz32(single)
}

export function latinPairSupport(left: number, right: number, allowed: readonly number[]): number[] | null {
  let supportedLeft = 0, supportedRight = 0
  for (let digits = left; digits; digits &= digits - 1) {
    const mask = digits & -digits
    const partners = allowed[valueOf(mask)] & right
    if (!partners) continue
    supportedLeft |= mask
    supportedRight |= partners
  }
  return supportedLeft ? [supportedLeft, supportedRight] : null
}

export function cellLabel(cell: number, size: number) {
  return `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
}

export function distinctCellSupport(cells: readonly number[], domains: readonly number[], requiredDigits: number): number[] | null {
  let fixed = 0
  for (const cell of cells) {
    const mask = domains[cell]
    if (!mask) return null
    if (counts[mask] !== 1) continue
    if (fixed & mask) return null
    fixed |= mask
  }

  const supported = cells.map(cell => counts[domains[cell]] === 1 ? domains[cell] : domains[cell] & ~fixed)
  for (let choices = requiredDigits & ~fixed; choices; choices &= choices - 1) {
    const digit = choices & -choices
    let only = -1
    for (let i = 0; i < supported.length; i++) {
      if (!(supported[i] & digit)) continue
      if (only !== -1) {
        only = -2
        break
      }
      only = i
    }
    if (only === -1) return null
    if (only >= 0) supported[only] = digit
  }
  return supported.includes(0) ? null : supported
}

const linesBySize: (readonly LatinRule[])[] = []

export function latinLineRules(size: number): readonly LatinRule[] {
  const cached = linesBySize[size]
  if (cached) return cached
  const all = (1 << size) - 1
  const indices = Array.from({ length: size }, (_, i) => i)
  const rules: LatinRule[] = []
  for (const [axis, at] of [
    ['Row', (line: number, offset: number) => line * size + offset],
    ['Column', (line: number, offset: number) => offset * size + line],
  ] as const) {
    for (const line of indices) {
      const cells = indices.map(offset => at(line, offset))
      rules.push({ kind: 'line', label: `${axis} ${line + 1}`, cells, support: domains => distinctCellSupport(cells, domains, all) })
    }
  }
  linesBySize[size] = rules
  return rules
}

export function createLatinPuzzle(size: number, givens: readonly number[], extra: readonly LatinRule[]): LatinPuzzle {
  if (!Number.isInteger(size) || size < 3 || size > 9 || givens.length !== size * size ||
    givens.some(value => !Number.isInteger(value) || value < 0 || value > size)) {
    throw new Error('Invalid Latin puzzle size or givens.')
  }
  return { size, givens, rules: [...extra, ...latinLineRules(size)] }
}

function initialDomains(puzzle: LatinPuzzle, values: readonly number[]) {
  const all = (1 << puzzle.size) - 1
  return puzzle.givens.map((given, index) => {
    const value = values[index] ?? 0
    if ((value && given && value !== given) || !Number.isInteger(value) || value < 0 || value > puzzle.size) return 0
    return bit(given || value) || all
  })
}

export function checkLatin(puzzle: LatinPuzzle, values: readonly number[]) {
  const domains = initialDomains(puzzle, values)
  const conflicts = puzzle.rules.filter(rule => !rule.afterBasic && rule.support(domains) === null)
  return {
    conflicts,
    complete: conflicts.length === 0 && domains.every(mask => counts[mask] === 1),
  }
}

type LatinReason = Omit<LatinRule, 'support'>
type RuleChanged = (cell: number, rule: LatinReason, depth: number, mask: number) => void

function propagate(puzzle: LatinPuzzle, domains: number[], onChange?: RuleChanged) {
  for (let depth = 1; ; depth++) {
    let changed = false
    let solved: boolean | undefined
    for (const rule of puzzle.rules) {
      if (rule.afterBasic && (changed || (solved ??= domains.every(mask => counts[mask] === 1)))) continue
      let reason: LatinReason = rule
      const supported = rule.support(domains, rule.afterBasic && onChange ? evidence => {
        reason = { ...evidence, kind: rule.kind, afterBasic: true }
      } : undefined)
      if (!supported) return rule
      rule.cells.forEach((cell, index) => {
        if (domains[cell] === supported[index]) return
        domains[cell] = supported[index]
        onChange?.(cell, reason, depth, supported[index])
        changed = true
      })
    }
    if (!changed) return
  }
}

export type LatinHint = {
  cell: number; value: number; rules: LatinReason[]; depth: number
  trace?: { assumption: string; steps: string[]; conclusion: string }[]
}

export function findLatinHint(puzzle: LatinPuzzle, values: readonly number[]): LatinHint | null {
  return findLatinHints(puzzle, values, 1)[0] ?? null
}

export function findLatinHints(puzzle: LatinPuzzle, values: readonly number[], limit = Infinity): LatinHint[] {
  return collectLatinHints(puzzle, values, limit, false)
}

/** Return placements in order, with each earlier placement visible during the next step. */
export function findLatinSolutionHints(puzzle: LatinPuzzle, values: readonly number[]): LatinHint[] {
  return collectLatinHints(puzzle, values, Infinity, true)
}

function collectLatinHints(
  puzzle: LatinPuzzle, values: readonly number[], limit: number, replaying: boolean,
): LatinHint[] {
  const domains = initialDomains(puzzle, values)
  const dependencies: Array<Set<LatinReason> | undefined> = []
  const hints: LatinHint[] = []
  const conflict = propagate(puzzle, domains, (cell, rule, depth) => {
    if (hints.length >= limit) return
    const reasons = new Set([rule])
    for (const peer of rule.sourceCells ?? rule.cells) {
      for (const reason of dependencies[peer] ?? []) reasons.add(reason)
    }
    // A derived rule can cite only the cells that support the deduction.
    if (rule.afterBasic) for (const prior of dependencies[cell] ?? []) reasons.add(prior)
    dependencies[cell] = reasons
    if (!puzzle.givens[cell] && !values[cell] && counts[domains[cell]] === 1) {
      hints.push({ cell, value: valueOf(domains[cell]), rules: [...reasons], depth })
      // The next step can cite the placed digit without repeating its proof.
      if (replaying) dependencies[cell] = undefined
    }
  })
  if (conflict) return []
  if (hints.length || limit <= 0 || !puzzle.rules.some(isForcingClue)) return hints
  const forced = tryCandidatePlacements(puzzle, domains, dependencies)
  return forced ? [forced] : []
}

function isForcingClue({ kind }: LatinReason) {
  return kind === 'whispers' || kind === 'palindrome' || kind === 'consecutive' ||
    kind === 'thermometer' || kind === 'arrow' || kind === 'pill-arrow' || kind === 'renban' || kind === 'lockout' || kind === 'between' ||
    kind === 'minimum' || kind === 'maximum' || kind === 'modular' || kind === 'non-consecutive' || kind === 'anti-king' || kind === 'diagonal' || kind === 'extra-region' || kind === 'global-entropy' || kind === 'quadruple' || kind === 'parity'
}

export const latinContradictionTechnique = 'Contradiction'

type TrialChange = {
  cell: number; rule: LatinReason; mask: number; order: number; causes: TrialChange[]
}

function tryCandidatePlacements(puzzle: LatinPuzzle, domains: readonly number[], dependencies: readonly (Set<LatinReason> | undefined)[]) {
  // Limit the extra work when none of the direct rules gives a placement.
  const hasModular = puzzle.rules.some(rule => rule.kind === 'modular')
  const hasDiagonal = puzzle.rules.some(rule => rule.kind === 'diagonal')
  // Long paths and diagonals can link distant cells. Try wider branches within the limit.
  const maxCandidates = hasModular ? 4
    : hasDiagonal || puzzle.rules.some(rule => rule.kind === 'palindrome' || rule.kind === 'consecutive') ? 3 : 2
  let trials = hasModular || hasDiagonal ? 48 : 16
  for (let count = 2; count <= maxCandidates; count++) for (const [cell, mask] of domains.entries()) {
    if (counts[mask] !== count) continue
    let remaining = mask
    const cases: NonNullable<LatinHint['trace']> = []
    const failed = new Set<number>([cell])
    const name = cellLabel(cell, puzzle.size)
    const setup = `${name} has candidates ${digitsInMask(mask, puzzle.size).join(', ')}.`
    const reasons = [...(dependencies[cell] ?? [])].map(reasonSentence)
    for (let digits = mask; digits && counts[remaining] > 1; digits &= digits - 1) {
      if (!trials--) return
      const tested = digits & -digits
      const result = trialConflict(puzzle, domains, cell, tested)
      if (!result) continue
      result.cells.forEach(peer => failed.add(peer))
      remaining ^= tested
      cases.push({
        assumption: `If ${name} is ${valueOf(tested)}, the rules lead to a conflict.`,
        steps: [...reasons, setup, ...result.steps],
        conclusion: result.label,
      })
    }
    if (counts[remaining] === 1) {
      const value = valueOf(remaining)
      return {
        cell, value, depth: 1,
        rules: [
          { kind: 'contradiction', cells: [...failed], label: cases.length === 1 ? cases[0].assumption : setup },
          ...cases.map(({ conclusion }) => ({ kind: 'contradiction' as const, cells: [...failed], label: conclusion })),
        ],
        trace: cases,
      } satisfies LatinHint
    }
  }
}

function trialConflict(puzzle: LatinPuzzle, domains: readonly number[], cell: number, tested: number) {
  const trial = domains.slice()
  trial[cell] = tested
  // Build a proof only when the assumption actually causes a conflict.
  if (!propagate(puzzle, trial)) return

  const changes: Array<TrialChange | undefined> = []
  let order = 0
  const traced = domains.slice()
  traced[cell] = tested
  const conflict = propagate(puzzle, traced, (changed, rule, _depth, supported) => {
    const causes = new Set([...(rule.sourceCells ?? rule.cells), changed].flatMap(peer => changes[peer] ?? []))
    changes[changed] = { cell: changed, rule, mask: supported, order: order++, causes: [...causes] }
  })
  if (!conflict) return

  const result = describeTrialConflict(puzzle.size, conflict, traced)
  const proof = new Set(result.cells.flatMap(peer => changes[peer] ?? []))
  for (const change of proof) for (const prior of change.causes) proof.add(prior)
  if (!isForcingClue(conflict) && ![...proof].some(change => isForcingClue(change.rule))) return
  const steps = [...proof].sort((a, b) => a.order - b.order).map(change => {
    const choices = digitsInMask(change.mask, puzzle.size)
    const target = cellLabel(change.cell, puzzle.size)
    const next = choices.length === 1 ? `${target} must be ${choices[0]}.` : `${target} has candidates ${choices.join(', ')}.`
    return `${reasonSentence(change.rule)} ${next}`
  })
  return { ...result, steps }
}

function digitsInMask(mask: number, size: number) {
  return Array.from({ length: size }, (_, index) => index + 1).filter(digit => mask & bit(digit))
}

function reasonSentence(rule: LatinReason) {
  return rule.kind === 'line' ? `${rule.label} must use each digit once.` : rule.label.replace(/([^.])$/, '$1.')
}

function describeTrialConflict(size: number, conflict: LatinReason, domains: readonly number[]) {
  const { label, cells, kind } = conflict
  if (kind !== 'line') return { cells, label: `These candidates cannot satisfy the rule. ${reasonSentence(conflict)}` }
  const seen = new Map<number, number>()
  let digits = 0
  for (const cell of cells) {
    const mask = domains[cell]
    if (!mask) return { cells: [cell], label: `${cellLabel(cell, size)} has no candidate.` }
    digits |= mask
    if (counts[mask] !== 1) continue
    const duplicate = seen.get(mask)
    if (duplicate !== undefined) return {
      cells: [duplicate, cell],
      label: `${cellLabel(duplicate, size)} and ${cellLabel(cell, size)} both need ${valueOf(mask)} in ${label.toLowerCase()}.`,
    }
    seen.set(mask, cell)
  }
  const missing = ((1 << size) - 1) & ~digits
  return {
    cells,
    label: missing ? `${label} has no cell for ${valueOf(missing & -missing)}.` : `${label} cannot use each digit once.`,
  }
}

type ExactQueue = { basic: number[]; advanced: number[]; queued: Uint8Array }

// Search starts from a fixed point at every child. Recheck rules that
// touch changed cells and finish the basic rules before any advanced rule.
function propagateExact(
  rules: readonly LatinRule[], domains: number[], rulesByCell: readonly number[][], first: readonly number[],
  { basic, advanced, queued }: ExactQueue,
) {
  basic.length = 0
  advanced.length = 0
  queued.fill(0)
  for (const index of first) {
    queued[index] = 1
    const queue = rules[index].afterBasic ? advanced : basic
    queue.push(index)
  }

  let basicFront = 0
  let advancedFront = 0
  let checkSolved = true
  while (true) {
    let index: number
    if (basicFront < basic.length) index = basic[basicFront++]
    else {
      if (advancedFront === advanced.length || (checkSolved && domains.every(mask => counts[mask] === 1))) return true
      checkSolved = false
      index = advanced[advancedFront++]
    }
    queued[index] = 0
    const rule = rules[index]
    const support = rule.support(domains)
    if (!support) return false
    for (let offset = 0; offset < rule.cells.length; offset++) {
      const cell = rule.cells[offset]
      if (domains[cell] === support[offset]) continue
      domains[cell] = support[offset]
      checkSolved = true
      for (const next of rulesByCell[cell]) {
        if (queued[next]) continue
        queued[next] = 1
        const queue = rules[next].afterBasic ? advanced : basic
        queue.push(next)
      }
    }
  }
}

export function solveLatin(puzzle: LatinPuzzle, values: readonly number[] = [], limit = 20_000) {
  let nodes = 0
  let limited = false
  const solutions: number[][] = []
  const rulesByCell: number[][] = puzzle.givens.map(() => [])
  puzzle.rules.forEach((rule, index) => {
    for (const cell of rule.cells) rulesByCell[cell].push(index)
  })
  const work: ExactQueue = { basic: [], advanced: [], queued: new Uint8Array(puzzle.rules.length) }
  function visit(domains: number[], pending: readonly number[]) {
    if (nodes >= limit) {
      limited = true
      return
    }
    nodes++
    if (!propagateExact(puzzle.rules, domains, rulesByCell, pending, work)) return
    let branch = -1
    let smallest = puzzle.size + 1
    for (let i = 0; i < domains.length; i++) {
      const count = counts[domains[i]]
      if (count > 1 && count < smallest) {
        branch = i
        smallest = count
      }
    }
    if (branch === -1) {
      solutions.push(domains.map(valueOf))
      return
    }
    for (let choices = domains[branch]; choices && !limited && solutions.length < 2; choices &= choices - 1) {
      const next = domains.slice()
      next[branch] = choices & -choices
      visit(next, rulesByCell[branch])
    }
  }
  visit(initialDomains(puzzle, values), puzzle.rules.map((_, index) => index))
  const status = limited ? 'search-limit' : (['unsolvable', 'unique', 'multiple'] as const)[solutions.length]
  return { status, solution: solutions[0] ?? null, nodes }
}
