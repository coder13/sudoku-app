import { runEngine, type Analysis } from './engine.ts'
import { rateAlgebraicPuzzle, verifyAlgebraicPuzzle } from './algebraic-game.ts'
import { createGameId, makeGame, puzzleIdentity, type Game } from './game.ts'
import { verifySixPuzzle } from './six-game.ts'
import { analyzeMini } from './mini-play.ts'
import { detectPuzzle, importSharedPuzzle, type ImportedPuzzle } from './puzzle-import.ts'
import { findSharedAttempt } from './puzzle-sharing.ts'
import { applyPuzzleGrade, ratePuzzle, type PuzzleGrade } from './puzzle-rating.ts'
import { validation } from './puzzle-validation.ts'
import { variantName } from './variants.ts'

export type PuzzlePreview = { game: Game; format: ImportedPuzzle['format'] | 'Photo or screenshot'; grade?: PuzzleGrade | null }

export function findImportedPuzzle(games: readonly Game[], imported: Pick<ImportedPuzzle, 'givens' | 'variant' | 'algebraic' | 'grid' | 'sixRules'>) {
  const identity = puzzleIdentity(imported)
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

function importValidationError(status: Exclude<Analysis, 'unique'>): Error {
  return new Error(status === 'conflict' ? 'This puzzle has conflicting givens or rules.' : validation[status].text)
}

async function preparePuzzlePreview(imported: ImportedPuzzle, games: readonly Game[]): Promise<PuzzlePreview> {
  const { givens, variant, format, title, collection, sharedPuzzleId, grid, algebraic, sixRules, sixAuthor, authoredSolution } = imported
  const existing = findImportedPuzzle(games, imported)
  const name = algebraic ? (algebraic.source?.title.trim().slice(0, 72) || 'Imported Algebraic Cages')
    : variant?.id === 'mixed' ? 'Imported mixed-rule puzzle'
    : variant ? `Imported ${variantName(variant)} puzzle` : grid?.size === 6 ? 'Imported 6 × 6 Sudoku' : grid ? 'Imported Mini Sudoku' : 'Imported puzzle'
  const game = { ...makeGame(createGameId(), title ?? name, givens, 'imported', undefined, grid), collection, sharedPuzzleId }
  if (grid?.size === 6) {
    if (!sixRules) throw new Error('This 6 × 6 puzzle is missing its rule list.')
    game.six = await verifySixPuzzle({ grid, givens, rules: sixRules, author: sixAuthor, authoredSolution })
    return { game: applyPuzzleGrade(game, null), format, grade: null }
  }
  if (algebraic && grid) {
    game.algebraic = await verifyAlgebraicPuzzle({ givens, ...algebraic })
    const rating = await rateAlgebraicPuzzle(givens, game.algebraic.rules)
    return { game: { ...game, difficulty: rating?.difficulty ?? null, score: rating?.points ?? null }, format }
  }
  if (variant && !grid) {
    const position = { puzzle: variant.puzzle }
    if (existing) {
      const solution = existing.variant?.solution ?? await runEngine({ type: 'variant', operation: 'solve', position })
      game.variant = { ...variant, solution }
    } else {
      const result = await runEngine({ type: 'variant', operation: 'solve-unique', position })
      if (result.status !== 'unique') throw importValidationError(result.status)
      game.variant = { ...variant, solution: result.solution }
    }
  } else if (!existing) {
    const status = grid ? await analyzeMini(givens) : await runEngine({ type: 'analyze', values: givens })
    if (status !== 'unique') throw importValidationError(status)
  }
  if (grid) return { game: applyPuzzleGrade(game, null), format, grade: null }
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
