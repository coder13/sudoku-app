import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, enter, makeGame } from '../src/sudoku/game.ts'
import { activityPrefix, inProgress } from '../src/sudoku/puzzle-activity.ts'
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
