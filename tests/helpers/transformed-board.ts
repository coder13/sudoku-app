// Independent matrix operations for checking transformed published completions.
export function transformedBoard(board: string, symmetry: number): string {
  let rows = Array.from({ length: 9 }, (_, row) => [...board.slice(row * 9, row * 9 + 9)])
  if (symmetry & 1) rows = rows[0].map((_, column) => rows.map(row => row[column]))
  if (symmetry & 2) rows.reverse()
  if (symmetry & 4) rows.forEach(row => row.reverse())
  return rows.flat().join('')
}
