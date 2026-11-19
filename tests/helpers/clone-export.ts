import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Convert paired Clone controls to the official f-puzzles 1.11.3 wire schema. */
export function cloneFPuzzles(puzzle: VariantPuzzle) {
  const reference = (cell: number) => 'R' + (Math.floor(cell / 9) + 1) + 'C' + (cell % 9 + 1)
  return { size: 9, grid: Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => {
    const digit = Number(puzzle.givens[row * 9 + col])
    return digit ? { value: digit, given: true } : {}
  })), clone: puzzle.rules!.map(rule => {
    if (rule.type !== 'clone' || rule.groups.some(group => group.length !== 2)) throw new Error('This export control requires paired Clone rules')
    return { cells: rule.groups.map(group => reference(group[0])), cloneCells: rule.groups.map(group => reference(group[1])) }
  }) }
}
