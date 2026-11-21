import { shuffled, type PickIndex } from '../number-puzzles/generation-random.ts'

function isPlayableLayout(rows: readonly string[]): boolean {
  const width = rows[0].length
  const start = rows[0].indexOf('.')
  if (start === -1 || !rows.at(-1)!.includes('.') || !rows.some(row => row[0] === '.') ||
    !rows.some(row => row[width - 1] === '.')) return false

  let white = 0
  const isWhite = (row: number, column: number) => rows[row]?.[column] === '.'
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < width; column++) {
      if (!isWhite(row, column)) continue
      // Each white cell must belong to an across run and a down run of length two or more.
      if (!(isWhite(row, column - 1) || isWhite(row, column + 1)) ||
        !(isWhite(row - 1, column) || isWhite(row + 1, column))) return false
      white++
    }
  }

  const connected = new Set([start])
  for (const index of connected) {
    const row = Math.floor(index / width)
    const column = index % width
    if (isWhite(row, column - 1)) connected.add(index - 1)
    if (isWhite(row, column + 1)) connected.add(index + 1)
    if (isWhite(row - 1, column)) connected.add(index - width)
    if (isWhite(row + 1, column)) connected.add(index + width)
  }
  return connected.size === white
}

export function varyKakuroLayout(base: readonly string[], pick: PickIndex): string[] | undefined {
  const width = base[0].length
  const next = [...base]
  const cells = Array.from({ length: width * base.length }, (_, index) => index)
  // Make at most two changes so the size and number of playable cells stay close to the base.
  const edits = cells.length >= 16 ? 2 : 1
  for (let edit = 0; edit < edits; edit++) {
    for (const index of shuffled(cells, pick)) {
      const row = Math.floor(index / width)
      const column = index % width
      const previous = next[row]
      if (previous[column] !== base[row][column]) continue
      next[row] = previous.slice(0, column) + (previous[column] === '.' ? '#' : '.') + previous.slice(column + 1)
      if (isPlayableLayout(next)) break
      next[row] = previous
    }
  }
  if (next.some((row, index) => row !== base[index])) return next
}
