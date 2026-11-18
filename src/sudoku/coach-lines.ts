/** Coach compiles each connected Palindrome component in insertion order.
 * Shared cells are deduplicated before opposite positions are paired.
 * Keep the original paths as drawing geometry when that order differs.
 * Source: jX1r9.jX61 -> jX25b -> jX2ih / jX3l9 / jX2ia,
 * https://sudoku.coach/js/jCfXtZs-1776367508519.js
 */
export function coachPalindromeLines(paths: readonly (readonly number[])[]) {
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
