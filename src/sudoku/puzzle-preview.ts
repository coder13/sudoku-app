import { runEngine, type Analysis } from './engine.ts'
import { sameCandidateColors, sameImportedCellColors } from './imported-colors.ts'
import { sameImportedDrawings } from './imported-drawings.ts'
import { rateAlgebraicPuzzle, verifyAlgebraicPuzzle } from './algebraic-game.ts'
import { createGameId, makeGame, markSolveUntimed, puzzleIdentity, type Game } from './game.ts'
import { verifySizedRulePuzzle } from './sized-rule-game.ts'
import { analyzeMini } from './mini-play.ts'
import { detectPuzzle, importSharedPuzzle, type ImportedPuzzle } from './puzzle-import.ts'
import { findSharedAttempt } from './puzzle-sharing.ts'
import { applyPuzzleGrade, needsPuzzleGrade, ratePuzzle, type PuzzleGrade } from './puzzle-rating.ts'
import { validation } from './puzzle-validation.ts'
import { FIVE_JIGSAW_NAME, SEVEN_BOXLESS_NAME } from './new-puzzle.ts'
import { variantName } from './variants.ts'

export type PuzzlePreview = {
  game: Game
  format: ImportedPuzzle['format'] | 'Photo or screenshot'
  grade?: PuzzleGrade | null
  hasProgress?: true
}

export function findImportedPuzzle(games: readonly Game[], imported: Pick<ImportedPuzzle, 'givens' | 'variant' | 'algebraic' | 'grid' | 'sizedRules' | 'givenCellColors'>) {
  const identity = puzzleIdentity(imported)
  return games.find(game => game.source !== 'draft' && puzzleIdentity(game) === identity &&
    sameImportedCellColors(game.givenCellColors, imported.givenCellColors))
}

export function findImportAttempt(games: readonly Game[], { game, hasProgress }: PuzzlePreview): Game | undefined {
  if (game.sharedPuzzleId) return findSharedAttempt(games, game.sharedPuzzleId)
  const attempts = game.whispersGuide ? games.filter(saved => saved.whispersGuide) : games
  if (!hasProgress) return findImportedPuzzle(attempts, game)
  const { entries, center, corner, colors, importedCellColors, candidateColors, importedCandidateColors, importedDrawings } = game.position
  const identity = puzzleIdentity(game)
  return attempts.find(saved => saved.source !== 'draft' && saved.position.entries === entries &&
    center.every((mask, cell) => mask === saved.position.center[cell]) &&
    corner.every((mask, cell) => mask === saved.position.corner[cell]) &&
    colors.every((color, cell) => color === saved.position.colors[cell]) &&
    sameImportedCellColors(importedCellColors, saved.position.importedCellColors) &&
    sameCandidateColors(candidateColors, saved.position.candidateColors) &&
    sameCandidateColors(importedCandidateColors, saved.position.importedCandidateColors) &&
    sameImportedDrawings(importedDrawings, saved.position.importedDrawings) &&
    sameImportedCellColors(game.givenCellColors, saved.givenCellColors) &&
    puzzleIdentity(saved) === identity)
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
  const { givens, variant, format, title, collection, sharedPuzzleId, grid, algebraic, sizedRules, sizedAuthor,
    authoredSolution, progress, whispersGuide, givenCellColors } = imported
  const existing = findImportedPuzzle(games, imported)
  const name = algebraic ? (algebraic.source?.title.trim().slice(0, 72) || 'Imported Algebraic Cages')
    : variant?.id === 'mixed' && !variant.fog ? 'Imported mixed-rule puzzle'
    : variant ? `Imported ${variantName(variant)} puzzle`
      : grid && 'noRegions' in grid ? `Imported ${SEVEN_BOXLESS_NAME}`
        : grid?.size === 5 ? `Imported ${FIVE_JIGSAW_NAME}`
        : grid?.size === 4 ? 'Imported Mini Sudoku' : grid ? `Imported ${grid.size} × ${grid.size} Sudoku` : 'Imported puzzle'
  let game: Game = { ...makeGame(createGameId(), title ?? name, givens, 'imported', undefined, grid), collection, sharedPuzzleId,
    ...(whispersGuide && { whispersGuide }), ...(givenCellColors && { givenCellColors }) }
  if (grid && (grid.size !== 4 || sizedRules?.length)) {
    if (!sizedRules) throw new Error('This puzzle is missing its rule list.')
    game.sized = await verifySizedRulePuzzle({ grid, givens, rules: sizedRules, author: sizedAuthor, authoredSolution })
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
  if (progress) {
    game = markSolveUntimed({
      ...game, position: { ...game.position, ...progress },
      started: true, candidatesInitialized: true,
    })
  }
  const preview = { format, ...(progress && { hasProgress: true as const }) }
  game.difficulty = existing?.difficulty
  game.score = existing?.score
  if (existing?.fogRatingVersion !== undefined) game.fogRatingVersion = existing.fogRatingVersion
  if (needsPuzzleGrade(game)) {
    try {
      const grade = existing?.ratingAttempt?.grade ?? await ratePuzzle(givens, game.variant)
      return { ...preview, game: applyPuzzleGrade(game, grade), grade }
    } catch { /* A validated puzzle can still be imported if rating is unavailable. */ }
  }
  return { ...preview, game }
}
