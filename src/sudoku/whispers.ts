import type { VariantPuzzle, VariantRule } from './engine.ts'

const ALL_DIGITS = 511
type Neighbors = Map<number, Map<number, number>>
type Component = { cells: number[]; cycleCell?: number }
type WhispersGraph = { neighbors: Neighbors; components: Component[] }
const cache = new WeakMap<readonly VariantRule[], WhispersGraph>()

function whispersGraph(rules: readonly VariantRule[]): WhispersGraph {
  const cached = cache.get(rules)
  if (cached) return cached
  const neighbors: Neighbors = new Map()
  for (const rule of rules) {
    if (rule.type !== 'whispers') continue
    for (let i = 1; i < rule.cells.length; i++) {
      const a = rule.cells[i - 1], b = rule.cells[i]
      let from = neighbors.get(a)
      let to = neighbors.get(b)
      if (!from) neighbors.set(a, from = new Map())
      if (!to) neighbors.set(b, to = new Map())
      const minimum = Math.max(from.get(b) ?? 0, rule.minDifference)
      from.set(b, minimum)
      to.set(a, minimum)
    }
  }

  const components: Component[] = []
  const parents = new Map<number, number>()
  for (const start of neighbors.keys()) {
    if (parents.has(start)) continue
    const cells = [start]
    parents.set(start, -1)
    let degree = 0
    let cycleCell: number | undefined
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index]
      const edges = neighbors.get(cell)!
      degree += edges.size
      for (const peer of edges.keys()) {
        if (!parents.has(peer)) {
          parents.set(peer, cell)
          cells.push(peer)
        } else if (parents.get(cell) !== peer && parents.get(peer) !== cell) {
          cycleCell ??= cell
        }
      }
    }
    // Fixing a cell on the only cycle leaves a tree of free cells.
    components.push({ cells, cycleCell: degree === 2 * cells.length ? cycleCell : undefined })
  }
  const graph = { neighbors, components }
  cache.set(rules, graph)
  return graph
}

// The smallest or largest digit witnesses any compatible difference.
function compatibleDigits(domain: number, minimum: number) {
  const min = 32 - Math.clz32(domain & -domain)
  const max = 32 - Math.clz32(domain)
  const below = (1 << Math.max(0, max - minimum)) - 1
  const above = ALL_DIGITS & ~((1 << Math.min(9, min + minimum - 1)) - 1)
  return below | above
}

function propagate(neighbors: Neighbors, domains: number[], changed: readonly number[]) {
  const pending = [...changed]
  const queued = new Uint8Array(81)
  for (const cell of pending) queued[cell] = 1
  for (let index = 0; index < pending.length; index++) {
    const cell = pending[index]
    queued[cell] = 0
    for (const [peer, minimum] of neighbors.get(cell)!) {
      const domain = domains[peer] & compatibleDigits(domains[cell], minimum)
      if (!domain) return false
      if (domain === domains[peer]) continue
      domains[peer] = domain
      if (!queued[peer]) {
        queued[peer] = 1
        pending.push(peer)
      }
    }
  }
  return true
}

function componentSupport(neighbors: Neighbors, { cells, cycleCell }: Component, values: string) {
  const domains = Array<number>(81).fill(0)
  for (const cell of cells) {
    const digit = Number(values[cell])
    domains[cell] = digit ? 1 << (digit - 1) : ALL_DIGITS
  }
  if (!propagate(neighbors, domains, cells)) return
  if (cycleCell === undefined) return domains
  const candidates = domains[cycleCell]
  if (!(candidates & (candidates - 1))) return domains

  const support = Array<number>(81).fill(0)
  for (let remaining = candidates; remaining; remaining &= remaining - 1) {
    const selected = domains.slice()
    selected[cycleCell] = remaining & -remaining
    if (propagate(neighbors, selected, [cycleCell])) {
      for (const cell of cells) support[cell] |= selected[cell]
    }
  }
  return support[cycleCell] ? support : undefined
}

/** Local Whispers support from placed digits, including touching and closed lines.
 * Pair propagation is exact on trees. Trying the digits at one cell also makes
 * it exact on components with one cycle. Components with multiple cycles keep
 * any candidates whose support cannot be disproved by the local checks. */
export function whispersState(puzzle: VariantPuzzle | undefined, values: string) {
  if (!puzzle?.rules?.length) return
  const { neighbors, components } = whispersGraph(puzzle.rules)
  if (!components.length) return
  const allowed = Array<number>(81).fill(ALL_DIGITS)
  const conflicts = new Set<number>()
  for (const component of components) {
    const support = componentSupport(neighbors, component, values)
    if (support) {
      for (const cell of component.cells) if (values[cell] === '0') allowed[cell] = support[cell]
      continue
    }
    const placed = component.cells.filter(cell => values[cell] !== '0')
    const previous = conflicts.size
    for (const cell of placed) for (const [peer, minimum] of neighbors.get(cell)!) {
      if (peer > cell && values[peer] !== '0' && Math.abs(Number(values[cell]) - Number(values[peer])) < minimum) {
        conflicts.add(cell)
        conflicts.add(peer)
      }
    }
    // Highlight a direct bad edge when there is one.
    if (conflicts.size === previous) for (const cell of placed) conflicts.add(cell)
  }
  return { allowed, conflicts }
}
