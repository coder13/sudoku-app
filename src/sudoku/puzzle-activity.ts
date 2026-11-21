import { isSolved, type Game } from './game.ts'
import type { Difficulty } from './engine.ts'
import { gameVariantId, type GameVariantId } from './new-puzzle.ts'

export const activityPrefix = 'sudoku-app:v1:played:'
const indexedActivity = new Map<string, number>()

export function rememberPuzzleActivity(id: string, played: number | undefined) {
  if (played === undefined) indexedActivity.delete(id)
  else indexedActivity.set(id, played)
}

export function lastPlayed(game: Game, storage?: Storage) {
  const fallback = game.actionHistory?.at(-1)?.lastAt ?? game.created
  try {
    const recorded = storage ? undefined : indexedActivity.get(game.id)
    const played = recorded ?? (Number((storage ?? localStorage).getItem(activityPrefix + game.id)) || fallback)
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

export function matchesSolvedFilters({ game, solvedAt }: { game: Game; solvedAt: number }, filters: SolvedPuzzleFilters) {
  const { variant, difficulty, from, to } = filters
  if (variant && gameVariantId(game) !== variant) return false
  if (difficulty && (game.difficulty ?? 'unrated') !== difficulty) return false
  const day = solveDate(solvedAt)
  return (!from || day >= from) && (!to || day <= to)
}
