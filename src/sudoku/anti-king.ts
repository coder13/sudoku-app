export const antiKingTechnique = 'Anti-King'
export const antiKingNote = 'Cells that touch at a corner must have different digits.'

export function isKingCornerMove(a: number, b: number, size: number) {
  const rows = Math.abs(Math.floor(a / size) - Math.floor(b / size))
  const columns = Math.abs(a % size - b % size)
  return rows === 1 && columns === 1
}
