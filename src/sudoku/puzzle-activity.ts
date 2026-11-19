import { isSolved, type Game } from './game.ts'

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
    .sort((a, b) => lastPlayed(b, storage) - lastPlayed(a, storage) || b.created - a.created || a.id.localeCompare(b.id))
}
