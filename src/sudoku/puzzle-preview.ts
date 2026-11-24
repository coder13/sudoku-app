import { createEngineSession, runEngine, type Analysis, type EngineRunner } from './engine.ts'
import { sameCandidateColors, sameImportedCellColors } from './imported-colors.ts'
import { sameImportedDrawings } from './imported-drawings.ts'
import { sameAuthoredArtwork } from './authored-artwork.ts'
import { rateAlgebraicPuzzle, verifyAlgebraicPuzzle } from './algebraic-game.ts'
import { createGameId, hasUniquenessProof, makeGame, markSolveUntimed, puzzleIdentity, uniquenessKey, type Game } from './game.ts'
import { verifySizedRulePuzzle } from './sized-rule-game.ts'
import { analyzeMini } from './mini-play.ts'
import { detectPuzzle, importSharedPuzzle, type ImportedPuzzle } from './puzzle-import.ts'
import { findSharedAttempt } from './puzzle-sharing.ts'
import { applyPuzzleGrade, needsPuzzleGrade, puzzleGradeIsStale, ratePuzzle, type PuzzleGrade } from './puzzle-rating.ts'
import { validation } from './puzzle-validation.ts'
import { FIVE_JIGSAW_NAME, SEVEN_BOXLESS_NAME } from './new-puzzle.ts'
import { variantName } from './variants.ts'

// Imports can be much sparser than generated puzzles. Give the worker one
// bounded uniqueness attempt so it can finish without restarting the search.
const IMPORT_VARIANT_SEARCH_NODES = 2_000_000

export type PuzzlePreview = {
  game: Game
  format: ImportedPuzzle['format'] | 'Photo or screenshot'
  grade?: PuzzleGrade | null
  ratingPending?: true
  hasProgress?: true
  startFresh?: true
}

export type PhotoProgress = { entries: string; candidates?: readonly number[] }

export function findImportedPuzzle(games: readonly Game[], imported: Pick<ImportedPuzzle, 'givens' | 'variant' | 'algebraic' | 'grid' | 'sizedRules' | 'givenCellColors' | 'authoredArtwork'>) {
  const identity = puzzleIdentity(imported)
  return games.find(game => game.source !== 'draft' && puzzleIdentity(game) === identity &&
    sameImportedCellColors(game.givenCellColors, imported.givenCellColors) &&
    sameAuthoredArtwork(game.authoredArtwork, imported.authoredArtwork))
}

export function findImportAttempt(games: readonly Game[], { game, hasProgress, startFresh }: PuzzlePreview): Game | undefined {
  if (game.sharedPuzzleId) return findSharedAttempt(games, game.sharedPuzzleId)
  const attempts = game.whispersGuide ? games.filter(saved => saved.whispersGuide) : games
  if (!hasProgress && !startFresh) return findImportedPuzzle(attempts, game)
  const { entries, center, corner, colors, importedCellColors, candidateColors, importedCandidateColors, importedDrawings } = game.position
  const identity = puzzleIdentity(game)
  return attempts.find(saved => saved.source !== 'draft' && (!startFresh || !saved.started) && saved.position.entries === entries &&
    center.every((mask, cell) => mask === saved.position.center[cell]) &&
    corner.every((mask, cell) => mask === saved.position.corner[cell]) &&
    colors.every((color, cell) => color === saved.position.colors[cell]) &&
    sameImportedCellColors(importedCellColors, saved.position.importedCellColors) &&
    sameCandidateColors(candidateColors, saved.position.candidateColors) &&
    sameCandidateColors(importedCandidateColors, saved.position.importedCandidateColors) &&
    sameImportedDrawings(importedDrawings, saved.position.importedDrawings) &&
    sameImportedCellColors(game.givenCellColors, saved.givenCellColors) &&
    sameAuthoredArtwork(game.authoredArtwork, saved.authoredArtwork) &&
    puzzleIdentity(saved) === identity)
}

/** Decode and verify the complete puzzle before the app offers to save or play it. */
export async function prepareImportedPuzzle(input: string, games: readonly Game[] = [], {
  deferRating = false, onDecoded, signal, photoProgress,
}: { deferRating?: boolean; onDecoded?: (puzzle: ImportedPuzzle) => void; signal?: AbortSignal; photoProgress?: PhotoProgress } = {}): Promise<PuzzlePreview> {
  const imported = await detectPuzzle(input)
  return prepareDetectedPuzzle(imported, games, { deferRating, onDecoded, signal, photoProgress })
}

/** Verify a puzzle that has already been decoded by the import pipeline. */
export async function prepareDetectedPuzzle(imported: ImportedPuzzle, games: readonly Game[] = [], {
  deferRating = false, onDecoded, signal, photoProgress,
}: { deferRating?: boolean; onDecoded?: (puzzle: ImportedPuzzle) => void; signal?: AbortSignal; photoProgress?: PhotoProgress } = {}): Promise<PuzzlePreview> {
  signal?.throwIfAborted()
  if (imported.format === 'Text grid' && !imported.grid && photoProgress) {
    const entries = [...imported.givens].map((clue, cell) => clue === '0' ? photoProgress.entries[cell] ?? '0' : '0').join('')
    const corner = [...imported.givens].map((clue, cell) =>
      clue === '0' && entries[cell] === '0' ? photoProgress.candidates?.[cell] ?? 0 : 0)
    if (/[1-9]/.test(entries) || corner.some(Boolean)) {
      imported.progress = { entries, center: corner.map(() => 0), corner }
    }
  }
  // The 9 × 9 board can show its complete layout before it receives a proof.
  if (!imported.grid) onDecoded?.(imported)
  return verifyPreview(imported, games, signal, deferRating)
}

export async function prepareSharedPuzzle(id: string, games: readonly Game[], signal: AbortSignal): Promise<PuzzlePreview> {
  const existing = findSharedAttempt(games, id)
  if (existing) return { game: existing, format: 'Puzzle link' }
  const imported = await importSharedPuzzle(id, signal)
  return verifyPreview(imported, games, signal)
}

async function verifyPreview(imported: ImportedPuzzle, games: readonly Game[], signal?: AbortSignal, deferRating = false) {
  signal?.throwIfAborted()
  const engine = signal && createEngineSession()
  const cancel = () => engine?.close()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const preview = await preparePuzzlePreview(imported, games, deferRating, engine?.run)
    signal?.throwIfAborted()
    return preview
  } finally {
    signal?.removeEventListener('abort', cancel)
    engine?.close()
  }
}

export class PuzzleVerificationError extends Error {
  readonly status: Exclude<Analysis, 'unique'>

  constructor(status: Exclude<Analysis, 'unique'>) {
    super(status === 'conflict' ? 'This puzzle has conflicting givens or rules.' : validation[status].text)
    this.status = status
  }
}

async function preparePuzzlePreview(imported: ImportedPuzzle, games: readonly Game[], deferRating: boolean, run: EngineRunner = runEngine): Promise<PuzzlePreview> {
  const { givens, variant, format, title, collection, sharedPuzzleId, grid, algebraic, sizedRules, sizedAuthor,
    authoredSolution, progress, whispersGuide, givenCellColors, authoredArtwork } = imported
  const existing = findImportedPuzzle(games, imported)
  const name = algebraic ? (algebraic.source?.title.trim().slice(0, 72) || 'Imported Algebraic Cages')
    : variant?.id === 'mixed' && !variant.fog ? 'Imported mixed-rule puzzle'
    : variant ? `Imported ${variantName(variant)} puzzle`
      : grid && 'noRegions' in grid ? `Imported ${SEVEN_BOXLESS_NAME}`
        : grid?.size === 5 ? `Imported ${FIVE_JIGSAW_NAME}`
        : grid?.size === 4 ? 'Imported Mini Sudoku' : grid ? `Imported ${grid.size} × ${grid.size} Sudoku` : 'Imported puzzle'
  let game: Game = { ...makeGame(createGameId(), title ?? name, givens, 'imported', undefined, grid), collection, sharedPuzzleId,
    ...(whispersGuide && { whispersGuide }), ...(givenCellColors && { givenCellColors }), ...(authoredArtwork && { authoredArtwork }) }
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
    if (existing?.variant && hasUniquenessProof(existing)) {
      game.variant = { ...variant, solution: existing.variant.solution }
    } else {
      const result = await run({ type: 'variant', operation: 'solve-unique', position, maxNodes: IMPORT_VARIANT_SEARCH_NODES })
      if (result.status === 'unique') game.variant = { ...variant, solution: result.solution }
      else if (result.status === 'multiple') {
        game.nonUnique = true
        game.variant = { ...variant, solution: await run({ type: 'variant', operation: 'solve', position }) }
      } else throw new PuzzleVerificationError(result.status)
    }
  } else if (!existing || !grid && !hasUniquenessProof(existing)) {
    const status = grid ? await analyzeMini(givens) : await run({ type: 'analyze', values: givens })
    if (status === 'multiple') game.nonUnique = true
    else if (status !== 'unique') throw new PuzzleVerificationError(status)
  }
  if (grid) return { game: applyPuzzleGrade(game, null), format, grade: null }
  if (!game.nonUnique) game.uniquenessProof = uniquenessKey(game)
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
  if (existing?.variantRatingVersion !== undefined) game.variantRatingVersion = existing.variantRatingVersion
  if (needsPuzzleGrade(game)) {
    const savedGrade = puzzleGradeIsStale(game) ? undefined : existing?.ratingAttempt?.grade
    if (savedGrade) return { ...preview, game: applyPuzzleGrade(game, savedGrade), grade: savedGrade }
    if (deferRating) return { ...preview, game, ratingPending: true }
    try {
      const grade = await ratePuzzle(givens, game.variant, run, game.nonUnique)
      return { ...preview, game: applyPuzzleGrade(game, grade), grade }
    } catch { /* A validated puzzle can still be imported if rating is unavailable. */ }
  }
  return { ...preview, game }
}
