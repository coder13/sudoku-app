import { runEngine } from './engine.ts'
import { solveFogPath } from './fog-solution.ts'
import { isSolved, type Game } from './game.ts'
import { addAnalysisAssistance, ratingAttemptFor, type RatingAttempt } from './player-rating.ts'
import { getVariantPlayOrder, variantPosition } from './variant-play.ts'

export type PuzzleGrade = RatingAttempt['grade']

const FOG_RATING_VERSION = 1
const ENTROPY_QUADRUPLE_RATING_VERSION = 10
const RENBAN_AND_LITTLE_KILLER_RATING_VERSION = 11

type GradedPuzzle = Pick<Game, 'grid' | 'difficulty' | 'score' | 'variant' | 'fogRatingVersion' | 'variantRatingVersion'>

function variantRatingVersion(variant: Game['variant']) {
  const rules = variant?.puzzle.rules
  if (rules?.some(rule => rule.type === 'little-killer' || rule.type === 'renban' && rule.cells.length >= 2)) {
    return RENBAN_AND_LITTLE_KILLER_RATING_VERSION
  }
  if (rules?.some(rule => rule.type === 'global-entropy') && rules.some(rule => rule.type === 'quadruple')) {
    return ENTROPY_QUADRUPLE_RATING_VERSION
  }
}

export function puzzleGradeIsStale(game: GradedPuzzle) {
  const version = variantRatingVersion(game.variant)
  return Boolean(game.variant?.fog && game.fogRatingVersion !== FOG_RATING_VERSION) ||
    version !== undefined && game.variantRatingVersion !== version
}

export function needsPuzzleGrade(game: GradedPuzzle) {
  return !game.grid && (game.difficulty === undefined || game.score === undefined || puzzleGradeIsStale(game))
}

export async function ratePuzzle(givens: string, variant?: Game['variant'], run = runEngine): Promise<PuzzleGrade | null> {
  const rating = variant?.fog ? (await solveFogPath(variant, run, false)).rating
    : variant ? await run({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder: await getVariantPlayOrder(variant.puzzle) })
      : await run({ type: 'rate', values: givens, techniqueOrder: (await run({ type: 'techniques' })).difficultyOrder })
  if (rating.status === 'stalled') return null
  return {
    difficulty: rating.status.solved, points: 'score' in rating ? rating.score.points : rating.points,
    scoringVersion: rating.scoringVersion, techniqueOrder: rating.techniqueOrder,
  }
}

export function applyPuzzleGrade(game: Game, grade: PuzzleGrade | null): Game {
  let ratingAttempt = game.ratingAttempt
  if (grade && !ratingAttempt && !isSolved(game)) {
    ratingAttempt = ratingAttemptFor(grade, game.generatedWithAuto ? undefined : 'fixed')
    if (game.analysisUsed) ratingAttempt = addAnalysisAssistance(ratingAttempt)
  }
  const stale = puzzleGradeIsStale(game)
  const version = variantRatingVersion(game.variant)
  return {
    ...game, ratingAttempt,
    ...(game.variant?.fog && { fogRatingVersion: FOG_RATING_VERSION }),
    ...(version !== undefined && { variantRatingVersion: version }),
    difficulty: stale || game.difficulty === undefined ? grade?.difficulty ?? null : game.difficulty,
    score: stale || game.score === undefined ? grade?.points ?? null : game.score,
  }
}
