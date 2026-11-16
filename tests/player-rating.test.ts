import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculatePlayerRating, STARTING_PLAYER_RATING, type RatingEvent } from '../src/sudoku/player-rating.ts'

function outcome(index: number, settings: Partial<RatingEvent> = {}): RatingEvent {
  return {
    id: `outcome-${index}`, gameId: `puzzle-${index}`, givens: String(index).padStart(81, '0'),
    at: index, difficulty: 'easy', finish: 'solved', elapsed: 0, viewed: 0, applied: 0, ...settings,
  }
}

test('the initial rating gives harder solves more credit and hints reduce that credit', () => {
  assert.equal(calculatePlayerRating([]).rating, STARTING_PLAYER_RATING)
  assert.equal(calculatePlayerRating([]).recommended, 'easy')
  const clean = calculatePlayerRating([outcome(1)]).rating
  assert.ok(calculatePlayerRating([outcome(1, { difficulty: 'hard' })]).rating > clean)
  const viewed = calculatePlayerRating([outcome(1, { viewed: 1 })]).rating
  assert.ok(clean > viewed && viewed > STARTING_PLAYER_RATING)
  assert.ok(calculatePlayerRating([outcome(1, { viewed: 2, applied: 2 })]).rating < STARTING_PLAYER_RATING)
  const harder = [1, 2, 3].map((value) => outcome(value, { difficulty: 'hard' }))
  assert.equal(calculatePlayerRating(harder).recommended, 'medium')
})

test('Auto advances gradually, ignores easier practice, and tolerates one setback', () => {
  const easy = Array.from({ length: 6 }, (_, index) => outcome(index + 1))
  assert.equal(calculatePlayerRating(easy.slice(0, 5)).recommended, 'easy')
  const promoted = calculatePlayerRating(easy)
  assert.equal(promoted.recommended, 'medium')
  const practice = outcome(7)
  const tryAgain = outcome(8, { difficulty: 'medium', finish: 'too-hard' })
  const repeat = outcome(9, { givens: tryAgain.givens, difficulty: 'medium' })
  assert.deepEqual(calculatePlayerRating([...easy, practice]), promoted)
  assert.equal(calculatePlayerRating([...easy, tryAgain, repeat]).recommended, 'medium')
  assert.equal(calculatePlayerRating([...easy, tryAgain, repeat, outcome(10, { difficulty: 'medium', finish: 'too-hard' })]).recommended, 'easy')
})

test('successive Auto puzzles advance through every tier with time to practice each one', () => {
  const events: RatingEvent[] = []
  const promotions = new Map<number, RatingEvent['difficulty']>()
  let current = calculatePlayerRating(events)
  for (let index = 1; index <= 32; index++) {
    const difficulty = current.recommended
    events.push(outcome(index, { difficulty, elapsed: 100 }))
    current = calculatePlayerRating(events)
    if (current.recommended !== difficulty) promotions.set(index, current.recommended)
  }
  assert.deepEqual([...promotions], [[6, 'medium'], [15, 'hard'], [23, 'unfair'], [32, 'extreme']])
})

test('speed only adds a small bonus against clean solves at the same tier', () => {
  const baseline = [1, 2, 3].map((index) => outcome(index, { elapsed: 100 }))
  const atTime = (elapsed: number, settings: Partial<RatingEvent> = {}) => {
    const rating = calculatePlayerRating([...baseline, outcome(4, { elapsed, ...settings })])
    return rating.results.get('puzzle-4')!
  }
  assert.equal(atTime(1000).after, atTime(100).after)
  assert.ok(Math.abs(atTime(90).speedBonus - 0.8) < 0.000001)
  assert.equal(atTime(20).speedBonus, 2)
  assert.equal(atTime(20, { difficulty: 'medium' }).speedBonus, 0)
  assert.equal(atTime(20, { viewed: 1 }).speedBonus, 0)
  assert.equal(atTime(20, { finish: 'solution' }).speedBonus, 0)
  assert.equal(calculatePlayerRating(baseline).results.get('puzzle-3')?.speedBonus, 0)
})
