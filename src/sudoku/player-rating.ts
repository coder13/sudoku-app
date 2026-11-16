import { isDifficulty } from './difficulty.ts'
import type { DeductionAction, Difficulty } from './engine.ts'

export const STARTING_PLAYER_RATING = 855

const puzzleRatings: Record<Difficulty, number> = { easy: 800, medium: 860, hard: 920, unfair: 980, extreme: 1040 }
const tiers = Object.keys(puzzleRatings) as Difficulty[]

export function qualifiesForRating(difficulty: Difficulty, recommended: Difficulty): boolean {
  return puzzleRatings[difficulty] >= puzzleRatings[recommended]
}

export type RatingFinish = 'solved' | 'too-hard' | 'solution'
export type RatingEvent = {
  id: string
  gameId: string
  givens: string
  difficulty: Difficulty
  at: number
  finish: RatingFinish
  viewed: number
  applied: number
  elapsed: number
}

export type RatingAttempt = {
  grade: { difficulty: Difficulty; points: number; scoringVersion: number; techniqueOrder: string[] }
  viewed: string[]
  applied: string[]
  priorElapsed: number
  outcome?: RatingEvent
}

type RatedResult = {
  event: RatingEvent
  before: number
  after: number
  recommended: Difficulty
  speedBonus: number
}

export type PlayerRating = {
  rating: number
  recommended: Difficulty
  count: number
  results: ReadonlyMap<string, RatedResult>
}

export const initialPlayerRating: PlayerRating = {
  rating: STARTING_PLAYER_RATING, recommended: 'easy', count: 0, results: new Map(),
}

export function hintKey(actions: readonly DeductionAction[]): string {
  return actions.map((action) => 'place' in action
    ? placementHintKey(action.place.cell, action.place.digit)
    : `e${action.eliminate.cell}:${action.eliminate.digit}`).sort().join(',')
}

export function placementHintKey(cell: number, digit: number | string): string {
  return `p${cell}:${digit}`
}

export function addRatingHints(attempt: RatingAttempt, keys: readonly string[], applied = false): RatingAttempt {
  if (attempt.outcome || keys.length === 0) return attempt
  const viewed = [...new Set([...attempt.viewed, ...keys])]
  const used = applied ? [...new Set([...attempt.applied, ...keys])] : attempt.applied
  return viewed.length === attempt.viewed.length && used.length === attempt.applied.length
    ? attempt : { ...attempt, viewed, applied: used }
}

export function isRatingEvent(data: unknown): data is RatingEvent {
  if (!data || typeof data !== 'object') return false
  const event = data as RatingEvent
  return typeof event.id === 'string' && typeof event.gameId === 'string' && typeof event.givens === 'string' && /^[0-9]{81}$/.test(event.givens) &&
    isDifficulty(event.difficulty) && ['solved', 'too-hard', 'solution'].includes(event.finish) &&
    [event.at, event.viewed, event.applied, event.elapsed].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    event.applied <= event.viewed
}

export function isRatingAttempt(data: unknown): data is RatingAttempt {
  if (!data || typeof data !== 'object') return false
  const { grade, viewed, applied, priorElapsed, outcome } = data as RatingAttempt
  return Boolean(grade && isDifficulty(grade.difficulty) && Number.isSafeInteger(grade.points) && grade.points >= 0 &&
    Number.isSafeInteger(grade.scoringVersion) && grade.scoringVersion > 0 && Array.isArray(grade.techniqueOrder) &&
    grade.techniqueOrder.length > 0 && grade.techniqueOrder.every((id) => typeof id === 'string') &&
    Array.isArray(viewed) && viewed.every((key) => typeof key === 'string') &&
    Array.isArray(applied) && applied.every((key) => typeof key === 'string' && viewed.includes(key)) &&
    Number.isSafeInteger(priorElapsed) && priorElapsed >= 0 &&
    (outcome === undefined || isRatingEvent(outcome)))
}

function expectedCredit(rating: number, difficulty: Difficulty): number {
  return 1 / (1 + Math.exp((puzzleRatings[difficulty] - rating) / 50))
}

function speedBonus(elapsed: number, pastTimes: number[]): number {
  if (pastTimes.length < 3 || elapsed <= 0) return 0
  const sorted = [...pastTimes].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Math.max(0, Math.min(2, 8 * (1 - elapsed / median)))
}

export function calculatePlayerRating(events: Iterable<RatingEvent>): PlayerRating {
  const ordered = [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const results = new Map<string, RatedResult>()
  const seen = new Set<string>()
  const cleanTimes = new Map<Difficulty, number[]>()
  let rating = STARTING_PLAYER_RATING
  let tier = 0
  let recent: number[] = []
  let atTier: number[] = []

  for (const event of ordered) {
    if (seen.has(event.givens)) continue
    seen.add(event.givens)
    const { difficulty, viewed, applied, elapsed } = event
    if (!qualifiesForRating(difficulty, tiers[tier])) continue
    const solved = event.finish === 'solved'
    const credit = solved ? Math.max(25, 100 - 10 * viewed - 15 * applied) / 100 : 0
    const before = rating
    const previousTimes = cleanTimes.get(difficulty) ?? []
    const bonus = credit === 1 ? speedBonus(elapsed, previousTimes) : 0
    if (credit === 1 && elapsed > 0) cleanTimes.set(difficulty, [...previousTimes, elapsed].slice(-5))
    const baseRating = Math.max(700, Math.min(1150, rating + (solved ? 32 : 16) * (credit - expectedCredit(rating, difficulty))))
    rating = Math.min(1150, baseRating + bonus)
    recent = [...recent, credit].slice(-4)
    if (difficulty === tiers[tier]) atTier = [...atTier, credit].slice(-3)

    let nextTier = tier
    if (tier < tiers.length - 1 && expectedCredit(rating, tiers[tier + 1]) >= 0.65 && recent.filter((value) => value >= 0.9).length >= 3) {
      nextTier++
    } else if (tier > 0 && expectedCredit(rating, tiers[tier]) <= 0.58 && atTier.filter((value) => value <= 0.6).length >= 2) {
      nextTier--
    }
    if (nextTier !== tier) {
      tier = nextTier
      recent = []
      atTier = []
    }
    results.set(event.gameId, { event, before, after: rating, recommended: tiers[tier], speedBonus: rating - baseRating })
  }
  return { rating, recommended: tiers[tier], count: results.size, results }
}
