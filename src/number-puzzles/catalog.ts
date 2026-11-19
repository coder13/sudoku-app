export const numberPuzzleDifficulties = ['easy', 'medium', 'hard'] as const
export type NumberPuzzleDifficulty = typeof numberPuzzleDifficulties[number]
export const numberPuzzleDifficultyLabels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const
export type NumberPuzzleEntry = { id: string; difficulty: NumberPuzzleDifficulty; number: number }
