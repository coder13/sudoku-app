import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addAnalysisAssistance, addRatingHints, addSinglesAssistance, calculatePlayerRating, isRatingAttempt, isRatingEvent, ratingAttemptFor, STARTING_PLAYER_RATING, type RatingEvent } from '../src/sudoku/player-rating.ts'

function outcome(index: number, settings: Partial<RatingEvent> = {}): RatingEvent {
  return {
    id: `outcome-${index}`, gameId: `puzzle-${index}`, givens: String(index).padStart(81, '0'),
    at: index, difficulty: 'medium', finish: 'solved', elapsed: 0, viewed: 0, applied: 0, ...settings,
  }
}

test('Auto starts at Medium and a fast independent early solve raises the next tier', () => {
  assert.equal(calculatePlayerRating([]).rating, STARTING_PLAYER_RATING)
  assert.equal(calculatePlayerRating([]).recommended, 'medium')
  const fast = outcome(1, { elapsed: 90 })
  assert.equal(calculatePlayerRating([fast]).recommended, 'hard')
  assert.equal(calculatePlayerRating([{ ...fast, difficulty: 'easy', mode: 'fixed' }]).recommended, 'hard')
  const assisted = calculatePlayerRating([{ ...fast, viewed: 1, applied: 1, hintsRequested: 1 }])
  assert.equal(assisted.recommended, 'medium')
  assert.ok(assisted.rating < calculatePlayerRating([fast]).rating)
  assert.equal(calculatePlayerRating([{ ...fast, elapsed: 600 }]).recommended, 'medium')
  assert.equal(calculatePlayerRating([{ ...fast, elapsed: 0 }]).recommended, 'medium')
})

test('repeated hint requests lower the tier even before the puzzle is solved', () => {
  const helped = outcome(1, { finish: 'hints', viewed: 2, hintsRequested: 2 })
  assert.equal(calculatePlayerRating([helped]).recommended, 'easy')
  assert.equal(calculatePlayerRating([helped, outcome(2, { difficulty: 'easy', elapsed: 60 })]).recommended, 'medium')
  assert.equal(calculatePlayerRating([{ ...helped, finish: 'solved', elapsed: 60 }]).recommended, 'easy')
  assert.equal(calculatePlayerRating([{ ...helped, finish: 'solved', hintsRequested: 1 }]).recommended, 'medium')
  const automated = outcome(1, { singlesAssistance: 'all', hintsRequested: 0 })
  assert.equal(calculatePlayerRating([automated]).recommended, 'medium')

  const evidence = Array.from({ length: 4 }, (_, index) => outcome(index + 1, { viewed: 1, hintsRequested: 1 }))
  const one = [...evidence, outcome(5, { finish: 'hints', viewed: 2, hintsRequested: 2 })]
  assert.equal(calculatePlayerRating(one).recommended, 'medium')
  assert.equal(calculatePlayerRating([...one, outcome(6, { finish: 'hints', viewed: 2, hintsRequested: 2 })]).recommended, 'easy')
})

test('hint requests count distinct positions independently of viewed and automated moves', () => {
  const starting = ratingAttemptFor({ difficulty: 'medium', points: 850, scoringVersion: 1, techniqueOrder: ['pointing'] })
  const first = addRatingHints(starting, ['first'], false, { position: 'grid-one', at: 10 })
  const alternate = addRatingHints(first, ['alternate'], false, { position: 'grid-one', at: 11 })
  const automated = addSinglesAssistance(alternate, 'partial')
  const second = addRatingHints(automated, ['second'], false, { position: 'grid-two', at: 12 })
  assert.deepEqual(second.requested, ['grid-one', 'grid-two'])
  assert.deepEqual(second.viewed, ['first', 'alternate', 'second'])
  assert.deepEqual(second.applied, [])
  assert.equal(second.singlesAssistance, 'partial')
  assert.equal(second.lastHintAt, 12)
})

test('using Solve all singles to leave Auto Easy preserves rating and resumes at Medium', () => {
  const history = [outcome(1, { finish: 'hints', viewed: 2, hintsRequested: 2 })]
  const before = calculatePlayerRating(history)
  assert.equal(before.recommended, 'easy')
  const easy = outcome(2, { difficulty: 'easy', singlesAssistance: 'all', hintsRequested: 0 })
  const next = calculatePlayerRating([...history, easy])
  assert.equal(next.recommended, 'medium')
  assert.equal(next.rating, before.rating)
  assert.equal(next.results.get(easy.gameId)?.speedBonus, 0)

  const { singlesAssistance: _, ...priorSave } = easy
  const legacy = calculatePlayerRating([...history, { ...priorSave, viewed: 80, applied: 80 }])
  assert.equal(legacy.rating, before.rating)
  assert.equal(legacy.recommended, 'medium')

  const fixed = calculatePlayerRating([...history, { ...easy, mode: 'fixed' }])
  assert.equal(fixed.rating, before.rating)
  assert.equal(fixed.recommended, 'easy')
})

test('early Auto solves beyond singles can advance without using the assisted solve time', () => {
  const partial = outcome(1, { singlesAssistance: 'partial', elapsed: 600 })
  const independentDeductions = calculatePlayerRating([partial])
  assert.equal(independentDeductions.recommended, 'hard')
  assert.equal(independentDeductions.results.get(partial.gameId)?.speedBonus, 0)
  assert.equal(calculatePlayerRating([{ ...partial, viewed: 1, applied: 1, hintsRequested: 1 }]).recommended, 'medium')
  assert.equal(calculatePlayerRating([{ ...partial, singlesAssistance: 'all' }]).rating, STARTING_PLAYER_RATING)
  assert.equal(calculatePlayerRating([{ ...partial, singlesAssistance: 'all' }]).recommended, 'medium')
})

test('with more results Auto advances at most one tier at a time even on the same fast solves', () => {
  const evidence = Array.from({ length: 4 }, (_, index) => outcome(index + 1, { viewed: 1, hintsRequested: 1 }))
  const firstFast = outcome(5, { elapsed: 90 })
  assert.equal(calculatePlayerRating([...evidence, firstFast]).recommended, 'medium')

  const tiers = ['easy', 'medium', 'hard', 'unfair', 'extreme']
  const events = [...evidence]
  const promoted = []
  for (let index = 5; index <= 36; index++) {
    const difficulty = calculatePlayerRating(events).recommended
    events.push(outcome(index, { difficulty, elapsed: 700 }))
    const next = calculatePlayerRating(events).recommended
    if (next !== difficulty) {
      assert.equal(tiers.indexOf(next) - tiers.indexOf(difficulty), 1)
      promoted.push(next)
    }
  }
  assert.deepEqual(promoted, ['hard', 'unfair', 'extreme'])
})

test('ratings include fixed and older solves, and deduplicate repeat grids across entry points', () => {
  const easy = outcome(1, { difficulty: 'easy', mode: 'fixed', elapsed: 600 })
  const old = outcome(2, { difficulty: 'unfair', estimated: true, elapsed: 30 })
  const early = calculatePlayerRating([easy, old])
  assert.equal(early.count, 2)
  assert.equal(early.recommended, 'medium')
  assert.equal(early.results.get(easy.gameId)?.event.mode, 'fixed')
  assert.equal(early.results.has(old.gameId), false)
  const replay = outcome(3, { givens: easy.givens, mode: 'fixed' })
  assert.deepEqual(calculatePlayerRating([easy, old, replay]), early)
  const variant = outcome(4, { givens: easy.givens, puzzleKey: 'diagonal:rules' })
  assert.equal(calculatePlayerRating([easy, old, variant]).count, 3)

  const stronger = [outcome(5, { mode: 'fixed', difficulty: 'hard' }), outcome(6, { mode: 'fixed', difficulty: 'unfair' })]
  const calibrated = calculatePlayerRating([easy, old, ...stronger])
  assert.equal(calibrated.recommended, 'hard')
  assert.equal(calibrated.results.get('puzzle-6')?.fixedCalibration, true)
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
  assert.equal(atTime(20, { difficulty: 'hard' }).speedBonus, 0)
  assert.equal(atTime(20, { viewed: 1 }).speedBonus, 0)
  assert.equal(atTime(20, { finish: 'solution' }).speedBonus, 0)
  assert.equal(calculatePlayerRating(baseline).results.get('puzzle-3')?.speedBonus, 0)
})

test('technique analysis lowers rating weight and never promotes Auto difficulty', () => {
  const assistedFast = outcome(1, { elapsed: 90, analysisUsed: true })
  const assisted = calculatePlayerRating([assistedFast])
  assert.equal(assisted.rating, STARTING_PLAYER_RATING)
  assert.equal(assisted.recommended, 'medium')
  assert.equal(assisted.results.get(assistedFast.gameId)?.speedBonus, 0)

  // Using a scan does not consume one of the four early calibration results.
  const nextFast = outcome(2, { elapsed: 90 })
  assert.equal(calculatePlayerRating([assistedFast, nextFast]).recommended, 'hard')

  const failed = outcome(1, { finish: 'too-hard', analysisUsed: true })
  const weaklyWeighted = calculatePlayerRating([failed])
  const normal = calculatePlayerRating([{ ...failed, analysisUsed: undefined }])
  assert.ok(weaklyWeighted.rating < STARTING_PLAYER_RATING)
  assert.ok(weaklyWeighted.rating > normal.rating)
  assert.equal(weaklyWeighted.recommended, 'medium')
})

test('scan assistance is a valid, persistent, one-time rating flag', () => {
  const fresh = ratingAttemptFor({ difficulty: 'medium', points: 850, scoringVersion: 1, techniqueOrder: ['pointing'] })
  const assisted = addAnalysisAssistance(fresh)
  assert.equal(assisted.analysisUsed, true)
  assert.equal(isRatingAttempt(assisted), true)
  assert.equal(addAnalysisAssistance(assisted), assisted)
  assert.equal(isRatingEvent(outcome(3, { analysisUsed: true })), true)
  assert.equal(isRatingEvent(outcome(3, { analysisUsed: false } as unknown as Partial<RatingEvent>)), false)
  const finished = { ...assisted, outcome: outcome(3) }
  assert.equal(addAnalysisAssistance(finished), finished)
})
