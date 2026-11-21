export const antiKnightTechnique = 'Anti-Knight'
export const antiKnightNote = 'Cells a chess knight’s move apart cannot share a digit. A knight moves two cells in one direction and one cell across.'

export function isKnightMove(a: number, b: number, size: number) {
  const rows = Math.abs(Math.floor(a / size) - Math.floor(b / size))
  const columns = Math.abs(a % size - b % size)
  return rows * columns === 2
}
