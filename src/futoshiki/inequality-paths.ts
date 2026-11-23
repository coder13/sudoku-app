import type { Inequality } from './inequality-rules.ts'

type PathsFromCell = (readonly number[] | undefined)[]

function shortestPaths(size: number, neighbors: readonly number[][]): PathsFromCell[] {
  return neighbors.map((_, start) => {
    const paths: PathsFromCell = []
    paths[start] = [start]
    const queue = [start]
    for (let index = 0; index < queue.length; index++) {
      const cell = queue[index]
      const path = paths[cell]!
      // A chain with more than size cells cannot fit in the digit range.
      if (path.length === size) continue
      for (const next of neighbors[cell]) {
        if (paths[next]) continue
        paths[next] = [...path, next]
        queue.push(next)
      }
    }
    return paths
  })
}

export function inequalityPaths(size: number, inequalities: readonly Inequality[]) {
  const successors: number[][] = Array.from({ length: size * size }, () => [])
  const predecessors: number[][] = Array.from({ length: size * size }, () => [])
  for (const { less, greater } of inequalities) {
    successors[less].push(greater)
    predecessors[greater].push(less)
  }
  return { successors, ascending: shortestPaths(size, successors), descending: shortestPaths(size, predecessors) }
}

export function pathsOutsideLine(cells: readonly number[], successors: readonly number[][]) {
  const line = new Set(cells)
  const paths: number[][] = []
  for (const start of cells) {
    const longest = new Map<number, number[]>()
    const path = [start]
    function extend(last: number) {
      if (path.length === cells.length) return
      for (const next of successors[last]) {
        if (path.includes(next)) continue
        if (line.has(next)) {
          // A path along the line is already covered by its own signs.
          if (path.length > 2 && path.length + 1 > (longest.get(next)?.length ?? 0)) {
            longest.set(next, [...path, next])
          }
        } else {
          path.push(next)
          extend(next)
          path.pop()
        }
      }
    }
    extend(start)
    for (const end of cells) {
      const path = longest.get(end)
      if (path) paths.push(path)
    }
  }
  return paths
}
