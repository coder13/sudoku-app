import type { Difficulty } from './engine.ts'

// These modes were dominated by a single detector in the quality audit.
// Focus is a bounded first search. Every result still passes the full profile.
const FOCUS: Partial<Record<Difficulty, readonly string[]>> = {
  tricky: ['x-wing', 'swordfish', 'skyscraper', 'two-string-kite', 'empty-rectangle'],
  'very-hard': ['finned-swordfish', 'simple-coloring', '3d-medusa', 'x-chain', 'xy-chain', 'wxyz-wing'],
}

export function generationFocus(difficulty: Difficulty, seed: number): string | undefined {
  const choices = FOCUS[difficulty]
  return choices?.[(seed >>> 8) % choices.length]
}
