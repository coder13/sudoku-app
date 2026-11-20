import type { House, SixGrid, SizedClassicPosition, SizedConstraintRule } from './engine.ts'

export const CLASSIC_GRID = { size: 9, boxRows: 3, boxColumns: 3 } as const
export const MINI_GRID = { size: 4, boxRows: 2, boxColumns: 2 } as const
const SIX_GRIDS = [
  { size: 6, boxRows: 2, boxColumns: 3 },
  { size: 6, boxRows: 3, boxColumns: 2 },
] as const

export function sixGridForBoxRows(boxRows?: SixGrid['boxRows']): SixGrid {
  return SIX_GRIDS[boxRows === 3 ? 1 : 0]
}

export type MiniGrid = typeof MINI_GRID
export type SizedGrid = MiniGrid | SixGrid
export type PlayGrid = typeof CLASSIC_GRID | SizedGrid

export function isMiniGrid(value: unknown): value is MiniGrid {
  if (value === null || typeof value !== 'object') return false
  const grid = value as Partial<MiniGrid>
  return Object.keys(grid).length === 3 && grid.size === MINI_GRID.size &&
    grid.boxRows === MINI_GRID.boxRows && grid.boxColumns === MINI_GRID.boxColumns
}

export function isSizedGrid(value: unknown): value is SizedGrid {
  if (isMiniGrid(value)) return true
  if (value === null || typeof value !== 'object') return false
  const grid = value as Partial<SixGrid>
  return Object.keys(grid).length === 3 && grid.size === 6 &&
    ((grid.boxRows === 2 && grid.boxColumns === 3) || (grid.boxRows === 3 && grid.boxColumns === 2))
}

export function sixGridFromRegions(regions: readonly number[]): SixGrid | undefined {
  return SIX_GRIDS.find(grid => matchesRectangularRegions(grid, regions))
}

export function matchesRectangularRegions({ size, boxRows, boxColumns }: SizedGrid, regions: readonly number[]) {
  return regions.length === size ** 2 && new Set(regions).size === size && regions.every((label, cell) => {
    const firstRow = Math.floor(cell / size / boxRows) * boxRows
    const firstColumn = Math.floor(cell % size / boxColumns) * boxColumns
    return label === regions[firstRow * size + firstColumn]
  })
}

export function isGridText(text: unknown, grid: PlayGrid): text is string {
  return typeof text === 'string' && text.length === grid.size ** 2 &&
    (grid.size === 4 ? /^[0-4]+$/ : grid.size === 6 ? /^[0-6]+$/ : /^[0-9]+$/).test(text)
}

export function sizedClassicPosition(grid: SizedGrid, values: string): SizedClassicPosition {
  return { version: 2, grid, digits: Array.from(values, Number) }
}

export function gridDiagonalCells(size: number, diagonal: 'main' | 'anti') {
  return Array.from({ length: size }, (_, row) => row * size + (diagonal === 'main' ? row : size - row - 1))
}

export function gridCellsShareEdge(first: number, second: number, size: number) {
  return Math.abs(Math.floor(first / size) - Math.floor(second / size)) + Math.abs(first % size - second % size) === 1
}

export function kropkiDigitExclusions(rules: readonly SizedConstraintRule[], cell: number, other: number, digit: number, size: number) {
  if (!gridCellsShareEdge(cell, other, size)) return 0
  let white = false, black = false, negativeWhite = false, negativeBlack = false
  const matches = ([a, b]: readonly [number, number]) => a === cell && b === other || a === other && b === cell
  for (const rule of rules) {
    if (rule.type !== 'kropki') continue
    white ||= rule.consecutive?.pairs?.some(matches) === true
    black ||= rule.ratioTwo?.pairs?.some(matches) === true
    negativeWhite ||= rule.consecutive?.negative === true
    negativeBlack ||= rule.ratioTwo?.negative === true
  }
  let excluded = 0
  if (white || black || negativeWhite || negativeBlack) for (let candidate = 1; candidate <= size; candidate++) {
    const consecutive = Math.abs(digit - candidate) === 1
    const ratioTwo = digit === 2 * candidate || candidate === 2 * digit
    if (white && !consecutive || black && !ratioTwo ||
      !white && !black && (negativeWhite && consecutive || negativeBlack && ratioTwo)) excluded |= 1 << (candidate - 1)
  }
  return excluded
}

export function sizedDigitExclusions(rules: readonly SizedConstraintRule[] | undefined, cell: number, other: number, digit: number, size: number) {
  if (!rules) return 0
  let excluded = kropkiDigitExclusions(rules, cell, other, digit, size)
  for (const rule of rules) {
    if (rule.type === 'renban' && cell !== other && rule.cells.includes(cell) && rule.cells.includes(other)) {
      for (let candidate = 1; candidate <= size; candidate++) {
        if (candidate === digit || Math.abs(candidate - digit) >= rule.cells.length) excluded |= 1 << (candidate - 1)
      }
    }
    if (rule.type === 'difference' && (rule.cells[0] === cell && rule.cells[1] === other ||
      rule.cells[1] === cell && rule.cells[0] === other)) {
      const lower = digit - rule.difference, upper = digit + rule.difference
      const allowed = (lower >= 1 ? 1 << (lower - 1) : 0) | (upper <= size ? 1 << (upper - 1) : 0)
      excluded |= ((1 << size) - 1) & ~allowed
    }
    if (rule.type !== 'thermometer') continue
    const offset = rule.cells.indexOf(cell)
    const otherOffset = rule.cells.indexOf(other)
    if (offset === -1 || otherOffset === -1 || offset === otherOffset) continue
    const bound = digit + otherOffset - offset
    if (otherOffset > offset) excluded |= (1 << Math.min(size, bound - 1)) - 1
    else excluded |= ((1 << size) - 1) & ~((1 << Math.max(0, bound)) - 1)
  }
  return excluded
}

export function sizedArrowState(rules: readonly SizedConstraintRule[] | undefined, values: string, size: number) {
  const arrows = rules?.filter(rule => rule.type === 'arrow')
  if (!arrows?.length) return
  const allowed = Array<number>(values.length).fill((1 << size) - 1)
  const conflicts = new Set<number>()
  const interval = (low: number, high: number) => {
    const first = Math.max(1, low), last = Math.min(size, high)
    return first <= last ? (1 << last) - (1 << (first - 1)) : 0
  }
  for (const { circle, cells } of arrows) {
    const bulb = Number(values[circle])
    let sum = 0, empty = 0
    for (const cell of cells) {
      const digit = Number(values[cell])
      sum += digit
      empty += Number(digit === 0)
    }
    const low = sum + empty, high = sum + empty * size
    if (low > (bulb || size) || bulb > high) {
      for (const cell of [circle, ...cells]) if (values[cell] !== '0') conflicts.add(cell)
      continue
    }
    if (!bulb) allowed[circle] &= interval(low, high)
    if (empty) {
      const min = bulb ? bulb - sum - (empty - 1) * size : 1
      const max = (bulb || size) - sum - (empty - 1)
      for (const cell of cells) if (values[cell] === '0') allowed[cell] &= interval(min, max)
    }
  }
  return { allowed, conflicts }
}

export function gridHouseCells(house: House, { size, boxRows, boxColumns }: PlayGrid = CLASSIC_GRID) {
  return Array.from({ length: size }, (_, index) => {
    if ('row' in house) return house.row * size + index
    if ('column' in house) return index * size + house.column
    const boxesAcross = size / boxColumns
    const row = Math.floor(house.box / boxesAcross) * boxRows + Math.floor(index / boxColumns)
    const column = house.box % boxesAcross * boxColumns + index % boxColumns
    return row * size + column
  })
}
