import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Independent row/column/box search with direct parity, corner and edge restrictions. */
export function countCellRuleSolutions(puzzle: VariantPuzzle, budget = 200_000) {
  if (puzzle.regions?.type === 'jigsaw') throw new Error('This independent counter expects boxes')
  const grid = [...puzzle.givens].map(Number)
  const allowed = Array.from({ length: 81 }, () => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))
  let antiKing = false
  const consecutiveEdges: number[][] = Array.from({ length: 81 }, () => [])
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'anti-king') { antiKing = true; continue }
    if (rule.type === 'non-consecutive') {
      for (let row = 0; row < 9; row++) for (let column = 0; column < 9; column++) {
        const a = row * 9 + column
        for (const b of [column < 8 ? a + 1 : -1, row < 8 ? a + 9 : -1]) {
          if (b < 0 || rule.except?.some(([x, y]) => x === a && y === b || x === b && y === a)) continue
          consecutiveEdges[a].push(b); consecutiveEdges[b].push(a)
        }
      }
      continue
    }
    if (rule.type !== 'parity') throw new Error(`Unsupported independent rule ${rule.type}`)
    for (const cell of rule.cells) allowed[cell] = new Set([...allowed[cell]].filter(digit =>
      digit % 2 === (rule.parity === 'odd' ? 1 : 0)))
  }
  const peers = Array.from({ length: 81 }, (_, cell) => Array.from({ length: 81 }, (_, other) => other).filter(other =>
    other !== cell && (Math.floor(other / 9) === Math.floor(cell / 9) || other % 9 === cell % 9 ||
      Math.floor(other / 27) === Math.floor(cell / 27) && Math.floor(other % 9 / 3) === Math.floor(cell % 9 / 3) ||
      antiKing && Math.abs(Math.floor(other / 9) - Math.floor(cell / 9)) === 1 && Math.abs(other % 9 - cell % 9) === 1)))
  const consecutive = (cell: number, digit: number) => consecutiveEdges[cell].some(other => grid[other] && Math.abs(grid[other] - digit) === 1)
  if (grid.some((digit, cell) => digit && (!allowed[cell].has(digit) || peers[cell].some(peer => grid[peer] === digit) || consecutive(cell, digit)))) {
    return { count: 0, solution: undefined, nodes: 0 }
  }
  let count = 0, nodes = 0
  let solution: string | undefined
  function search() {
    if (++nodes > budget) throw new Error('Independent cell-rule counter exhausted its search budget')
    let next = -1, options: number[] = []
    for (let cell = 0; cell < 81; cell++) {
      if (grid[cell]) continue
      const digits = [...allowed[cell]].filter(digit => !peers[cell].some(peer => grid[peer] === digit) && !consecutive(cell, digit))
      if (!digits.length) return
      if (next === -1 || digits.length < options.length) { next = cell; options = digits }
    }
    if (next === -1) { solution ??= grid.join(''); count++; return }
    for (const digit of options) {
      grid[next] = digit
      search()
      grid[next] = 0
      if (count >= 2) return
    }
  }
  search()
  return { count, solution, nodes }
}
