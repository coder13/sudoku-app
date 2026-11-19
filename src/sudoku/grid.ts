import type { SizedClassicPosition } from './engine.ts'

export const CLASSIC_GRID = { size: 9, boxRows: 3, boxColumns: 3 } as const
export const MINI_GRID = { size: 4, boxRows: 2, boxColumns: 2 } as const
export type MiniGrid = typeof MINI_GRID
export type PlayGrid = typeof CLASSIC_GRID | MiniGrid

export function isMiniGrid(value: unknown): value is MiniGrid {
  if (value === null || typeof value !== 'object') return false
  const grid = value as Partial<MiniGrid>
  return Object.keys(grid).length === 3 && grid.size === MINI_GRID.size &&
    grid.boxRows === MINI_GRID.boxRows && grid.boxColumns === MINI_GRID.boxColumns
}

export function isGridText(text: unknown, grid: PlayGrid): text is string {
  return typeof text === 'string' && text.length === grid.size ** 2 &&
    (grid.size === 4 ? /^[0-4]+$/ : /^[0-9]+$/).test(text)
}

export function sizedClassicPosition(grid: MiniGrid, values: string): SizedClassicPosition {
  return { version: 2, grid, digits: Array.from(values, Number) }
}
