import { runEngine } from './engine.ts'
import { createGameId, makeGame, puzzleIdentity, type Game } from './game.ts'
import { analyzeMini } from './mini-play.ts'
import { detectPuzzle, importSharedPuzzle, type ImportedPuzzle } from './puzzle-import.ts'
import { findSharedAttempt } from './puzzle-sharing.ts'
import { applyPuzzleGrade, ratePuzzle, type PuzzleGrade } from './puzzle-rating.ts'
import { validation } from './puzzle-validation.ts'
import { variantName } from './variants.ts'

export type PuzzlePreview = { game: Game; format: ImportedPuzzle['format'] | 'Photo or screenshot'; grade?: PuzzleGrade | null }

export function findImportedPuzzle(games: readonly Game[], { givens, variant }: Pick<ImportedPuzzle, 'givens' | 'variant'>) {
  const identity = puzzleIdentity({ givens, variant })
  return games.find(game => game.source !== 'draft' && puzzleIdentity(game) === identity)
}

/** Decode and verify the complete puzzle before the app offers to save or play it. */
export async function prepareImportedPuzzle(input: string, games: readonly Game[] = []): Promise<PuzzlePreview> {
  return preparePuzzlePreview(await detectPuzzle(input), games)
}

export async function prepareSharedPuzzle(id: string, games: readonly Game[], signal: AbortSignal): Promise<PuzzlePreview> {
  const existing = findSharedAttempt(games, id)
  if (existing) return { game: existing, format: 'Puzzle link' }
  const imported = await importSharedPuzzle(id, signal)
  signal.throwIfAborted()
  return preparePuzzlePreview(imported, games)
}

async function preparePuzzlePreview(imported: ImportedPuzzle, games: readonly Game[]): Promise<PuzzlePreview> {
  const { givens, variant, format, title, collection, sharedPuzzleId, grid } = imported
  const existing = findImportedPuzzle(games, imported)
  const name = variant?.id === 'mixed' ? 'Imported mixed-rule puzzle'
    : variant ? `Imported ${variantName(variant)} puzzle` : grid ? 'Imported Mini Sudoku' : 'Imported puzzle'
  const game = { ...makeGame(createGameId(), title ?? name, givens, 'imported', undefined, grid), collection, sharedPuzzleId }
  if (!existing) {
    const status = grid ? await analyzeMini(givens) : variant
      ? await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: variant.puzzle } })
      : await runEngine({ type: 'analyze', values: givens })
    if (status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
    if (status !== 'unique') throw new Error(validation[status].text)
  }
  if (grid) return { game: applyPuzzleGrade(game, null), format, grade: null }
  if (variant) {
    const solution = existing?.variant?.solution ??
      await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: variant.puzzle } })
    game.variant = { ...variant, solution }
  }
  game.difficulty = existing?.difficulty
  game.score = existing?.score
  if (game.difficulty === undefined || game.score === undefined) {
    try {
      const grade = existing?.ratingAttempt?.grade ?? await ratePuzzle(givens, game.variant)
      return { game: applyPuzzleGrade(game, grade), grade, format }
    } catch { /* A validated puzzle can still be imported if rating is unavailable. */ }
  }
  return { game, format }
}
