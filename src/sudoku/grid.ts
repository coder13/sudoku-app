import type { House, SixGrid, SizedClassicPosition, SizedConstraintRule } from './engine.ts'

export const CLASSIC_GRID = { size: 9, boxRows: 3, boxColumns: 3 } as const
export const MINI_GRID = { size: 4, boxRows: 2, boxColumns: 2 } as const
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
  if (regions.length !== 36 || new Set(regions).size !== 6) return
  const layouts = [{ size: 6, boxRows: 2, boxColumns: 3 }, { size: 6, boxRows: 3, boxColumns: 2 }] as const
  return layouts.find(({ boxRows, boxColumns }) => regions.every((label, cell) => {
    const firstRow = Math.floor(cell / 6 / boxRows) * boxRows
    const firstColumn = Math.floor(cell % 6 / boxColumns) * boxColumns
    return label === regions[firstRow * 6 + firstColumn]
  }))
}

export function isGridText(text: unknown, grid: PlayGrid): text is string {
  return typeof text === 'string' && text.length === grid.size ** 2 &&
    (grid.size === 4 ? /^[0-4]+$/ : grid.size === 6 ? /^[0-6]+$/ : /^[0-9]+$/).test(text)
}

export function sizedClassicPosition(grid: SizedGrid, values: string): SizedClassicPosition {
  return { version: 2, grid, digits: Array.from(values, Number) }
}

export function sixDiagonalCells(diagonal: 'main' | 'anti') {
  return Array.from({ length: 6 }, (_, row) => diagonal === 'main' ? row * 7 : row * 5 + 5)
}

export function sixDigitExclusions(rules: readonly SizedConstraintRule[] | undefined, cell: number, other: number, digit: number) {
  if (!rules) return 0
  let excluded = 0
  for (const rule of rules) {
    if (rule.type !== 'thermometer') continue
    const offset = rule.cells.indexOf(cell)
    const otherOffset = rule.cells.indexOf(other)
    if (offset === -1 || otherOffset === -1 || offset === otherOffset) continue
    const bound = digit + otherOffset - offset
    if (otherOffset > offset) excluded |= (1 << Math.min(6, bound - 1)) - 1
    else excluded |= 0x3f & ~((1 << Math.max(0, bound)) - 1)
  }
  return excluded
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
