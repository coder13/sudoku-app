import type { MarkedPairs, VariantPuzzle, VariantRule } from './engine.ts'
import type { VariantGame } from './variants.ts'

export const FOG_RULE = 'A correct placement clears fog from its cell and the surrounding cells.'

export type FogDefinition = { initialCells: readonly number[] }

export function isFogDefinition(value: unknown): value is FogDefinition {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !('initialCells' in value)) return false
  const { initialCells } = value
  return Array.isArray(initialCells) && initialCells.length > 0 && initialCells.length <= 81 &&
    new Set(initialCells).size === initialCells.length &&
    initialCells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81)
}

/** Coach reveals the neighborhood of each currently correct player entry. */
export function revealedFogCells(fog: FogDefinition, entries: string, solution: string): ReadonlySet<number> {
  const cells = new Set(fog.initialCells)
  for (let cell = 0; cell < 81; cell++) {
    if (entries[cell] === '0' || entries[cell] !== solution[cell]) continue
    const row = Math.floor(cell / 9)
    const column = cell % 9
    for (let r = Math.max(0, row - 1); r <= Math.min(8, row + 1); r++) {
      for (let c = Math.max(0, column - 1); c <= Math.min(8, column + 1); c++) cells.add(r * 9 + c)
    }
  }
  return cells
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
      case 'whispers':
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
      case 'quadruple':
        return allVisible([rule.topLeft, rule.topLeft + 1, rule.topLeft + 9, rule.topLeft + 10]) ? [rule] : []
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
  between: 'Between line', entropic: 'Entropic line', modular: 'Modular line', palindrome: 'Palindrome line',
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
      case 'quadruple': {
        const cell = rule.topLeft
        addFragment([cell, cell + 1, cell + 9, cell + 10], 'part of a Quadruple clue')
        break
      }
      case 'between': case 'entropic': case 'modular': case 'palindrome':
      case 'renban': case 'region-sum': case 'thermometer': case 'whispers':
        addFragment(rule.cells, `part of a ${lineFragments[rule.type]}`)
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

export type FogView = { entries: string; cells: ReadonlySet<number>; puzzle: VariantPuzzle }
const fogViews = new WeakMap<VariantGame, FogView>()
const emptyEntries = '0'.repeat(81)
const fullFogView = new Set(Array.from({ length: 81 }, (_, cell) => cell))

/** Derive the current view from immutable puzzle data and the saved position. */
export function fogView(variant: VariantGame | undefined, entries = emptyEntries): FogView | undefined {
  if (!variant?.fog) return
  const cached = fogViews.get(variant)
  if (cached?.entries === entries) return cached
  const complete = [...variant.solution].every((digit, cell) =>
    digit === (variant.puzzle.givens[cell] === '0' ? entries[cell] : variant.puzzle.givens[cell]))
  const cells = complete ? fullFogView : revealedFogCells(variant.fog, entries, variant.solution)
  const view = { entries, cells, puzzle: projectFogPuzzle(variant.puzzle, cells) }
  fogViews.set(variant, view)
  return view
}

export function playVariantPuzzle(variant: VariantGame | undefined, entries?: string): VariantPuzzle | undefined {
  return fogView(variant, entries)?.puzzle ?? variant?.puzzle
}
