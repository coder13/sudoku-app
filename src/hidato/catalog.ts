import { createHidato, type HidatoPuzzle } from './engine.ts'
import { numberPuzzleDifficulties, type NumberPuzzleDifficulty, type NumberPuzzleEntry } from '../number-puzzles/catalog.ts'

export type HidatoEntry = NumberPuzzleEntry & { puzzle: HidatoPuzzle }
const recipes: Record<NumberPuzzleDifficulty, { width: number; boards: number[][] }> = {
  easy: {
    width: 3,
    boards: [
      [4, 0, 0, 0, 1, 0, 0, -1, 8],
      [0, 0, 0, 5, 0, 0, 8, -1, 1],
      [8, 0, 0, 1, 0, 0, 0, -1, 4],
    ],
  },
  medium: {
    width: 4,
    boards: [
      [10, 8, 0, 0, 11, 0, 0, 6, -1, 0, 0, 1, 14, 0, -1, 2],
      [0, 5, 0, 8, 3, 0, 9, 0, -1, 1, 0, 0, 14, 0, -1, 0],
      [0, 0, 0, 10, 14, 0, 11, 8, -1, 3, 5, 0, 0, 1, -1, 0],
    ],
  },
  hard: {
    width: 5,
    boards: [
      [9, 0, 0, -1, 23, 0, 6, 0, 0, 0, 0, 0, 0, 0, 16, 0, 4, 3, 0, 17, 1, 0, -1, 0, 19],
      [0, 0, 18, -1, 1, 15, 0, 0, 0, 0, 12, 0, 0, 0, 3, 0, 7, 6, 4, 0, 9, 0, -1, 23, 0],
      [11, 0, 0, -1, 23, 0, 0, 8, 6, 0, 0, 13, 0, 0, 0, 2, 0, 0, 0, 0, 1, 15, -1, 18, 0],
    ],
  },
}

export const hidatoCatalog: readonly HidatoEntry[] = numberPuzzleDifficulties.flatMap(difficulty => {
  const { width, boards } = recipes[difficulty]
  return boards.map((board, i) => ({
    id: `${difficulty}-${i + 1}`, number: i + 1, difficulty, puzzle: createHidato(width, board),
  }))
})
