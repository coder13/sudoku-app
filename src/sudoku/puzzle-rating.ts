import { runEngine } from './engine.ts'
import { isSolved, type Game } from './game.ts'
import { addAnalysisAssistance, ratingAttemptFor, type RatingAttempt } from './player-rating.ts'
import { getVariantPlayOrder, variantPosition } from './variant-play.ts'

export type PuzzleGrade = RatingAttempt['grade']

export async function ratePuzzle(givens: string, variant?: Game['variant']): Promise<PuzzleGrade | null> {
  const rating = variant
    ? await runEngine({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder: await getVariantPlayOrder() })
    : await runEngine({ type: 'rate', values: givens, techniqueOrder: (await runEngine({ type: 'techniques' })).difficultyOrder })
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
  return {
    ...game, ratingAttempt,
    difficulty: game.difficulty === undefined ? grade?.difficulty ?? null : game.difficulty,
    score: game.score === undefined ? grade?.points ?? null : game.score,
  }
}
