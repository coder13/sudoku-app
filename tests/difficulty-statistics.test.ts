import assert from 'node:assert/strict'
import test from 'node:test'
import { difficultyStatistics } from '../src/sudoku/difficulty-statistics.ts'
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
