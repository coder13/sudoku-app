import { hasReadableArrowLayout } from './arrow-layout.ts'
import type { VariantPuzzle } from './engine.ts'

function spans(cells: readonly number[]) {
  const rows = cells.map(cell => Math.floor(cell / 9))
  const columns = cells.map(cell => cell % 9)
  return [Math.max(...rows) - Math.min(...rows) + 1, Math.max(...columns) - Math.min(...columns) + 1]
}

export function isSquareJigsawRegion(cells: readonly number[]) {
  if (cells.length !== 9) return false
  const [height, width] = spans(cells)
  return height === 3 && width === 3
}

export function isBentKillerCage(cells: readonly number[]) {
  if (cells.length < 3) return false
  const [height, width] = spans(cells)
  return height > 1 && width > 1 && height * width > cells.length
}

/** Layout requirements for newly generated puzzles. Existing definitions may use other shapes. */
export function hasGeneratedVariantLayout(puzzle: VariantPuzzle) {
  if (!hasReadableArrowLayout(puzzle.rules)) return false
  if (puzzle.regions?.type === 'jigsaw' && puzzle.regions.regions.some(isSquareJigsawRegion)) return false
  return (puzzle.rules ?? []).every(rule => rule.type !== 'killer-cages'
    || rule.cages.filter(cage => isBentKillerCage(cage.cells)).length >= Math.min(4, Math.ceil(rule.cages.length / 8)))
}
