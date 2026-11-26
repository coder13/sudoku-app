import type { Difficulty } from './engine.ts'
import { isSolved, type Game } from './game.ts'
import { gameVariantId, type GameVariantId } from './new-puzzle.ts'

export type DifficultyStatistics = { solved: number; averageSeconds: number | null }

export type DifficultyTotals<Level> = Map<Level, { solved: number; timed: number; seconds: number }>

export function recordDifficultySolve<Level>(totals: DifficultyTotals<Level>, level: Level, elapsed?: number) {
  const total = totals.get(level) ?? { solved: 0, timed: 0, seconds: 0 }
  total.solved++
  if (elapsed !== undefined && Number.isFinite(elapsed) && elapsed > 0) {
    total.timed++
    total.seconds += elapsed
  }
  totals.set(level, total)
}

export function summarizeDifficultySolves<Level>(totals: DifficultyTotals<Level>): Map<Level, DifficultyStatistics> {
  return new Map([...totals].map(([level, total]) => [level, {
    solved: total.solved,
    averageSeconds: total.timed ? Math.round(total.seconds / total.timed) : null,
  }]))
}

export function difficultyStatistics(games: readonly Game[], variant: GameVariantId = 'classic'): Map<Difficulty, DifficultyStatistics> {
  const totals: DifficultyTotals<Difficulty> = new Map()
  for (const game of games) {
    // Keep historical grades separate, and do not count an already-filled import as a solve.
    if (!game.difficulty || game.customDifficulty || !game.started || gameVariantId(game) !== variant || !isSolved(game)) continue
    recordDifficultySolve(totals, game.difficulty, game.elapsed)
  }
  return summarizeDifficultySolves(totals)
}
