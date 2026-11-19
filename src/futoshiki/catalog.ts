import { createFutoshiki, type FutoshikiPuzzle } from './engine.ts'
import { numberPuzzleDifficulties, type NumberPuzzleDifficulty, type NumberPuzzleEntry } from '../number-puzzles/catalog.ts'

export type FutoshikiEntry = NumberPuzzleEntry & { puzzle: FutoshikiPuzzle }
type Recipe = { given?: [number, number][]; edges: [number, number][] }
const recipes: Record<NumberPuzzleDifficulty, { size: number; boards: Recipe[] }> = {
  easy: { size: 4, boards: [
    { given: [[15, 4]], edges: [[14, 13], [6, 5], [13, 9], [8, 4], [9, 10]] },
    { edges: [[11, 15], [0, 4], [11, 10], [10, 9], [13, 14], [5, 6], [6, 7]] },
    { edges: [[14, 13], [8, 12], [9, 10], [8, 9], [3, 7], [14, 15], [6, 5]] },
  ] },
  medium: { size: 5, boards: [
    { edges: [[24, 23], [9, 4], [17, 18], [14, 13], [21, 16], [11, 16], [7, 2], [15, 10], [6, 1], [5, 10], [22, 23], [1, 2]] },
    { edges: [[17, 18], [18, 19], [21, 22], [13, 12], [22, 17], [1, 2], [23, 24], [8, 3]] },
    { edges: [[6, 1], [1, 2], [4, 3], [5, 6], [22, 23], [7, 8], [21, 16], [22, 17], [17, 18], [19, 14]] },
  ] },
  hard: { size: 6, boards: [
    { edges: [[20, 19], [26, 25], [26, 20], [8, 14], [10, 16], [14, 13], [11, 17], [4, 10], [31, 30], [24, 18],
      [29, 35], [27, 33], [13, 12], [32, 31], [22, 23]] },
    { edges: [[6, 0], [28, 29], [11, 17], [7, 6], [21, 22], [18, 12], [32, 26], [4, 5], [8, 9], [30, 24], [22, 23],
      [31, 32], [12, 13], [31, 30], [10, 16], [13, 14], [34, 33], [27, 21]] },
    { given: [[4, 3], [35, 2]], edges: [[29, 35], [2, 3], [34, 35], [31, 25], [8, 2], [32, 26], [8, 14], [27, 21],
      [10, 9], [13, 19], [6, 12], [7, 8]] },
  ] },
}

export const futoshikiCatalog: readonly FutoshikiEntry[] = numberPuzzleDifficulties.flatMap(difficulty => {
  const { size, boards } = recipes[difficulty]
  return boards.map(({ edges, given = [] }, i) => {
    const givens = Array<number>(size * size).fill(0)
    for (const [cell, digit] of given) givens[cell] = digit
    const inequalities = edges.map(([less, greater]) => ({ less, greater }))
    return { id: `${difficulty}-${i + 1}`, number: i + 1, difficulty, puzzle: createFutoshiki(size, givens, inequalities) }
  })
})
