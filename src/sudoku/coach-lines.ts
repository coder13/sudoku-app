import { entropicGroups } from './line-groups.ts'

// Sudoku Coach compares floor((digit - 1) / 3) on every grid size.
export const coachEntropicGroups = (size: number) => entropicGroups(size, 3)

/** Coach compiles connected Palindrome and Renban components in insertion order.
 * Shared cells are deduplicated before applying the mathematical rule.
 * Keep the original paths as drawing geometry when that order differs.
 * Source: jX1r9/jX1jq.jX61 -> jX25b -> jX2ih / jX3l9 / jX2ia,
 * https://sudoku.coach/js/jCfXtZs-1776367508519.js
 */
export function coachConnectedLines(paths: readonly (readonly number[])[]) {
  const remaining = new Set(paths.map((_, index) => index))
  const components: { cells: number[]; segments?: readonly (readonly number[])[] }[] = []
  for (let seed = 0; seed < paths.length; seed++) {
    if (!remaining.delete(seed)) continue
    const cells = new Set(paths[seed])
    const indices = new Set([seed])
    let changed: boolean
    do {
      changed = false
      for (const index of remaining) if (paths[index].some(cell => cells.has(cell))) {
        paths[index].forEach(cell => cells.add(cell))
        indices.add(index)
        remaining.delete(index)
        changed = true
      }
    } while (changed)
    const logical = [...cells]
    const segments = paths.filter((_, index) => indices.has(index))
    components.push({ cells: logical,
      ...(segments.length !== 1 || segments[0].length !== logical.length ? { segments } : {}) })
  }
  return components
}

/** Join adjacent authored segments into the ordered runs used by Sudoku Coach. */
export function coachConsecutiveRuns(paths: readonly (readonly number[])[], size: number): number[][] {
  const neighbors = new Map<number, Set<number>>()
  const invalid = () => new Error('This Sudoku Coach Consecutive line must form a path with at most one cell per grid digit.')
  for (const path of paths) for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index]
    if (a === b) throw invalid()
    const aNeighbors = neighbors.get(a) ?? new Set<number>()
    aNeighbors.add(b)
    neighbors.set(a, aNeighbors)
    const bNeighbors = neighbors.get(b) ?? new Set<number>()
    bNeighbors.add(a)
    neighbors.set(b, bNeighbors)
  }

  const visited = new Set<number>()
  const runs: number[][] = []
  for (const [endpoint, edges] of neighbors) {
    if (visited.has(endpoint) || edges.size !== 1) continue
    const run: number[] = []
    let cell: number | undefined = endpoint
    while (cell !== undefined) {
      const next: Set<number> = neighbors.get(cell)!
      if (next.size > 2 || visited.has(cell) || run.length === size) throw invalid()
      visited.add(cell)
      run.push(cell)
      cell = [...next].find(neighbor => !visited.has(neighbor))
    }
    runs.push(run)
  }
  if (visited.size !== neighbors.size) throw invalid()
  return runs
}
