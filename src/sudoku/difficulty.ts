import type { Difficulty } from './engine.ts'

export const DIFFICULTY_LEVELS = ['beginner', 'easy', 'medium', 'tricky', 'hard', 'very-hard', 'expert', 'master', 'extreme', 'impossible'] as const
export type CurrentDifficulty = typeof DIFFICULTY_LEVELS[number]
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner', easy: 'Easy', medium: 'Medium', tricky: 'Tricky', hard: 'Hard',
  'very-hard': 'Very Hard', expert: 'Expert', master: 'Master', extreme: 'Extreme', impossible: 'Impossible',
  unfair: 'Unfair', // Historical saves keep their original grade.
}
export const DEFAULT_DIFFICULTY: CurrentDifficulty = 'medium'
export const SINGLE_TECHNIQUES: readonly string[] = ['full-house', 'hidden-single-box', 'naked-single', 'hidden-single']
export type DifficultyPreference = Difficulty | 'auto'
export const DIFFICULTY_OPTIONS: readonly DifficultyPreference[] = DIFFICULTY_LEVELS

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY_LABELS, value)
}
export function isDifficultyPreference(value: unknown): value is DifficultyPreference {
  return value === 'auto' || isDifficulty(value)
}
export function currentDifficulty(value: Difficulty): CurrentDifficulty {
  return value === 'unfair' ? 'expert' : value
}
export function difficultyIndex(value: Difficulty): number {
  return DIFFICULTY_LEVELS.indexOf(currentDifficulty(value))
}
export function difficultyOptionLabel(value: DifficultyPreference, recommended: Difficulty): string {
  return value === 'auto' ? `Auto (${DIFFICULTY_LABELS[recommended]})` : DIFFICULTY_LABELS[value]
}
export function formatPuzzleRating(difficulty: Difficulty, score?: number | null): string {
  const label = DIFFICULTY_LABELS[difficulty]
  return score == null ? label : `${label} (${score})`
}
