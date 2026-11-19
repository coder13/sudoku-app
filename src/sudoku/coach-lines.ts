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

/** Coach requires all cells in one connected clue to differ. Each drawn
 * edge also needs a difference of one, so its graph must form a single path. */
export function coachConsecutiveLines(paths: readonly (readonly number[])[]) {
  return coachConnectedLines(paths).map(({ cells, segments }) => {
    const drawing = segments ?? [cells]
    const neighbors = new Map(cells.map(cell => [cell, new Set<number>()]))
    for (const path of drawing) for (let i = 1; i < path.length; i++) {
      neighbors.get(path[i - 1])!.add(path[i])
      neighbors.get(path[i])!.add(path[i - 1])
    }
    const first = cells.find(cell => neighbors.get(cell)!.size < 2)
    const ordered: number[] = []
    if (first !== undefined && !cells.some(cell => neighbors.get(cell)!.size > 2 || neighbors.get(cell)!.has(cell))) {
      let current: number | undefined = first
      while (current !== undefined && !ordered.includes(current)) {
        const previous: number | undefined = ordered.at(-1)
        ordered.push(current)
        current = [...neighbors.get(current)!].find(neighbor => neighbor !== previous)
      }
    }
    if (ordered.length !== cells.length || cells.length > 9) {
      throw new Error('This Sudoku Coach Consecutive Line cannot form a run of distinct digits.')
    }
    return { cells: ordered, ...(segments && { segments }) }
  })
}
