import type { AuthoredCornerPath } from '../sudoku/authored-artwork.ts'

// Split the grid at visible paths along its edges. The grid perimeter is
// already a border, so a path does not need to trace it.
export function regionsInsideArtwork(size: number, paths: readonly AuthoredCornerPath[]) {
  const count = size ** 2
  const edge = (first: number, second: number) => Math.min(first, second) * count + Math.max(first, second)
  const borders = new Set<number>()
  for (const { points, opacity, thickness } of paths) {
    if (opacity !== 1 || thickness <= 0) continue
    for (let index = 1; index < points.length; index++) {
      const [x, y] = points[index - 1], [nextX, nextY] = points[index]
      if (y === nextY && y > 0 && y < size) {
        for (let column = Math.min(x, nextX); column < Math.max(x, nextX); column++) {
          borders.add(edge((y - 1) * size + column, y * size + column))
        }
      }
      if (x === nextX && x > 0 && x < size) {
        for (let row = Math.min(y, nextY); row < Math.max(y, nextY); row++) {
          borders.add(edge(row * size + x - 1, row * size + x))
        }
      }
    }
  }
  if (!borders.size) return []
  const seen = new Uint8Array(count)
  const regions: number[][] = []
  for (let start = 0; start < count; start++) {
    if (seen[start]) continue
    const cells = [start]
    seen[start] = 1
    for (const cell of cells) {
      const column = cell % size
      const neighbors = [cell - size, cell + size, column > 0 ? cell - 1 : -1, column < size - 1 ? cell + 1 : -1]
      for (const next of neighbors) {
        if (next < 0 || next >= count || seen[next] || borders.has(edge(cell, next))) continue
        seen[next] = 1
        cells.push(next)
      }
    }
    regions.push(cells.sort((a, b) => a - b))
  }
  return regions
}
