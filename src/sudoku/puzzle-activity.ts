import type { NumberGame, NumberPuzzleDifficulty } from '../number-puzzles/catalog.ts'
import { isSolved, type Game } from './game.ts'
import type { Difficulty } from './engine.ts'
import { gameVariantId, type GameVariantId } from './new-puzzle.ts'

export const activityPrefix = 'sudoku-app:v1:played:'

export function lastPlayed(game: Game, storage?: Storage) {
  const fallback = game.actionHistory?.at(-1)?.lastAt ?? game.created
  try {
    const played = Number((storage ?? localStorage).getItem(activityPrefix + game.id)) || fallback
    return Number.isFinite(new Date(played).getTime()) ? played : 0
  } catch { return Number.isFinite(new Date(fallback).getTime()) ? fallback : 0 }
}

export function inProgress(games: readonly Game[], storage?: Storage) {
  return games.filter(game => !game.archived && !game.savedForLater && !isSolved(game))
    .map(game => ({ game, playedAt: lastPlayed(game, storage) }))
    .sort((a, b) => b.playedAt - a.playedAt || b.game.created - a.game.created || a.game.id.localeCompare(b.game.id))
    .map(({ game }) => game)
}

export type SolvedPuzzleFilters = {
  game?: 'sudoku' | NumberGame
  variant?: GameVariantId
  difficulty?: Difficulty | 'unrated'
  from?: string
  to?: string
}

function solveTime(game: Game, storage?: Storage) {
  const history = game.actionHistory ?? []
  for (let index = history.length - 1; index >= 0; index--) {
    // Later annotations do not move a solve in the history.
    const action = history[index]
    if (action.changes.some(change => change.kind === 'entry') && Number.isFinite(new Date(action.lastAt).getTime())) return action.lastAt
  }
  const outcome = game.ratingAttempt?.outcome
  if (outcome?.finish === 'solved' && !outcome.estimated && Number.isFinite(new Date(outcome.at).getTime())) return outcome.at
  return lastPlayed(game, storage)
}

export function solvedHistory(games: readonly Game[], storage?: Storage) {
  return games.filter(isSolved).map(game => ({ game, solvedAt: solveTime(game, storage) }))
    .sort((a, b) => b.solvedAt - a.solvedAt || b.game.created - a.game.created || a.game.id.localeCompare(b.game.id))
}

/** Match date inputs to the local day the solve appears under. */
export function solveDate(timestamp: number) {
  const date = new Date(timestamp)
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-')
}

function matchesSolvedDate(solvedAt: number | undefined, { from, to }: SolvedPuzzleFilters) {
  if (!from && !to) return true
  if (solvedAt === undefined) return false
  const day = solveDate(solvedAt)
  return (!from || day >= from) && (!to || day <= to)
}

export function matchesSolvedFilters({ game, solvedAt }: { game: Game; solvedAt: number }, filters: SolvedPuzzleFilters) {
  const { game: gameType, variant, difficulty } = filters
  if (gameType && gameType !== 'sudoku') return false
  if (variant && gameVariantId(game) !== variant) return false
  if (difficulty && (game.difficulty ?? 'unrated') !== difficulty) return false
  return matchesSolvedDate(solvedAt, filters)
}

export function matchesSolvedNumberFilters(
  { game, difficulty, lastPlayed }: { game: NumberGame; difficulty: NumberPuzzleDifficulty; lastPlayed?: number },
  filters: SolvedPuzzleFilters,
) {
  if (filters.variant || filters.game && filters.game !== game) return false
  if (filters.difficulty && filters.difficulty !== difficulty) return false
  return matchesSolvedDate(lastPlayed, filters)
}
