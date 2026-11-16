import type { Difficulty } from './engine.ts'

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  unfair: 'Unfair',
  extreme: 'Extreme',
}

// Score bands from Difficulty::from_score in crates/engine/src/logical.rs.
export const DIFFICULTY_SCORE_RANGES: Record<Difficulty, string> = {
  easy: '0–800',
  medium: '801–1,000',
  hard: '1,001–1,600',
  unfair: '1,601–1,800',
  extreme: '1,801+',
}

export const DEFAULT_DIFFICULTY: Difficulty = 'easy'

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY_LABELS, value)
}

export function formatPuzzleRating(difficulty: Difficulty, score?: number | null): string {
  const label = DIFFICULTY_LABELS[difficulty]
  return score == null ? label : `${label} (${score})`
}
