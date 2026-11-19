import { calcudokuFromRecipe, decodeGeneratedNumberPuzzle } from '../number-puzzles/generated.ts'
import { createCalcudoku, type Cage, type CageOperator, type CalcudokuPuzzle } from './engine.ts'
import { numberPuzzleDifficulties, type NumberPuzzleEntry } from '../number-puzzles/catalog.ts'

export type CalcudokuEntry = NumberPuzzleEntry & { puzzle: CalcudokuPuzzle }
type Recipe = [number, CageOperator, number[]]
const recipes: Record<typeof numberPuzzleDifficulties[number], { size: number; boards: Recipe[][] }> = {
  easy: {
    size: 3,
    boards: [
      [[3, 'multiply', [0, 1]], [18, 'multiply', [2, 5, 7, 8]], [2, 'divide', [3, 4]], [2, 'equal', [6]]],
      [[3, 'equal', [0]], [6, 'add', [1, 4, 5]], [2, 'equal', [2]], [2, 'divide', [3, 6]], [3, 'divide', [7, 8]]],
      [[12, 'multiply', [0, 1, 4]], [3, 'divide', [2, 5]], [7, 'add', [3, 6, 7, 8]]],
    ],
  },
  medium: {
    size: 4,
    boards: [
      [[12, 'add', [0, 1, 2, 5]], [1, 'subtract', [3, 7]], [2, 'equal', [4]], [3, 'equal', [6]],
        [7, 'add', [8, 9, 10]], [12, 'multiply', [11, 14, 15]], [5, 'add', [12, 13]]],
      [[8, 'add', [0, 4, 8]], [4, 'add', [1, 2, 6]], [5, 'add', [3, 7]], [2, 'subtract', [5, 9]],
        [12, 'multiply', [10, 11, 15]], [24, 'multiply', [12, 13, 14]]],
      [[3, 'equal', [0]], [4, 'add', [1, 5, 6]], [2, 'subtract', [2, 3]], [3, 'subtract', [4, 8]],
        [18, 'multiply', [7, 10, 11]], [12, 'multiply', [9, 13]], [2, 'equal', [12]], [4, 'multiply', [14, 15]]],
    ],
  },
  hard: {
    size: 5,
    boards: [
      [[4, 'multiply', [0, 1, 5]], [16, 'add', [2, 3, 4, 8]], [20, 'multiply', [6, 10, 11]], [3, 'equal', [7]],
        [11, 'add', [9, 12, 13, 14]], [60, 'multiply', [15, 16, 21, 22]], [4, 'equal', [17]],
        [10, 'multiply', [18, 23, 24]], [2, 'equal', [19]], [3, 'equal', [20]]],
      [[3, 'subtract', [0, 1]], [10, 'add', [2, 3, 4]], [12, 'multiply', [5, 10, 11]], [8, 'add', [6, 7, 8]],
        [12, 'add', [9, 14, 19]], [10, 'multiply', [12, 17, 18]], [4, 'equal', [13]], [60, 'multiply', [15, 16, 20, 21]],
        [12, 'multiply', [22, 23, 24]]],
      [[6, 'multiply', [0, 1]], [5, 'equal', [2]], [20, 'multiply', [3, 7, 8]], [2, 'divide', [4, 9]],
        [7, 'add', [5, 6]], [15, 'add', [10, 11, 15, 16]], [12, 'multiply', [12, 13, 17]], [12, 'multiply', [14, 18, 19]],
        [2, 'equal', [20]], [4, 'multiply', [21, 22]], [8, 'add', [23, 24]]],
    ],
  },
}

export const calcudokuCatalog: readonly CalcudokuEntry[] = numberPuzzleDifficulties.flatMap(difficulty => {
  const { size, boards } = recipes[difficulty]
  return boards.map((board, i) => {
    const cages: Cage[] = board.map(([target, operator, cells]) => ({ target, operator, cells }))
    return { id: `${difficulty}-${i + 1}`, number: i + 1, difficulty, puzzle: createCalcudoku(size, cages) }
  })
})

export function generatedCalcudokuEntry(id: string, number: number): CalcudokuEntry | null {
  const generated = decodeGeneratedNumberPuzzle(id, 'calcudoku')
  if (!generated) return null
  try {
    return { id, number, difficulty: generated.difficulty, generated: true, puzzle: calcudokuFromRecipe(generated.recipe) }
  } catch {
    return null
  }
}
