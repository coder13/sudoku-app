import type { MarkedPairs, VariantPuzzle, VariantRule } from './engine.ts'
import { validImportedCellColors, type ImportedCellColors } from './imported-colors.ts'
import { cellsShareEdge, quadrupleCells, type VariantGame } from './variants.ts'

export const FOG_RULE = 'A correct placement clears fog from its cell and the surrounding cells.'

export type FogDefinition = { initialCells: readonly number[]; cellColors?: ImportedCellColors }

export function isFogDefinition(value: unknown): value is FogDefinition {
  if (!value || typeof value !== 'object' || !('initialCells' in value) ||
    Object.keys(value).some(key => key !== 'initialCells' && key !== 'cellColors')) return false
  const { initialCells, cellColors } = value as { initialCells: unknown; cellColors?: unknown }
  return Array.isArray(initialCells) && initialCells.length > 0 && initialCells.length <= 81 &&
    new Set(initialCells).size === initialCells.length &&
    initialCells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81) &&
    (cellColors === undefined || validImportedCellColors(cellColors))
}

const fogNeighborhoods = Array.from({ length: 81 }, (_, cell) => {
  const row = Math.floor(cell / 9)
  const column = cell % 9
  const neighbors: number[] = []
  for (let r = Math.max(0, row - 1); r <= Math.min(8, row + 1); r++) {
    for (let c = Math.max(0, column - 1); c <= Math.min(8, column + 1); c++) neighbors.push(r * 9 + c)
  }
  return neighbors
})

/** Coach reveals the neighborhood of each currently correct player entry. */
export function revealedFogCells(fog: FogDefinition, entries: string, solution: string): ReadonlySet<number> {
  const cells = new Set(fog.initialCells)
  for (let cell = 0; cell < 81; cell++) {
    if (entries[cell] === '0' || entries[cell] !== solution[cell]) continue
    for (const neighbor of fogNeighborhoods[cell]) cells.add(neighbor)
  }
  return cells
}

/** A valid placement at any of these cells changes the visible puzzle. */
export function fogRevealPlacements(visible: ReadonlySet<number>): number[] {
  return fogNeighborhoods.flatMap((neighbors, cell) => neighbors.some(neighbor => !visible.has(neighbor)) ? [cell] : [])
}

function visiblePaths(path: readonly number[], visible: ReadonlySet<number>): number[][] {
  const runs: number[][] = []
  let run: number[] = []
  for (const cell of path) {
    if (visible.has(cell)) run.push(cell)
    else {
      if (run.length > 1) runs.push(run)
      run = []
    }
  }
  if (run.length > 1) runs.push(run)
  return runs
}

function visibleMarks(marks: MarkedPairs | undefined, visible: ReadonlySet<number>, complete: boolean): MarkedPairs | undefined {
  const pairs = marks?.pairs?.filter(pair => pair.every(cell => visible.has(cell)))
  const negative = complete && marks?.negative === true
  return pairs?.length || negative ? { ...(pairs?.length && { pairs }), ...(negative && { negative }) } : undefined
}

/** A continuous patch of revealed shading identifies cells in the same group. */
function visibleShadedGroups(cells: readonly number[], visible: ReadonlySet<number>) {
  const remaining = new Set(cells.filter(cell => visible.has(cell)))
  const groups: number[][] = []
  for (const start of remaining) {
    const group = [start]
    remaining.delete(start)
    for (const cell of group) for (const neighbor of remaining) {
      if (cellsShareEdge(cell, neighbor)) {
        remaining.delete(neighbor)
        group.push(neighbor)
      }
    }
    if (group.length >= 2) groups.push(group)
  }
  return groups
}

/** The printed digits that lie entirely outside the fog. */
function visibleQuadrupleDigits(rule: Extract<VariantRule, { type: 'quadruple' }>, visible: ReadonlySet<number>) {
  const cells = quadrupleCells(rule.topLeft)
  const count = rule.digits.length
  if (cells.every(cell => visible.has(cell))) return rule.digits
  if (count === 1) return []
  return rule.digits.filter((_, slot) => {
    // The one- and two-digit layouts are vertically centered. In the
    // three-digit layout the last digit is centered across the bottom cells.
    if (count === 2) return visible.has(cells[slot]) && visible.has(cells[slot + 2])
    if (count === 3 && slot === 2) return visible.has(cells[2]) && visible.has(cells[3])
    return visible.has(cells[slot])
  })
}

/** The puzzle facts the player can use. Exact verification uses the original definition. */
export function projectFogPuzzle(puzzle: VariantPuzzle, visible: ReadonlySet<number>): VariantPuzzle {
  if (visible.size === 81) return puzzle
  const rules = puzzle.rules ?? []
  const allVisible = (cells: readonly number[]) => cells.every(cell => visible.has(cell))
  const allMarksVisible = (marks?: MarkedPairs) => marks?.pairs?.every(allVisible) ?? true
  // A hidden marker can exempt an edge from a negative rule.
  const completeKropki = rules.every(rule => rule.type !== 'kropki' ||
    allMarksVisible(rule.consecutive) && allMarksVisible(rule.ratioTwo))
  const completeXv = rules.every(rule => {
    if (rule.type === 'xv') return allMarksVisible(rule.five) && allMarksVisible(rule.ten)
    if (rule.type === 'adjacent-total' && (rule.sum === 5 || rule.sum === 10)) return allVisible(rule.cells)
    return true
  })
  const shown = rules.flatMap((rule): VariantRule[] => {
    switch (rule.type) {
      case 'parity': {
        const cells = rule.cells.filter(cell => visible.has(cell))
        return cells.length ? [{ ...rule, cells }] : []
      }
      case 'killer-cages': {
        const cages = rule.cages.filter(cage => allVisible(cage.cells))
        return cages.length ? [{ type: 'killer-cages', cages }] : []
      }
      case 'kropki': {
        const consecutive = visibleMarks(rule.consecutive, visible, completeKropki)
        const ratioTwo = visibleMarks(rule.ratioTwo, visible, completeKropki)
        return consecutive || ratioTwo ? [{ type: 'kropki', ...(consecutive && { consecutive }), ...(ratioTwo && { ratioTwo }) }] : []
      }
      case 'xv': {
        const five = visibleMarks(rule.five, visible, completeXv)
        const ten = visibleMarks(rule.ten, visible, completeXv)
        return five || ten ? [{ type: 'xv', ...(five && { five }), ...(ten && { ten }) }] : []
      }
      case 'distinct-cells':
        return allVisible(rule.cells) ? [rule] : visibleShadedGroups(rule.cells, visible).map(cells => ({ ...rule, cells }))
      case 'whispers':
      case 'consecutive-run':
      case 'modular':
      case 'entropic':
        // Every contiguous run keeps the original pairwise phase relationships.
        return allVisible(rule.cells) ? [rule] : visiblePaths(rule.cells, visible).map(cells => ({ ...rule, cells }))
      case 'clone': {
        const groups = rule.groups.filter(allVisible)
        return groups.length ? [{ ...rule, groups }] : []
      }
      case 'diagonal':
        return allVisible(Array.from({ length: 9 }, (_, i) => rule.diagonal === 'main' ? 10 * i : 8 * (i + 1))) ? [rule] : []
      case 'quadruple': {
        const digits = visibleQuadrupleDigits(rule, visible)
        // Each exposed digit must still occur somewhere in the four cells.
        return digits.length ? [{ ...rule, digits }] : []
      }
      case 'inequality':
        return allVisible([rule.less, rule.greater]) ? [rule] : []
      case 'arrow':
        return visible.has(rule.circle) && allVisible(rule.cells) ? [rule] : []
      case 'non-consecutive':
        return !rule.except || rule.except.every(allVisible) ? [rule] : []
      case 'anti-knight':
      case 'anti-king':
      case 'global-entropy':
      case 'sandwich':
      case 'little-killer':
      case 'x-sum':
      case 'skyscrapers':
        // The fog covers the grid. Outside labels and their directions are public.
        return [rule]
      default:
        return allVisible(rule.cells) ? [rule] : []
    }
  })
  const givens = [...puzzle.givens].map((digit, cell) => visible.has(cell) ? digit : '0').join('')
  return { ...puzzle, givens, rules: shown }
}

const lineFragments = {
  between: 'Between line', 'consecutive-run': 'Consecutive Line', entropic: 'Entropic line', modular: 'Modular line', palindrome: 'Palindrome line',
  renban: 'Renban line', 'region-sum': 'Region Sum line', thermometer: 'thermometer', whispers: 'Whispers line',
} as const

/** Describe visible fragments without inferring the clues' covered digits or cells. */
export function fogFragmentLabels(rules: readonly VariantRule[], visible: ReadonlySet<number>) {
  const labels: string[][] = Array.from({ length: 81 }, () => [])
  const addFragment = (cells: readonly number[], description: string) => {
    if (cells.every(cell => visible.has(cell))) return
    for (const cell of new Set(cells)) if (visible.has(cell)) labels[cell].push(description)
  }
  for (const rule of rules) {
    switch (rule.type) {
      case 'killer-cages':
        for (const { cells, sum } of rule.cages) {
          if (cells.every(cell => visible.has(cell))) continue
          const corner = Math.min(...cells)
          for (const cell of cells) if (visible.has(cell)) labels[cell].push(cell === corner
            ? `cage total ${sum}, outline continues under fog` : 'cage outline continues under fog')
        }
        break
      case 'quadruple':
        if (!visibleQuadrupleDigits(rule, visible).length) {
          addFragment(quadrupleCells(rule.topLeft), 'part of a Quadruple clue')
        }
        break
      case 'between': case 'consecutive-run': case 'entropic': case 'modular': case 'palindrome':
      case 'renban': case 'region-sum': case 'thermometer': case 'whispers':
        addFragment(rule.cells, `part of a ${lineFragments[rule.type]}`)
        break
      case 'distinct-cells':
        addFragment(rule.cells, 'part of a shaded group')
        break
      case 'arrow':
        addFragment([rule.circle, ...rule.cells], 'part of an Arrow clue')
        break
      case 'kropki':
        for (const pair of rule.consecutive?.pairs ?? []) addFragment(pair, 'part of a white dot')
        for (const pair of rule.ratioTwo?.pairs ?? []) addFragment(pair, 'part of a black dot')
        break
      case 'xv':
        for (const pair of [...(rule.five?.pairs ?? []), ...(rule.ten?.pairs ?? [])]) addFragment(pair, 'part of a sum clue')
        break
      case 'adjacent-total':
        addFragment(rule.cells, 'part of a sum clue')
        break
      case 'inequality':
        addFragment([rule.less, rule.greater], 'part of an inequality sign')
        break
    }
  }
  return labels
}

export type FogView = { entries: string; cells: ReadonlySet<number>; puzzle: VariantPuzzle; cellColors?: ImportedCellColors }
type FogPuzzle = Pick<VariantGame, 'puzzle' | 'fog'> & Partial<Pick<VariantGame, 'solution'>>
const fogViews = new WeakMap<FogPuzzle, FogView>()
const emptyEntries = '0'.repeat(81)
const fullFogView = new Set(Array.from({ length: 81 }, (_, cell) => cell))

/** Derive the current view from immutable puzzle data and the saved position. */
export function fogView(variant: FogPuzzle | undefined, entries = emptyEntries): FogView | undefined {
  if (!variant?.fog) return
  const cached = fogViews.get(variant)
  if (cached?.entries === entries) return cached
  const { solution } = variant
  const complete = solution && [...solution].every((digit, cell) =>
    digit === (variant.puzzle.givens[cell] === '0' ? entries[cell] : variant.puzzle.givens[cell]))
  const cells = complete ? fullFogView : solution ? revealedFogCells(variant.fog, entries, solution) : new Set(variant.fog.initialCells)
  const { cellColors } = variant.fog
  const view: FogView = { entries, cells, puzzle: projectFogPuzzle(variant.puzzle, cells),
    ...(cellColors && { cellColors: Object.fromEntries(Object.entries(cellColors).filter(([cell]) => cells.has(Number(cell)))) }),
  }
  fogViews.set(variant, view)
  return view
}

export function playVariantPuzzle(variant: VariantGame | undefined, entries?: string): VariantPuzzle | undefined {
  return fogView(variant, entries)?.puzzle ?? variant?.puzzle
}
