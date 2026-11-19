export type LatinRule = {
  label: string
  kind?: 'line'
  cells: readonly number[]
  support: (domains: readonly number[]) => readonly number[] | null
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

function valueOf(single: number) {
  return 32 - Math.clz32(single)
}

export function cellLabel(cell: number, size: number) {
  return `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
}

function lineSupport(cells: readonly number[], domains: readonly number[], all: number): number[] | null {
  let fixed = 0
  for (const cell of cells) {
    const mask = domains[cell]
    if (!mask) return null
    if (counts[mask] !== 1) continue
    if (fixed & mask) return null
    fixed |= mask
  }

  const supported = cells.map(cell => counts[domains[cell]] === 1 ? domains[cell] : domains[cell] & ~fixed)
  for (let choices = all & ~fixed; choices; choices &= choices - 1) {
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

export function createLatinPuzzle(size: number, givens: readonly number[], extra: readonly LatinRule[]): LatinPuzzle {
  if (!Number.isInteger(size) || size < 3 || size > 9 || givens.length !== size * size ||
    givens.some(value => !Number.isInteger(value) || value < 0 || value > size)) {
    throw new Error('Invalid Latin puzzle size or givens.')
  }
  const all = (1 << size) - 1
  const indices = Array.from({ length: size }, (_, i) => i)
  const rules: LatinRule[] = [...extra]
  for (const [axis, at] of [
    ['Row', (line: number, offset: number) => line * size + offset],
    ['Column', (line: number, offset: number) => offset * size + line],
  ] as const) {
    for (const line of indices) {
      const cells = indices.map(offset => at(line, offset))
      rules.push({ kind: 'line', label: `${axis} ${line + 1}`, cells, support: domains => lineSupport(cells, domains, all) })
    }
  }
  return { size, givens, rules }
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
  const conflicts = puzzle.rules.filter(rule => rule.support(domains) === null)
  return {
    conflicts,
    complete: conflicts.length === 0 && domains.every(mask => counts[mask] === 1),
  }
}

type RuleChanged = (cell: number, rule: LatinRule, depth: number) => void

function propagate(puzzle: LatinPuzzle, domains: number[], onChange?: RuleChanged) {
  for (let depth = 1; ; depth++) {
    let changed = false
    for (const rule of puzzle.rules) {
      const supported = rule.support(domains)
      if (!supported) return false
      rule.cells.forEach((cell, index) => {
        if (domains[cell] === supported[index]) return
        domains[cell] = supported[index]
        onChange?.(cell, rule, depth)
        changed = true
      })
    }
    if (!changed) return true
  }
}

export type LatinHint = { cell: number; value: number; rules: LatinRule[]; depth: number }

export function findLatinHint(puzzle: LatinPuzzle, values: readonly number[]): LatinHint | null {
  return findLatinHints(puzzle, values, 1)[0] ?? null
}

export function findLatinHints(puzzle: LatinPuzzle, values: readonly number[], limit = Infinity): LatinHint[] {
  const domains = initialDomains(puzzle, values)
  const dependencies: Array<Set<LatinRule> | undefined> = []
  const hints: LatinHint[] = []
  const valid = propagate(puzzle, domains, (cell, rule, depth) => {
    if (hints.length >= limit) return
    const reasons = new Set([rule])
    for (const peer of rule.cells) {
      for (const reason of dependencies[peer] ?? []) reasons.add(reason)
    }
    dependencies[cell] = reasons
    if (!puzzle.givens[cell] && !values[cell] && counts[domains[cell]] === 1) {
      hints.push({ cell, value: valueOf(domains[cell]), rules: [...reasons], depth })
    }
  })
  return valid ? hints : []
}

// Search starts from a fixed point at every child. Recheck only rules that
// touch a changed cell, then queue their neighbors as domains shrink.
function propagateExact(
  puzzle: LatinPuzzle, domains: number[], rulesByCell: readonly number[][], first: readonly number[],
) {
  const queue = [...first]
  const queued = new Uint8Array(puzzle.rules.length)
  for (const rule of queue) queued[rule] = 1
  for (let front = 0; front < queue.length; front++) {
    const index = queue[front]
    queued[index] = 0
    const rule = puzzle.rules[index]
    const support = rule.support(domains)
    if (!support) return false
    rule.cells.forEach((cell, offset) => {
      if (domains[cell] === support[offset]) return
      domains[cell] = support[offset]
      for (const next of rulesByCell[cell]) {
        if (queued[next]) continue
        queued[next] = 1
        queue.push(next)
      }
    })
  }
  return true
}

export function solveLatin(puzzle: LatinPuzzle, values: readonly number[] = [], limit = 20_000) {
  let nodes = 0
  let limited = false
  const solutions: number[][] = []
  const rulesByCell: number[][] = puzzle.givens.map(() => [])
  puzzle.rules.forEach((rule, index) => {
    for (const cell of rule.cells) rulesByCell[cell].push(index)
  })
  function visit(domains: number[], pending: readonly number[]) {
    if (nodes >= limit) {
      limited = true
      return
    }
    nodes++
    if (!propagateExact(puzzle, domains, rulesByCell, pending)) return
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
