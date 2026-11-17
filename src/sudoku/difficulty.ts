import type { Difficulty } from './engine.ts'

export const DIFFICULTY_LEVELS = ['beginner', 'easy', 'medium', 'tricky', 'hard', 'very-hard', 'expert', 'master', 'extreme', 'impossible'] as const
export type CurrentDifficulty = typeof DIFFICULTY_LEVELS[number]
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner', easy: 'Easy', medium: 'Medium', tricky: 'Tricky', hard: 'Hard',
  'very-hard': 'Very Hard', expert: 'Expert', master: 'Master', extreme: 'Extreme', impossible: 'Impossible',
  unfair: 'Unfair', // Historical saves keep their original grade.
}
export const DIFFICULTY_DESCRIPTIONS: Record<CurrentDifficulty, string> = {
  beginner: 'Find missing digits and scan boxes for their only possible place.',
  easy: 'Use singles in cells, rows, columns, and boxes.',
  medium: 'Use locked candidates, pairs, and triples.',
  tricky: 'Follow one digit through fish and short patterns.',
  hard: 'Find wings and other patterns involving several digits.',
  'very-hard': 'Follow coloring, X-Chains, and XY-Chains.',
  expert: 'Build alternating inference chains and loops.',
  master: 'Connect groups of candidates and almost locked sets.',
  extreme: 'Combine forcing proofs and specialist patterns.',
  impossible: 'Our hardest puzzles. A practical human solution is not promised.',
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
