/** Include cells between pointer samples so a quick drag does not skip candidates. */
export function cellsOnDragPath(start: number, end: number): number[] {
  const fromRow = Math.floor(start / 9)
  const fromColumn = start % 9
  const rowStep = Math.floor(end / 9) - fromRow
  const columnStep = end % 9 - fromColumn
  const steps = Math.max(Math.abs(rowStep), Math.abs(columnStep))
  if (!steps) return [start]
  return [...new Set(Array.from({ length: steps + 1 }, (_, step) => {
    const row = Math.round(fromRow + rowStep * step / steps)
    const column = Math.round(fromColumn + columnStep * step / steps)
    return row * 9 + column
  }))]
}

export function rectangleSelection(start: number, end: number): number[] {
  const [top, bottom] = [Math.floor(start / 9), Math.floor(end / 9)].sort((a, b) => a - b)
  const [left, right] = [start % 9, end % 9].sort((a, b) => a - b)
  const result = []
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) result.push(row * 9 + column)
  }
  return result
}
