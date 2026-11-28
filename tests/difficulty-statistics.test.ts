import assert from 'node:assert/strict'
import test from 'node:test'
import type { CustomModeDefinition } from '../src/sudoku/custom-modes.ts'
import { difficultyStatistics, pointsPerSecond, pointsPerSecondForSolve } from '../src/sudoku/difficulty-statistics.ts'
import { EMPTY, makeGame, type Game } from '../src/sudoku/game.ts'
import { jigsawLayout, variantSeeds } from '../src/sudoku/variant-generation.ts'

const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

function completed(id: string, difficulty: Game['difficulty'], elapsed: number): Game {
  const game = makeGame(id, id, EMPTY, 'generated')
  return { ...game, difficulty, elapsed, started: true, position: { ...game.position, entries: solution } }
}

test('difficulty results average completed games and keep variants and historical grades separate', () => {
  const jigsawSolution = '387625149165947283924813765712569834853274691496138572539782416648351927271496358'
  const jigsaw: Game = {
    ...completed('jigsaw', 'medium', 900),
    variant: {
      id: 'jigsaw', solution: jigsawSolution,
      puzzle: { version: 1, givens: EMPTY, regions: jigsawLayout(variantSeeds.jigsaw.easy![0].regions!) },
    },
    position: { ...makeGame('position', '', EMPTY, 'generated').position, entries: jigsawSolution },
  }
  const games = [completed('first', 'medium', 120), completed('second', 'medium', 241),
    completed('hard', 'hard', 600), completed('old', 'unfair', 1800), jigsaw]
  const classic = difficultyStatistics(games)
  assert.deepEqual(classic.get('medium'), { solved: 2, averageSeconds: 181 })
  assert.deepEqual(classic.get('hard'), { solved: 1, averageSeconds: 600 })
  assert.equal(classic.has('expert'), false)
  assert.deepEqual(classic.get('unfair'), { solved: 1, averageSeconds: 1800 })
  assert.deepEqual([...difficultyStatistics(games, 'jigsaw')], [['medium', { solved: 1, averageSeconds: 900 }]])
})

test('unplayed imports, unfinished grids, and drafts do not inflate results; missing times do not lower the average', () => {
  const complete = completed('played', 'easy', 120)
  const invalid = { ...complete, id: 'invalid', position: { ...complete.position, entries: '1'.repeat(81) } }
  const games: Game[] = [complete, invalid, { ...complete, id: 'imported', source: 'imported', started: false },
    { ...complete, id: 'draft', source: 'draft' }, { ...complete, id: 'unrated', difficulty: null },
    { ...complete, id: 'unfinished', position: { ...complete.position, entries: EMPTY } },
    completed('no-time', 'easy', 0), completed('untimed-tier', 'medium', 0)]
  assert.deepEqual([...difficultyStatistics(games)], [
    ['easy', { solved: 2, averageSeconds: 120 }], ['medium', { solved: 1, averageSeconds: null }],
  ])
  assert.equal(difficultyStatistics([]).size, 0)
})

test('custom difficulty results match the rule combination and negative markers', () => {
  const mode = { name: 'Windoku Kropki', rules: ['windoku', 'kropki'], negativeMarkers: ['kropki-white'] } satisfies CustomModeDefinition
  const solve = { ...completed('first', 'medium', 120), customMode: mode }
  const renamed = { ...completed('second', 'medium', 240),
    customMode: { ...mode, name: 'Kropki Windoku', rules: ['kropki', 'windoku'] } } satisfies Game
  const differentMarkers = { ...completed('different-markers', 'medium', 300),
    customMode: { ...mode, negativeMarkers: ['kropki-black'] } } satisfies Game
  const differentRules = { ...completed('different-rules', 'medium', 300),
    customMode: { ...mode, rules: ['diagonal', 'kropki'] } } satisfies Game
  const results = difficultyStatistics([solve, renamed, differentMarkers, differentRules, completed('classic', 'medium', 400)], mode)
  assert.deepEqual([...results], [['medium', { solved: 2, averageSeconds: 180 }]])
})

test('points per second divides the total puzzle points by the total seconds of rated, timed solves', () => {
  const fast = { ...completed('fast', 'easy', 30), score: 120 }
  const slow = { ...completed('slow', 'hard', 120), score: 180 }
  const zero = { ...completed('zero-score', 'easy', 50), score: 0 }
  const excluded: Game[] = [
    completed('unrated', 'medium', 90),
    { ...fast, id: 'untimed', timeUntracked: true },
    { ...fast, id: 'zero-time', elapsed: 0 },
    { ...fast, id: 'imported', source: 'imported', started: false },
    { ...fast, id: 'draft', source: 'draft' },
    { ...fast, id: 'unfinished', position: { ...fast.position, entries: EMPTY } },
  ]

  assert.equal(pointsPerSecond([fast, slow, zero, ...excluded]), 1.5)
  assert.equal(pointsPerSecond([zero]), 0)
  assert.equal(pointsPerSecond(excluded), null)
})

test('a solve shows its rate and the change to the weighted rate at the time of completion', () => {
  const fast = { ...completed('fast', 'easy', 30), score: 120, created: 1 }
  const slow = { ...completed('slow', 'hard', 120), score: 180, created: 2 }
  const later = { ...completed('later', 'hard', 50), score: 300, created: 3 }
  const untimed = { ...slow, id: 'untimed', timeUntracked: true } satisfies Game
  const games = [later, slow, untimed, fast]

  assert.deepEqual(pointsPerSecondForSolve(slow, games), { puzzle: 1.5, before: 4, after: 2 })
  assert.deepEqual(pointsPerSecondForSolve(fast, games), { puzzle: 4, before: null, after: 4 })
  assert.deepEqual(pointsPerSecondForSolve(later, games), { puzzle: 6, before: 2, after: pointsPerSecond(games) })
  assert.equal(pointsPerSecondForSolve(untimed, games), null)
})
