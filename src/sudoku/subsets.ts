import type { VariantPuzzle } from './engine.ts'
import { marksOf } from './game.ts'
import { CLASSIC_GRID, gridHouseCells, type PlayGrid } from './grid.ts'

function containingHouses(cell: number, grid: PlayGrid, puzzle?: VariantPuzzle) {
  const { size, boxRows, boxColumns } = grid
  const row = Math.floor(cell / size)
  const column = cell % size
  const box = Math.floor(row / boxRows) * (size / boxColumns) + Math.floor(column / boxColumns)
  const region = puzzle?.regions?.type === 'jigsaw'
    ? puzzle.regions.regions.find((region) => region.includes(cell)) ?? []
    : gridHouseCells({ box }, grid)
  return new Set([...gridHouseCells({ row }, grid), ...gridHouseCells({ column }, grid), ...region])
}

export function compareSubsetCandidates(cells: readonly number[], masks: readonly number[], grid: PlayGrid = CLASSIC_GRID, puzzle?: VariantPuzzle) {
  const [first] = cells
  const matches = new Map<number, number[]>()
  if (first === undefined) return { digits: [], matches }

  const commonMask = cells.reduce((common, cell) => common & masks[cell], masks[first])
  if (!commonMask) return { digits: [], matches }

  const area = cells.length === 1 ? containingHouses(first, grid, puzzle) : cells
  for (const cell of area) {
    const digits = marksOf(masks[cell] & commonMask)
    if (digits.length) matches.set(cell, digits)
  }
  return { digits: marksOf(commonMask), matches }
}
