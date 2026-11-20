import type { GeneratedNumberGame } from './generated.ts'

export type NumberGame = GeneratedNumberGame | 'futoshiki' | 'hidato' | 'rullo'

export const numberPuzzleDifficulties = ['easy', 'medium', 'hard'] as const
export type NumberPuzzleDifficulty = typeof numberPuzzleDifficulties[number]
export const numberPuzzleDifficultyLabels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const
export type NumberPuzzleEntry = { id: string; difficulty: NumberPuzzleDifficulty; number: number; generated?: true }

export function numberPuzzleDestination(game: NumberGame, entry: NumberPuzzleEntry) {
  return {
    to: `/puzzles/${game}/$puzzle` as const,
    params: { puzzle: entry.generated ? 'generated' : entry.id },
    search: entry.generated ? { board: entry.id } : undefined,
  }
}
