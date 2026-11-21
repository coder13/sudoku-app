import { runEngine } from './engine.ts'
import { solveFogPath } from './fog-solution.ts'
import { isSolved, type Game } from './game.ts'
import { addAnalysisAssistance, ratingAttemptFor, type RatingAttempt } from './player-rating.ts'
import { getVariantPlayOrder, variantPosition } from './variant-play.ts'

export type PuzzleGrade = RatingAttempt['grade']

const FOG_RATING_VERSION = 1

export function needsPuzzleGrade(game: Pick<Game, 'grid' | 'difficulty' | 'score' | 'variant' | 'fogRatingVersion'>) {
  return !game.grid && (game.difficulty === undefined || game.score === undefined ||
    Boolean(game.variant?.fog && game.fogRatingVersion !== FOG_RATING_VERSION))
}

export async function ratePuzzle(givens: string, variant?: Game['variant'], run = runEngine): Promise<PuzzleGrade | null> {
  const rating = variant?.fog ? (await solveFogPath(variant, run, false)).rating
    : variant ? await run({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder: await getVariantPlayOrder() })
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
  const refreshFogRating = game.variant?.fog && game.fogRatingVersion !== FOG_RATING_VERSION
  return {
    ...game, ratingAttempt,
    ...(refreshFogRating && { fogRatingVersion: FOG_RATING_VERSION }),
    difficulty: refreshFogRating || game.difficulty === undefined ? grade?.difficulty ?? null : game.difficulty,
    score: refreshFogRating || game.score === undefined ? grade?.points ?? null : game.score,
  }
}
