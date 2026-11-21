/** The ordered rows and columns form a square turned 45 degrees inside the main grid. */
export function validInsideGridRows(value: unknown): value is readonly (readonly number[])[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) return false
  const size = value.length
  const rows: readonly (readonly number[])[] = value
  if (!rows.every(row => Array.isArray(row) && row.length === size &&
    row.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81)) ||
    new Set(rows.flat()).size !== size * size) return false
  const rowOf = (cell: number) => Math.floor(cell / 9)
  const colOf = (cell: number) => cell % 9
  const start = rows[0][0], right = rows[0][1], down = rows[1][0]
  const dr = rowOf(down) - rowOf(start), dc = colOf(down) - colOf(start)
  const rr = rowOf(right) - rowOf(start), rc = colOf(right) - colOf(start)
  return [dr, dc, rr, rc].every(step => Math.abs(step) === 1) && dr * rr + dc * rc === 0 &&
    rows.every((row, i) => row.every((cell, j) =>
      rowOf(cell) === rowOf(start) + i * dr + j * rr && colOf(cell) === colOf(start) + i * dc + j * rc))
}

export function insideGridColumns(rows: readonly (readonly number[])[]) {
  return rows[0].map((_, column) => rows.map(row => row[column]))
}
