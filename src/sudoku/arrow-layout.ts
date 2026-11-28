import type { VariantRule } from './engine.ts'

type Arrow = Extract<VariantRule, { type: 'arrow' }>

export const MAX_GENERATED_ARROWS = 12

/** Choose arrows whose circles and shafts keep their own space on the grid. */
export function selectReadableArrows(candidates: readonly Arrow[], limit: number): Arrow[] {
  const usedCells = new Set<number>()
  const usedDiagonals = new Set<number>()
  const selected: Arrow[] = []
  for (const arrow of candidates) {
    if (selected.length >= limit) break
    const path = [arrow.circle, ...arrow.cells]
    if (!arrow.cells.length || new Set(path).size !== path.length || path.some(cell => usedCells.has(cell))) continue
    const diagonals = new Set<number>()
    let clear = true
    for (const [i, cell] of arrow.cells.entries()) {
      const previous = path[i]
      const row = Math.floor(cell / 9), previousRow = Math.floor(previous / 9)
      const column = cell % 9, previousColumn = previous % 9
      if (Math.max(Math.abs(row - previousRow), Math.abs(column - previousColumn)) > 1) {
        clear = false
        break
      }
      if (row === previousRow || column === previousColumn) continue
      // Two diagonals through the same square between four cell centers cross.
      const square = Math.min(row, previousRow) * 8 + Math.min(column, previousColumn)
      if (usedDiagonals.has(square) || diagonals.has(square)) {
        clear = false
        break
      }
      diagonals.add(square)
    }
    if (!clear) continue
    path.forEach(cell => usedCells.add(cell))
    diagonals.forEach(square => usedDiagonals.add(square))
    selected.push(arrow)
  }
  return selected
}

export function hasReadableArrowLayout(rules: readonly VariantRule[] = []): boolean {
  const arrows = rules.filter(rule => rule.type === 'arrow')
  return selectReadableArrows(arrows, MAX_GENERATED_ARROWS).length === arrows.length
}
