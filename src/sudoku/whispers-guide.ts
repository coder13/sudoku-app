import type { VariantPuzzle } from './engine.ts'
import { CLASSIC_GRID, gridRegionIndex } from './grid.ts'

export const WHISPERS_GUIDE_COUNTS = [1, 2, 3, 4] as const

export function whispersGuideDigits(count: number) {
  return ['1234'.slice(0, 5 - count), '6789'.slice(count - 1)] as const
}

function minimumDistinct(cells: readonly number[]): number {
  const conflicts = cells.map((cell, index) => cells.slice(0, index).flatMap((other, earlier) =>
    cell % 9 === other % 9 || Math.floor(cell / 9) === Math.floor(other / 9) ||
    gridRegionIndex(CLASSIC_GRID, cell) === gridRegionIndex(CLASSIC_GRID, other) ? [earlier] : []))
  const assigned: number[] = []
  function fits(index: number, available: number): boolean {
    if (index === cells.length) return true
    for (let digit = 0; digit < available; digit++) {
      if (conflicts[index].some(earlier => assigned[earlier] === digit)) continue
      assigned[index] = digit
      if (fits(index + 1, available)) return true
    }
    return false
  }
  for (let count = 1; count < cells.length; count++) if (fits(0, count)) return count
  return cells.length
}

/** Minimum number of distinct digits among the adjacent cells on the lines. */
export function whispersLinkCounts(puzzle: VariantPuzzle): number[] | undefined {
  if (puzzle.regions?.type === 'jigsaw' || !puzzle.rules?.length) return
  const neighbors = Array.from({ length: 81 }, () => new Set<number>())
  for (const rule of puzzle.rules) {
    if (rule.type !== 'whispers' || rule.minDifference !== 5) return
    for (let i = 1; i < rule.cells.length; i++) {
      const a = rule.cells[i - 1], b = rule.cells[i]
      if (!neighbors[a] || !neighbors[b] || a === b ||
        Math.abs(a % 9 - b % 9) > 1 || Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) > 1) return
      neighbors[a].add(b)
      neighbors[b].add(a)
    }
  }
  const counts = neighbors.map(cells => minimumDistinct([...cells]))
  if (counts.some(count => count > 4)) return
  return counts
}
