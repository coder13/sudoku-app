import type { NumberImportAnnotations } from './imported-annotations.ts'
import type { NumberPosition } from './progress.ts'

export const numberGameNames = {
  kakuro: 'Kakuro', calcudoku: 'Calcudoku', futoshiki: 'Futoshiki', hidato: 'Hidato', rullo: 'Rullo',
} as const
export type NumberGame = keyof typeof numberGameNames

export function isNumberGame(value: unknown): value is NumberGame {
  return typeof value === 'string' && Object.hasOwn(numberGameNames, value)
}

export const numberPuzzleDifficulties = ['easy', 'medium', 'hard'] as const
export type NumberPuzzleDifficulty = typeof numberPuzzleDifficulties[number]
export const numberPuzzleDifficultyLabels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const
export type NumberPuzzleEntry = {
  id: string
  difficulty: NumberPuzzleDifficulty
  number: number
  generated?: true
  imported?: true
  initialPosition?: NumberPosition
  annotations?: NumberImportAnnotations
}

export function numberPuzzleDestination(game: NumberGame, entry: NumberPuzzleEntry) {
  return {
    to: `/puzzles/${game}/$puzzle` as const,
    params: { puzzle: entry.generated ? 'generated' : entry.imported ? 'imported' : entry.id },
    search: entry.generated || entry.imported ? { board: entry.id } : undefined,
  }
}
