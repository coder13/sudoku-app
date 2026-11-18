import { isDifficulty, currentDifficulty, DIFFICULTY_LEVELS } from './difficulty.ts'
import type { DeductionAction, Difficulty } from './engine.ts'

export const STARTING_PLAYER_RATING = 855
export const PLAYER_RATING_VERSION = 3

type RatingVersion = 2 | typeof PLAYER_RATING_VERSION
export type AutoFeedback = 'too-easy' | 'too-hard'
export type AutoPlacement = {
  difficulty: Difficulty
  at: number
  feedback?: { gameId: string; choice: AutoFeedback }
}

const puzzleRatings: Record<Difficulty, number> = { beginner: 760, easy: 800, medium: 860, tricky: 890, hard: 920, 'very-hard': 950, expert: 980, master: 1010, extreme: 1040, impossible: 1100, unfair: 980 }
const legacyTiers: readonly Difficulty[] = ['easy', 'medium', 'hard', 'unfair', 'extreme']
const fastSolveSeconds: Record<Difficulty, number> = { beginner: 90, easy: 120, medium: 180, tricky: 240, hard: 300, 'very-hard': 420, expert: 480, master: 600, extreme: 720, impossible: 1200, unfair: 480 }
const EARLY_RESULTS = 4
const AUTO_PROMOTION_WINDOW = 8
const AUTO_PROMOTION_SOLVES = 6

export type RatingFinish = 'solved' | 'hints' | 'too-hard' | 'solution'
type RatingMode = 'fixed' | 'placement'
type SinglesAssistance = 'partial' | 'all'
export type RatingEvent = {
  id: string
  gameId: string
  givens: string
  puzzleKey?: string
  ratingVersion?: RatingVersion
  difficulty: Difficulty
  at: number
  finish: RatingFinish
  viewed: number
  applied: number
  hintsRequested?: number
  hintsOpened?: number
  analysisUsed?: true
  singlesAssistance?: SinglesAssistance
  elapsed: number
  mode?: RatingMode
  estimated?: true
}

export type RatingAttempt = {
  grade: { difficulty: Difficulty; points: number; scoringVersion: number; techniqueOrder: string[] }
  viewed: string[]
  applied: string[]
  requested?: string[]
  openedHints?: string[]
  analysisUsed?: true
  singlesAssistance?: SinglesAssistance
  priorElapsed: number
  timeUntracked?: true
  lastHintAt?: number
  ratingVersion?: RatingVersion
  mode?: RatingMode
  outcome?: RatingEvent
}

type RatedResult = {
  event: RatingEvent
  before: number
  after: number
  recommended: Difficulty
  speedBonus: number
  fixedCalibration?: true
}

export type PlayerRating = {
  rating: number
  recommended: Difficulty
  count: number
  results: ReadonlyMap<string, RatedResult>
  feedback: ReadonlyMap<string, AutoFeedback>
}

export const initialPlayerRating: PlayerRating = {
  rating: STARTING_PLAYER_RATING, recommended: 'medium', count: 0, results: new Map(), feedback: new Map(),
}

export function difficultyAfterFeedback(
  played: Difficulty, recommended: Difficulty, choice: AutoFeedback, levels: readonly Difficulty[] = DIFFICULTY_LEVELS,
): Difficulty {
  const playedTier = levels.indexOf(played)
  const nextTier = levels.indexOf(recommended)
  if (playedTier < 0 || nextTier < 0) return recommended
  if (choice === 'too-easy' && nextTier <= playedTier) return levels[Math.min(levels.length - 1, nextTier + 1)]
  if (choice === 'too-hard' && nextTier >= playedTier) return levels[Math.max(0, nextTier - 1)]
  return recommended
}

export function ratingAttemptFor(grade: RatingAttempt['grade'], mode?: RatingMode): RatingAttempt {
  return { grade, viewed: [], applied: [], requested: [], priorElapsed: 0, ratingVersion: PLAYER_RATING_VERSION, mode }
}

export function hintKey(actions: readonly DeductionAction[]): string {
  return actions.map((action) => 'place' in action
    ? placementHintKey(action.place.cell, action.place.digit)
    : `e${action.eliminate.cell}:${action.eliminate.digit}`).sort().join(',')
}

export function placementHintKey(cell: number, digit: number | string): string {
  return `p${cell}:${digit}`
}

export function addRatingHints(attempt: RatingAttempt, keys: readonly string[], applied = false,
  request?: { at: number; position: string; openingId?: string }): RatingAttempt {
  if (attempt.outcome || keys.length === 0) return attempt
  const viewed = [...new Set([...attempt.viewed, ...keys])]
  const used = applied ? [...new Set([...attempt.applied, ...keys])] : attempt.applied
  const requested = request ? [...new Set([...(attempt.requested ?? []), request.position])] : attempt.requested
  const previousOpenings = attempt.openedHints ?? attempt.requested ?? []
  const openingId = request?.openingId
  const openedHints = openingId && attempt.mode === undefined
    ? [...new Set([...previousOpenings, openingId])] : attempt.openedHints
  const newRequest = (requested?.length ?? 0) > (attempt.requested?.length ?? 0)
  const newOpening = (openedHints?.length ?? 0) > previousOpenings.length
  if (viewed.length === attempt.viewed.length && used.length === attempt.applied.length && !newRequest && !newOpening) return attempt
  return {
    ...attempt, viewed, applied: used, requested, openedHints,
    ...((newRequest || newOpening) && request ? { lastHintAt: request.at, ratingVersion: PLAYER_RATING_VERSION } : {}),
  }
}

export function addAnalysisAssistance(attempt: RatingAttempt, at?: number): RatingAttempt {
  if (attempt.outcome) return attempt
  if (at !== undefined && attempt.mode === undefined &&
    (!attempt.analysisUsed || attempt.lastHintAt === undefined || attempt.ratingVersion !== PLAYER_RATING_VERSION)) {
    return { ...attempt, analysisUsed: true, lastHintAt: at, ratingVersion: PLAYER_RATING_VERSION }
  }
  return attempt.analysisUsed ? attempt : { ...attempt, analysisUsed: true }
}

export function addSinglesAssistance(attempt: RatingAttempt, assistance: SinglesAssistance): RatingAttempt {
  if (attempt.outcome || attempt.singlesAssistance === 'all' || attempt.singlesAssistance === assistance) return attempt
  return { ...attempt, singlesAssistance: assistance }
}

function validSinglesAssistance(value: unknown): boolean {
  return value === undefined || value === 'partial' || value === 'all'
}

export function isRatingEvent(data: unknown): data is RatingEvent {
  if (!data || typeof data !== 'object') return false
  const event = data as RatingEvent
  return typeof event.id === 'string' && typeof event.gameId === 'string' && typeof event.givens === 'string' && /^[0-9]{81}$/.test(event.givens) &&
    (event.puzzleKey === undefined || typeof event.puzzleKey === 'string' && event.puzzleKey.length > 0 && event.puzzleKey.length <= 20_000) &&
    validRatingVersion(event.ratingVersion) &&
    (event.estimated === undefined || event.estimated === true && event.finish === 'solved') &&
    isDifficulty(event.difficulty) && ['solved', 'hints', 'too-hard', 'solution'].includes(event.finish) &&
    validRatingMode(event.mode, event.difficulty) &&
    [event.at, event.viewed, event.applied, event.elapsed].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    (event.hintsRequested === undefined || Number.isSafeInteger(event.hintsRequested) && event.hintsRequested >= 0) &&
    (event.hintsOpened === undefined || Number.isSafeInteger(event.hintsOpened) && event.hintsOpened >= 0) &&
    (event.analysisUsed === undefined || event.analysisUsed === true) &&
    validSinglesAssistance(event.singlesAssistance) &&
    event.applied <= event.viewed
}

export function isRatingAttempt(data: unknown): data is RatingAttempt {
  if (!data || typeof data !== 'object') return false
  const { grade, viewed, applied, requested, openedHints, analysisUsed, singlesAssistance, priorElapsed, timeUntracked, lastHintAt, ratingVersion, outcome, mode } = data as RatingAttempt
  return Boolean(grade && isDifficulty(grade.difficulty) && Number.isSafeInteger(grade.points) && grade.points >= 0 &&
    Number.isSafeInteger(grade.scoringVersion) && grade.scoringVersion > 0 && Array.isArray(grade.techniqueOrder) &&
    grade.techniqueOrder.length > 0 && grade.techniqueOrder.every((id) => typeof id === 'string') &&
    Array.isArray(viewed) && viewed.every((key) => typeof key === 'string') &&
    Array.isArray(applied) && applied.every((key) => typeof key === 'string' && viewed.includes(key)) &&
    (requested === undefined || Array.isArray(requested) && requested.every((key) => typeof key === 'string' && key.length <= 512)) &&
    (openedHints === undefined || Array.isArray(openedHints) && openedHints.every((key) => typeof key === 'string' && key.length <= 512)) &&
    (analysisUsed === undefined || analysisUsed === true) &&
    validSinglesAssistance(singlesAssistance) &&
    (lastHintAt === undefined || Number.isSafeInteger(lastHintAt) && lastHintAt >= 0) &&
    validRatingVersion(ratingVersion) &&
    Number.isSafeInteger(priorElapsed) && priorElapsed >= 0 &&
    (timeUntracked === undefined || timeUntracked === true) &&
    validRatingMode(mode, grade.difficulty) &&
    (outcome === undefined || (isRatingEvent(outcome) && outcome.mode === mode)))
}

function validRatingVersion(version: unknown) {
  return version === undefined || version === 2 || version === PLAYER_RATING_VERSION
}

function validRatingMode(mode: unknown, difficulty: Difficulty) {
  return mode === undefined || mode === 'fixed' || (mode === 'placement' && difficulty === 'hard')
}

function expectedCredit(rating: number, difficulty: Difficulty): number {
  return 1 / (1 + Math.exp((puzzleRatings[difficulty] - rating) / 50))
}

function startingRatingFor(difficulty: Difficulty): number {
  // Approximately 65% expected credit at the first puzzle in a new tier.
  return puzzleRatings[difficulty] + 31
}

function speedBonus(elapsed: number, pastTimes: number[]): number {
  if (pastTimes.length < 3 || elapsed <= 0) return 0
  const sorted = [...pastTimes].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Math.max(0, Math.min(2, 8 * (1 - elapsed / median)))
}

export function calculatePlayerRating(events: Iterable<RatingEvent>, placements: Iterable<AutoPlacement> = []): PlayerRating {
  // Production outcomes predate versioned events. Replay them on the ladder that
  // earned their ratings, then carry the same state into the ten-tier ladder.
  const legacy: RatingEvent[] = []
  const current: RatingEvent[] = []
  for (const event of events) {
    const bucket = event.ratingVersion === undefined && legacyTiers.includes(event.difficulty) ? legacy : current
    bucket.push(event)
  }
  const byTime = (a: RatingEvent, b: RatingEvent) => a.at - b.at || a.id.localeCompare(b.id)
  const ordered = [...legacy.sort(byTime), ...current.sort(byTime)]
  const placementsByTime = [...placements].sort((a, b) => a.at - b.at)
  const feedback = new Map<string, AutoFeedback>()
  const results = new Map<string, RatedResult>()
  const seen = new Set<string>()
  const cleanTimes = new Map<Difficulty, number[]>()
  let struggled = new Set<number>()
  let tiers = legacyTiers
  let rating = STARTING_PLAYER_RATING
  let tier = tiers.indexOf(initialPlayerRating.recommended)
  let observed = 0
  let recent: number[] = []
  let recentUnaided: boolean[] = []
  let fixedEvidence: (number | undefined)[] = []
  let atTier: number[] = []
  let nextPlacement = 0

  function applyPlacement(placement: AutoPlacement) {
    tier = DIFFICULTY_LEVELS.indexOf(currentDifficulty(placement.difficulty))
    recent = []
    recentUnaided = []
    atTier = []
    fixedEvidence = []
    struggled.clear()
    if (placement.feedback) feedback.set(placement.feedback.gameId, placement.feedback.choice)
  }

  for (const [index, event] of ordered.entries()) {
    if (index === legacy.length) {
      const currentTier = (legacyTier: number) => DIFFICULTY_LEVELS.indexOf(currentDifficulty(legacyTiers[legacyTier]))
      tier = currentTier(tier)
      fixedEvidence = fixedEvidence.map(value => value === undefined ? undefined : currentTier(value))
      struggled = new Set([...struggled].map(currentTier))
      tiers = DIFFICULTY_LEVELS
    }
    if (index >= legacy.length) {
      while (nextPlacement < placementsByTime.length && placementsByTime[nextPlacement].at < event.at) {
        applyPlacement(placementsByTime[nextPlacement++])
      }
    }
    const key = event.puzzleKey ?? event.givens
    if (seen.has(key)) continue
    seen.add(key)
    const { difficulty, elapsed } = event
    const playedTier = tiers.indexOf(tiers === legacyTiers ? difficulty : currentDifficulty(difficulty))
    const solved = event.finish === 'solved'
    if (event.estimated) {
      // Completion alone carries less weight and has no timing or hint evidence.
      rating = Math.max(700, Math.min(1150, rating + 8 * (.75 - expectedCredit(rating, difficulty))))
      continue
    }
    // Older saves recorded automatic placements as both viewed and applied hints.
    const legacySingles = event.hintsRequested === 0 && event.applied > 0 && event.viewed === event.applied
    const singlesAssistance = event.singlesAssistance ?? (legacySingles
      ? event.applied >= event.givens.split('0').length - 1 ? 'all' : 'partial'
      : undefined)
    const viewed = legacySingles ? 0 : event.viewed
    const applied = legacySingles ? 0 : event.applied
    const onlySingles = singlesAssistance === 'all'
    const analysisUsed = event.analysisUsed === true
    const gradual = event.ratingVersion === PLAYER_RATING_VERSION
    const skipEasy = Boolean(!gradual && singlesAssistance && event.mode === undefined && (difficulty === 'beginner' || difficulty === 'easy'))
    if (!analysisUsed && solved && viewed === 0 && (onlySingles || skipEasy)) {
      if (skipEasy && tier === playedTier) {
        tier = tiers.indexOf('medium')
        recent = []
        recentUnaided = []
        atTier = []
      }
      results.set(event.gameId, { event, before: rating, after: rating, recommended: currentDifficulty(tiers[tier]), speedBonus: 0 })
      continue
    }
    const hintRequests = event.hintsRequested ?? viewed
    const strongerAssistance = gradual && event.mode === undefined
    const hintOpens = Math.max(hintRequests, event.hintsOpened ?? 0)
    const repeatedHelp = strongerAssistance && hintOpens >= 2
    const assistancePenalty = strongerAssistance
      ? Math.min(16, 4 * Math.max(0, hintOpens - 1)) + (analysisUsed ? 8 : 0)
      : 0
    const affectsCalibration = !analysisUsed || strongerAssistance && hintRequests >= 2
    const early = (affectsCalibration || strongerAssistance) && observed < EARLY_RESULTS
    if (affectsCalibration) observed++
    const credit = solved ? Math.max(25, 100 - 10 * viewed - 15 * applied) / 100 : event.finish === 'hints' ? 0.4 : 0
    const before = rating
    const previousTimes = cleanTimes.get(difficulty) ?? []
    const unaided = !analysisUsed && !repeatedHelp && credit === 1 && singlesAssistance === undefined
    const bonus = unaided ? speedBonus(elapsed, previousTimes) : 0
    if (unaided && elapsed > 0) cleanTimes.set(difficulty, [...previousTimes, elapsed].slice(-5))
    const weight = (solved ? early ? 48 : 32 : 16) * (playedTier < tier ? .35 : 1) * (analysisUsed && !strongerAssistance ? .25 : 1)
    const difference = credit - expectedCredit(rating, difficulty)
    const adjustment = !analysisUsed && solved && !onlySingles && !repeatedHelp ? difference : Math.min(0, difference)
    const baseRating = Math.max(700, Math.min(1150, rating + weight * adjustment - assistancePenalty))
    rating = Math.min(1150, baseRating + bonus)
    if (gradual && playedTier >= tier) recentUnaided = [...recentUnaided, unaided].slice(-AUTO_PROMOTION_WINDOW)
    if (!affectsCalibration) {
      // A technique scan by itself does not calibrate the next difficulty.
      results.set(event.gameId, { event, before, after: rating, recommended: currentDifficulty(tiers[tier]), speedBonus: 0 })
      continue
    }
    const fixedTier = event.mode === 'fixed' && unaided ? playedTier : undefined
    fixedEvidence = [...fixedEvidence, fixedTier].slice(-4)
    if (playedTier >= tier) recent = [...recent, repeatedHelp ? 0 : credit].slice(-4)
    const struggling = hintRequests >= 2 || event.finish === 'too-hard'
    if (struggling) struggled.add(playedTier)
    else if (credit === 1) struggled.delete(playedTier)
    if (playedTier === tier) atTier = [...atTier, struggling ? 0 : credit].slice(-3)

    let nextTier = tier
    const demonstratedTier = fixedTier !== undefined && fixedTier > tier
      ? fixedEvidence.filter((value) => value !== undefined).sort((a, b) => b - a)[1]
      : undefined
    const fixedCalibration = demonstratedTier !== undefined && demonstratedTier > tier
    const fastSolve = unaided && elapsed > 0 && elapsed <= fastSolveSeconds[difficulty]
    const solvedBeyondSingles = !analysisUsed && !repeatedHelp && credit === 1 && singlesAssistance === 'partial' && event.mode === undefined && playedTier > 0
    const promotionEvidence = gradual
      ? unaided && playedTier >= tier && recentUnaided.length === AUTO_PROMOTION_WINDOW &&
        recentUnaided.filter(Boolean).length >= AUTO_PROMOTION_SOLVES
      : recent.filter(value => value >= 0.9).length >= 3
    if (!gradual && fixedCalibration) {
      nextTier = early ? demonstratedTier : tier + 1
    } else if (!gradual && early && (fastSolve || solvedBeyondSingles) && playedTier >= tier - 1) {
      nextTier = Math.min(tiers.length - 1, tier + 2, Math.max(tier, playedTier + ((difficulty === 'beginner' || difficulty === 'easy') ? 2 : 1)))
      for (const challengedTier of struggled) {
        if (challengedTier > playedTier && challengedTier >= tier) nextTier = Math.min(nextTier, challengedTier)
      }
    } else if (!gradual && early && tier > 0 && playedTier === tier && struggling) {
      nextTier--
    } else if (promotionEvidence && tier < tiers.length - 1 && expectedCredit(rating, tiers[tier + 1]) >= 0.65) {
      nextTier++
    } else if (tier > 0 && atTier.filter((value) => value === 0).length >= 2) {
      nextTier--
      fixedEvidence = []
    }
    if (nextTier !== tier) {
      if (nextTier > tier) rating = Math.max(rating, startingRatingFor(tiers[nextTier]))
      tier = nextTier
      recent = []
      recentUnaided = []
      atTier = []
    }
    const result: RatedResult = { event, before, after: rating, recommended: currentDifficulty(tiers[tier]), speedBonus: Math.min(bonus, 1150 - baseRating) }
    if (!gradual && fixedCalibration) result.fixedCalibration = true
    results.set(event.gameId, result)
  }
  if (nextPlacement < placementsByTime.length) {
    tiers = DIFFICULTY_LEVELS
    for (const placement of placementsByTime.slice(nextPlacement)) applyPlacement(placement)
  }
  return { rating, recommended: currentDifficulty(tiers[tier]), count: seen.size, results, feedback }
}
