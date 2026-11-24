import { runEngine } from './engine.ts'
import { solveFogPath } from './fog-solution.ts'
import { isSolved, type Game } from './game.ts'
import { addAnalysisAssistance, ratingAttemptFor, type RatingAttempt } from './player-rating.ts'
import { getVariantPlayOrder, variantPosition } from './variant-play.ts'
import { hasBetweenAndPairClues, hasPrintedKropki, isQuadrupleRule } from './variants.ts'

export type PuzzleGrade = RatingAttempt['grade']

const FOG_RATING_VERSION = 1
const FOG_QUADRUPLE_RATING_VERSION = 2
const MATCHING_LAYOUT_RATING_VERSION = 21
const LINKED_CLUE_RATING_VERSION = 17
const KROPKI_HOUSE_RATING_VERSION = 16
const THERMOMETER_RATING_VERSION = 15
const REGION_SUM_LINE_RATING_VERSION = 13
const REGION_SUM_HOUSE_RATING_VERSION = 14
const ENTROPIC_LINE_RATING_VERSION = 12
const RENBAN_AND_LITTLE_KILLER_RATING_VERSION = 11
const QUADRUPLE_RATING_VERSION = 20

type GradedPuzzle = Pick<Game, 'grid' | 'difficulty' | 'score' | 'variant' | 'fogRatingVersion' | 'variantRatingVersion' | 'practiceTechnique'>

function variantRatingVersion(variant: Game['variant']) {
  const rules = variant?.puzzle.rules
  if (rules?.some(rule => rule.type === 'palindrome' || rule.type === 'clone')) return MATCHING_LAYOUT_RATING_VERSION
  if (rules?.some(isQuadrupleRule)) return QUADRUPLE_RATING_VERSION
  if (hasBetweenAndPairClues(rules)) return LINKED_CLUE_RATING_VERSION
  if (hasPrintedKropki(rules)) return KROPKI_HOUSE_RATING_VERSION
  if (rules?.some(rule => rule.type === 'thermometer')) return THERMOMETER_RATING_VERSION
  const regionSumCount = rules?.filter(rule => rule.type === 'region-sum').length ?? 0
  if (regionSumCount >= 2) return REGION_SUM_HOUSE_RATING_VERSION
  if (regionSumCount === 1) return REGION_SUM_LINE_RATING_VERSION
  if (rules?.some(rule => rule.type === 'entropic')) return ENTROPIC_LINE_RATING_VERSION
  if (rules?.some(rule => rule.type === 'little-killer' || rule.type === 'renban' && rule.cells.length >= 2)) {
    return RENBAN_AND_LITTLE_KILLER_RATING_VERSION
  }
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

export async function ratePuzzle(givens: string, variant?: Game['variant'], run = runEngine, allowStalled = false): Promise<PuzzleGrade | null> {
  const rating = variant?.fog ? (await solveFogPath(variant, run, false)).rating
    : variant ? await run({ type: 'variant', operation: 'rate', position: variantPosition(variant), techniqueOrder: await getVariantPlayOrder(variant.puzzle) })
      : await run({ type: 'rate', values: givens, techniqueOrder: (await run({ type: 'techniques' })).difficultyOrder })
  if (rating.status === 'stalled' && !allowStalled) return null
  const points = 'score' in rating ? rating.score.points : rating.points
  const hardest = 'score' in rating ? rating.score.hardest : rating.hardest
  const difficulty = rating.status === 'stalled'
    ? (await run({ type: 'techniques', variant: Boolean(variant) })).techniques.find(technique => technique.id === hardest)?.difficulty ?? 'beginner'
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
