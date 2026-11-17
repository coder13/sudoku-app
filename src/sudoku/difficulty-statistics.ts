import type { Difficulty } from './engine.ts'
import { isSolved, type Game } from './game.ts'
import type { PuzzleVariantId } from './variants.ts'

export type DifficultyStatistics = { solved: number; averageSeconds: number | null }

export function difficultyStatistics(games: readonly Game[], variant: PuzzleVariantId = 'classic'): Map<Difficulty, DifficultyStatistics> {
  const totals = new Map<Difficulty, { solved: number; timed: number; seconds: number }>()
  for (const game of games) {
    // Keep historical grades separate, and do not count an already-filled import as a solve.
    if (!game.difficulty || !game.started || (game.variant?.id ?? 'classic') !== variant || !isSolved(game)) continue
    const total = totals.get(game.difficulty) ?? { solved: 0, timed: 0, seconds: 0 }
    total.solved++
    if (Number.isFinite(game.elapsed) && game.elapsed > 0) {
      total.timed++
      total.seconds += game.elapsed
    }
    totals.set(game.difficulty, total)
  }
  return new Map([...totals].map(([difficulty, total]) => [difficulty, {
    solved: total.solved,
    averageSeconds: total.timed ? Math.round(total.seconds / total.timed) : null,
  }]))
}
