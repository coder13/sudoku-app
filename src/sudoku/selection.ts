/** Include cells between pointer samples so a quick drag does not skip candidates. */
export function cellsOnDragPath(start: number, end: number, size = 9): number[] {
  const fromRow = Math.floor(start / size)
  const fromColumn = start % size
  const rowStep = Math.floor(end / size) - fromRow
  const columnStep = end % size - fromColumn
  const steps = Math.max(Math.abs(rowStep), Math.abs(columnStep))
  if (!steps) return [start]
  return [...new Set(Array.from({ length: steps + 1 }, (_, step) => {
    const row = Math.round(fromRow + rowStep * step / steps)
    const column = Math.round(fromColumn + columnStep * step / steps)
    return row * size + column
  }))]
}

export function rectangleSelection(start: number, end: number, size = 9): number[] {
  const [top, bottom] = [Math.floor(start / size), Math.floor(end / size)].sort((a, b) => a - b)
  const [left, right] = [start % size, end % size].sort((a, b) => a - b)
  const result = []
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) result.push(row * size + column)
  }
  return result
}

export function canStartCellSelectionDrag({
  highlightMode, penOrPencil, selectedDigit,
}: {
  highlightMode: boolean
  penOrPencil: boolean
  selectedDigit: number | null
}): boolean {
  return highlightMode || (penOrPencil && selectedDigit === null)
}

export type CellSelectionEdge = 'top' | 'right' | 'bottom' | 'left'

/** Return only the exposed edges of each selected cell to outline connected groups as one shape. */
export function cellSelectionEdges(cells: readonly number[], size = 9): Map<number, CellSelectionEdge[]> {
  const selected = new Set(cells)
  const edges = new Map<number, CellSelectionEdge[]>()
  for (const cell of selected) {
    const row = Math.floor(cell / size)
    const column = cell % size
    const exposed: CellSelectionEdge[] = []
    if (row === 0 || !selected.has(cell - size)) exposed.push('top')
    if (column === size - 1 || !selected.has(cell + 1)) exposed.push('right')
    if (row === size - 1 || !selected.has(cell + size)) exposed.push('bottom')
    if (column === 0 || !selected.has(cell - 1)) exposed.push('left')
    edges.set(cell, exposed)
  }
  return edges
}
