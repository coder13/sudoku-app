import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IDBFactory } from 'fake-indexeddb'
import { EMPTY, enter, makeGame, undo } from '../src/sudoku/game.ts'
import { createIndexedPuzzleSaves, GAME_PREFIX } from '../src/sudoku/puzzle-saves.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

function setup() {
  const storage = new MemoryStorage()
  const indexedDB = new IDBFactory()
  const open = () => createIndexedPuzzleSaves(indexedDB, () => storage)
  return { storage, open }
}

test('the active save migrates ahead of the library and retains undo and redo', async () => {
  const { storage, open } = setup()
  const saves = open()
  const active = undo(enter(enter(makeGame('active', 'Active', EMPTY, 'imported'), [0], 'value', 1), [1], 'corner', 2))
  const other = makeGame('other', 'Other', EMPTY, 'imported')
  storage.setItem(GAME_PREFIX + active.id, JSON.stringify(active))
  storage.setItem('gridroom:v1:game:' + active.id, JSON.stringify({ ...active, title: 'Older' }))
  storage.setItem('gridroom:v1:game:' + other.id, JSON.stringify(other))
  storage.setItem('gridroom:v1:played:' + other.id, '1234')

  assert.deepEqual(JSON.parse((await saves.read(active.id))?.value as string), active)
  assert.equal(storage.getItem(GAME_PREFIX + active.id), null)
  assert.equal(storage.getItem('gridroom:v1:game:' + active.id), null)
  assert.ok(storage.getItem('gridroom:v1:game:' + other.id))

  const library = await saves.all()
  assert.deepEqual(library.map(record => record.id), [active.id, other.id])
  assert.equal(library[1].played, 1234)
  assert.equal(storage.getItem('gridroom:v1:game:' + other.id), null)
})

test('reload recovers the latest queued moves once after a partial save', async () => {
  const { storage, open } = setup()
  const saves = open()
  const original = makeGame('reload', 'Reload', EMPTY, 'imported')
  const firstMove = enter(original, [0], 'value', 1)
  const latest = enter(firstMove, [1], 'value', 2)
  const first = await saves.change(original.id, undefined, original)
  const stamp = { writer: 'tab-a', sequence: 1 }
  await saves.edit(original.id, () => ({ game: firstMove, stamp }))
  saves.checkpoint(original.id, { ...stamp, sequence: 2, version: first.record?.version, game: latest })

  const reloaded = open()
  const recovered = await reloaded.read(original.id)
  assert.deepEqual(recovered?.value, JSON.parse(JSON.stringify(latest)))
  assert.deepEqual(recovered?.stamp, { writer: 'tab-a', sequence: 2 })
  assert.equal((await reloaded.read(original.id))?.version, recovered?.version)
  assert.equal(storage.getItem('sudoku-app:save-checkpoint:' + original.id), null)
})

test('checkpoint recovery keeps a newer edit from another tab and saves the staged board as a copy', async () => {
  const { open } = setup()
  const tab = open()
  const game = makeGame('race', 'Race', EMPTY, 'imported')
  const { record } = await tab.change(game.id, undefined, game)
  const otherEdit = enter(game, [1], 'value', 2)
  const queuedEdit = enter(game, [0], 'value', 1)
  await open().change(game.id, record?.version, otherEdit)
  tab.checkpoint(game.id, { writer: 'tab-b', sequence: 1, version: record?.version, game: queuedEdit })

  const library = await open().all()
  assert.equal(library.length, 2)
  assert.deepEqual(library.find(save => save.id === game.id)?.value, otherEdit)
  const copy = library.find(save => save.id !== game.id)?.value
  assert.equal(typeof copy === 'object' && copy?.position.entries[0], '1')
})

test('a stale sync write cannot overwrite newer progress or install a stale conflict copy', async () => {
  const { open } = setup()
  const local = open()
  const sync = open()
  const original = makeGame('sync', 'Sync', EMPTY, 'imported')
  const { record } = await local.change(original.id, undefined, original)
  const latest = enter(original, [0], 'value', 1)
  const { record: saved } = await local.change(original.id, record?.version, latest)
  const other = enter(original, [1], 'value', 2)
  const copy = { game: { ...latest, id: 'copy', title: 'Conflict copy' }, played: 100 }

  const stale = await sync.change(original.id, record?.version, other, 101, copy)
  assert.equal(stale.saved, false)
  assert.deepEqual(stale.record?.value, latest)
  assert.equal(await sync.read(copy.game.id), undefined)

  const result = await sync.change(original.id, saved?.version, other, 101, copy)
  assert.equal(result.saved, true)
  assert.equal(result.copied, true)
  assert.deepEqual((await sync.read(copy.game.id))?.value, copy.game)
  assert.deepEqual((await sync.read(original.id))?.value, other)
})
