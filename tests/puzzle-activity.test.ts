import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordAction } from '../src/sudoku/action-history.ts'
import { EMPTY, enter, makeGame } from '../src/sudoku/game.ts'
import { activityPrefix, inProgress, matchesSolvedFilters, solveDate, solvedHistory } from '../src/sudoku/puzzle-activity.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

test('Home lists active puzzles before their first move and keeps last-played order', () => {
  const storage = new MemoryStorage()
  const played = enter(makeGame('played', 'Played puzzle', EMPTY, 'imported', 100), [0], 'value', 1)
  const opened = makeGame('opened', 'Opened puzzle', EMPTY, 'generated', 200)
  const saved = { ...played, id: 'saved', savedForLater: true as const }
  const archived = { ...played, id: 'archived', archived: true }
  const answers = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const solved = enter(makeGame('solved', 'Finished puzzle', '0' + answers.slice(1), 'imported', 300), [0], 'value', 5)
  storage.setItem(activityPrefix + played.id, '250')

  assert.deepEqual(inProgress([opened, saved, archived, solved, played], storage), [played, opened])
})

test('solve history orders by completion, preserves older records, and combines filters on local calendar days', () => {
  const storage = new MemoryStorage()
  const answer = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const early = new Date(2026, 10, 16, 10).getTime()
  const late = new Date(2026, 10, 17, 23, 59).getTime()
  const later = new Date(2026, 10, 18, 0, 1).getTime()
  const original = makeGame('first-opened', 'First opened', '0' + answer.slice(1), 'imported', early - 2000)
  const lastSolved = recordAction(original, enter(original, [0], 'value', 5), 'edit', { at: later })
  const legacy = makeGame('legacy', 'Legacy', answer, 'imported', late - 2000)
  const firstSolved = recordAction(original, enter(original, [0], 'value', 5), 'edit', { at: early })
  storage.setItem(activityPrefix + firstSolved.id, String(later + 1000))
  storage.setItem(activityPrefix + legacy.id, String(late))
  assert.deepEqual(solvedHistory([original, legacy, firstSolved], storage).map(record => record.solvedAt), [late, early])

  const history = solvedHistory([legacy, { ...lastSolved, difficulty: 'medium' }], storage)
  assert.deepEqual(history.map(record => record.game.id), [lastSolved.id, legacy.id])
  assert.equal(solveDate(late), '2026-11-17')
  assert.equal(solveDate(later), '2026-11-18')
  assert.deepEqual(history.filter(record => matchesSolvedFilters(record, {
    variant: 'classic', difficulty: 'unrated', from: '2026-11-17', to: '2026-11-17',
  })).map(record => record.game.id), [legacy.id])
  assert.equal(matchesSolvedFilters(history[0], { from: '2026-11-18', difficulty: 'medium' }), true)
  assert.equal(matchesSolvedFilters(history[0], { from: '2026-11-18', variant: 'mixed' }), false)
  assert.equal(matchesSolvedFilters(history[0], { to: '2026-11-17' }), false)
})
