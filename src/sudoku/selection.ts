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
