import { runEngine } from './engine.ts'
import { solveFogPath } from './fog-solution.ts'
import { isSolved, type Game } from './game.ts'
import { addAnalysisAssistance, ratingAttemptFor, type RatingAttempt } from './player-rating.ts'
import { getVariantPlayOrder, variantPosition } from './variant-play.ts'
import { isQuadrupleRule } from './variants.ts'

export type PuzzleGrade = RatingAttempt['grade']

const FOG_RATING_VERSION = 1
const FOG_QUADRUPLE_RATING_VERSION = 2
const VARIANT_RATING_VERSION = 22
const CHESS_VARIANT_RATING_VERSION = 23
const EXTENDED_VARIANT_RATING_VERSION = 24

type GradedPuzzle = Pick<Game, 'grid' | 'difficulty' | 'score' | 'variant' | 'fogRatingVersion' | 'variantRatingVersion' | 'practiceTechnique'>

function variantRatingVersion(variant: Game['variant']) {
  if (!variant) return
  if (variant.puzzle.logicVersion) return variant.puzzle.logicVersion
  if (variant.puzzle.extendedLogic) return EXTENDED_VARIANT_RATING_VERSION
  return variant.puzzle.rules?.some(rule => rule.type === 'anti-knight' || rule.type === 'anti-king')
    ? CHESS_VARIANT_RATING_VERSION : VARIANT_RATING_VERSION
}

function fogRatingVersion(variant: Game['variant']) {
  if (!variant?.fog) return
  return variant.puzzle.rules?.some(isQuadrupleRule) ? FOG_QUADRUPLE_RATING_VERSION : FOG_RATING_VERSION
}

export function puzzleGradeIsStale(game: GradedPuzzle) {
  if (game.practiceTechnique) return false
  const version = variantRatingVersion(game.variant)
  const fogVersion = fogRatingVersion(game.variant)
  return fogVersion !== undefined && game.fogRatingVersion !== fogVersion ||
    version !== undefined && game.variantRatingVersion !== version
}

export function needsPuzzleGrade(game: GradedPuzzle) {
  return !game.grid && (game.difficulty === undefined || game.score === undefined || puzzleGradeIsStale(game))
}

export async function ratePuzzle(
  givens: string,
  variant?: Game['variant'],
  run = runEngine,
  allowStalled = false,
  verifiedUniqueVariant = false,
): Promise<PuzzleGrade | null> {
  const rating = variant?.fog ? (await solveFogPath(variant, run, false)).rating
    : variant ? await run({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder: await getVariantPlayOrder(variant.puzzle) })
      : await run({ type: 'rate', values: givens, techniqueOrder: (await run({ type: 'techniques' })).difficultyOrder })
  // A unique completion can finish a Fog puzzle without proving that the
  // visible rules let a player reach it.
  const canGradeStall = verifiedUniqueVariant && !variant?.fog
  if (rating.status === 'stalled' && !allowStalled && !canGradeStall) return null
  const points = 'score' in rating ? rating.score.points : rating.points
  const hardest = 'score' in rating ? rating.score.hardest : rating.hardest
  const difficulty = rating.status === 'stalled'
    ? canGradeStall ? 'impossible'
      : (await run({ type: 'techniques', variant: Boolean(variant) })).techniques.find(technique => technique.id === hardest)?.difficulty ?? 'beginner'
    : rating.status.solved
  return {
    difficulty, points,
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
  const fogVersion = fogRatingVersion(game.variant)
  return {
    ...game, ratingAttempt,
    ...(fogVersion !== undefined && { fogRatingVersion: fogVersion }),
    ...(version !== undefined && { variantRatingVersion: version }),
    difficulty: stale || game.difficulty === undefined ? grade?.difficulty ?? null : game.difficulty,
    score: stale || game.score === undefined ? grade?.points ?? null : game.score,
  }
}
