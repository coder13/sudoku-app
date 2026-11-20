import type { VariantPuzzle } from './engine.ts'
import { candidateCount, marksOf } from './game.ts'
import { CLASSIC_GRID, gridHouseCells, gridRegionIndex, type PlayGrid } from './grid.ts'

function containingHouses(cell: number, grid: PlayGrid, puzzle?: VariantPuzzle) {
  const { size } = grid
  const row = Math.floor(cell / size)
  const column = cell % size
  const box = gridRegionIndex(grid, cell)
  const region = puzzle?.regions?.type === 'jigsaw'
    ? puzzle.regions.regions.find((region) => region.includes(cell)) ?? []
    : gridHouseCells({ box }, grid)
  return [gridHouseCells({ row }, grid), gridHouseCells({ column }, grid), region]
}

export function compareSubsetCandidates(cells: readonly number[], masks: readonly number[], grid: PlayGrid = CLASSIC_GRID, puzzle?: VariantPuzzle) {
  const [first] = cells
  const matches = new Map<number, number[]>()
  if (first === undefined) return { digits: [], matches }

  const commonMask = cells.reduce((common, cell) => common & masks[cell], masks[first])
  if (!commonMask) return { digits: [], matches }

  const area = cells.length === 1 ? new Set(containingHouses(first, grid, puzzle).flat()) : cells
  for (const cell of area) {
    const digits = marksOf(masks[cell] & commonMask)
    if (digits.length) matches.set(cell, digits)
  }
  return { digits: marksOf(commonMask), matches }
}

export function selectedNakedSubset(cells: readonly number[], masks: readonly number[], grid: PlayGrid = CLASSIC_GRID, puzzle?: VariantPuzzle) {
  if (cells.length < 2 || cells.length >= grid.size || cells.some(cell => !masks[cell])) return null
  const digitMask = cells.reduce((union, cell) => union | masks[cell], 0)
  if (candidateCount(digitMask) !== cells.length) return null
  const sharedHouses = containingHouses(cells[0], grid, puzzle).filter(house => cells.every(cell => house.includes(cell)))
  if (!sharedHouses.length) return null

  const removals = new Map<number, number[]>()
  for (const cell of new Set(sharedHouses.flat())) {
    if (cells.includes(cell)) continue
    const digits = marksOf(masks[cell] & digitMask)
    if (digits.length) removals.set(cell, digits)
  }
  return { digits: marksOf(digitMask), removals }
}
