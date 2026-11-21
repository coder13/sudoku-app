import type { Game } from './game.ts'

/** Timer and derived metadata may change without changing the board a job read. */
export function samePuzzleRevision(origin: Game, current: Game | undefined): current is Game {
  return Boolean(current && current.id === origin.id && current.source === origin.source &&
    current.givens === origin.givens && current.variant === origin.variant && current.grid === origin.grid &&
    current.algebraic === origin.algebraic && current.sized === origin.sized &&
    current.position === origin.position && current.past === origin.past && current.future === origin.future)
}

export function canApplyPuzzleResult(origin: Game, current: Game | undefined): current is Game {
  return !origin.paused && Boolean(current && !current.paused) && samePuzzleRevision(origin, current)
}
