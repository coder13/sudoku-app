import type { Difficulty } from './engine.ts'

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  unfair: 'Unfair',
  extreme: 'Extreme',
}

export const DEFAULT_DIFFICULTY: Difficulty = 'easy'
export const SINGLE_TECHNIQUES: readonly string[] = ['full-house', 'naked-single', 'hidden-single']

export type DifficultyPreference = Difficulty | 'auto'
export const DIFFICULTY_OPTIONS: DifficultyPreference[] = ['auto', ...Object.keys(DIFFICULTY_LABELS) as Difficulty[]]

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY_LABELS, value)
}

export function isDifficultyPreference(value: unknown): value is DifficultyPreference {
  return value === 'auto' || isDifficulty(value)
}

export function difficultyOptionLabel(value: DifficultyPreference, recommended: Difficulty): string {
  return value === 'auto' ? `Auto (${DIFFICULTY_LABELS[recommended]})` : DIFFICULTY_LABELS[value]
}

export function formatPuzzleRating(difficulty: Difficulty, score?: number | null): string {
  const label = DIFFICULTY_LABELS[difficulty]
  return score == null ? label : `${label} (${score})`
}
