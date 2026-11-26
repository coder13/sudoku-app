import type { Difficulty } from './engine.ts'
import { isSolved, type Game } from './game.ts'
import { gameVariantId, type GameVariantId } from './new-puzzle.ts'
import { solvedHistory } from './puzzle-activity.ts'

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
    if (!game.difficulty || !game.started || gameVariantId(game) !== variant || !isSolved(game)) continue
    recordDifficultySolve(totals, game.difficulty, game.elapsed)
  }
  return summarizeDifficultySolves(totals)
}

function timedSolvePoints(game: Game): number | null {
  if (!game.started || game.timeUntracked || game.elapsed <= 0 || game.score == null || !isSolved(game)) return null
  return game.score
}

function ratedSolveTotals(games: readonly Game[]) {
  let points = 0
  let seconds = 0
  for (const game of games) {
    const score = timedSolvePoints(game)
    if (score === null) continue
    points += score
    seconds += game.elapsed
  }
  return { points, seconds }
}

export function pointsPerSecond(games: readonly Game[]): number | null {
  const { points, seconds } = ratedSolveTotals(games)
  return seconds > 0 ? points / seconds : null
}

export function pointsPerSecondForSolve(game: Game, games: readonly Game[]) {
  const points = timedSolvePoints(game)
  if (points === null) return null

  const history = solvedHistory([game, ...games.filter(puzzle => puzzle.id !== game.id)])
  const index = history.findIndex(solve => solve.game.id === game.id)
  const prior = ratedSolveTotals(history.slice(index + 1).map(solve => solve.game))

  return {
    puzzle: points / game.elapsed,
    before: prior.seconds > 0 ? prior.points / prior.seconds : null,
    after: (prior.points + points) / (prior.seconds + game.elapsed),
  }
}
