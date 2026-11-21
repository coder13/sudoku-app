import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { EMPTY, enter, makeGame, redo, restartGame, undo, type Game } from '../src/sudoku/game.ts'
import { activityPrefix } from '../src/sudoku/puzzle-activity.ts'
import { puzzleTiming } from '../src/sudoku/puzzle-timing.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

const GAME_PREFIX = 'sudoku-app:v1:game:'

class TrackedStorage extends MemoryStorage {
  #reads: string[] = []
  #writes: { key: string; value: string }[] = []
  #failWrites = false
  get reads() { return this.#reads }
  get writes() { return this.#writes }
  get gameWrites() { return this.#writes.filter(({ key }) => key.startsWith(GAME_PREFIX)) }
  set failWrites(value: boolean) { this.#failWrites = value }
  getItem(key: string) { this.#reads.push(key); return super.getItem(key) }
  setItem(key: string, value: string) {
    if (this.#failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.#writes.push({ key, value })
    super.setItem(key, value)
  }
  resetCounts() { this.#reads = []; this.#writes = [] }
  raw(id: string) { return super.getItem(GAME_PREFIX + id) }
  saved(id: string): Game { return JSON.parse(this.raw(id)!) }
  replace(game: Game) { super.setItem(GAME_PREFIX + game.id, JSON.stringify(game)) }
}

function playing(id = 'clock') {
  return enter(makeGame(id, 'Clock test', EMPTY, 'imported'), [0], 'value', 1)
}

async function setup(t: TestContext, name: string) {
  const storage = new TrackedStorage()
  const events = new EventTarget()
  const globals = { window: events, localStorage: storage, sessionStorage: new MemoryStorage() }
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { roomStore } = await import(`../src/sudoku/storage.ts?clock-${name}`)
  t.after(() => {
    storage.failWrites = false
    roomStore.flushElapsed()
    puzzleTiming.set('trackTime', true)
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  return { storage, events, store: roomStore, current: (id = 'clock') => roomStore.getSnapshot().games.find(game => game.id === id)! }
}

function storageEvent(events: EventTarget, storage: Storage, key: string | null) {
  const event = new Event('storage')
  Object.defineProperties(event, { storageArea: { value: storage }, key: { value: key } })
  events.dispatchEvent(event)
}

test('clock ticks keep board references and do no storage work until one five-second checkpoint', async t => {
  const { store, storage, current } = await setup(t, 'checkpoint')
  const game = undo(enter(playing(), [3], 'corner', 7))
  store.add(game)
  const edited: string[] = []
  const unsubscribe = store.onEdit(id => edited.push(id))
  storage.resetCounts()
  for (let index = 0; index < 4; index++) store.advanceElapsed(game.id, 1)
  assert.equal(current().elapsed, 4)
  assert.equal(current().position, game.position)
  assert.equal(current().past, game.past)
  assert.equal(current().future, game.future)
  assert.deepEqual(storage.reads, [])
  assert.deepEqual(storage.writes, [])
  assert.equal(storage.saved(game.id).elapsed, 0)
  t.mock.timers.tick(4999)
  assert.deepEqual(storage.writes, [])
  t.mock.timers.tick(1)
  assert.deepEqual(storage.reads, [GAME_PREFIX + game.id])
  assert.equal(storage.gameWrites.length, 1)
  assert.equal(storage.writes.length, 1, 'clock checkpoints do not change library activity')
  assert.equal(storage.saved(game.id).elapsed, 4)
  assert.deepEqual(redo(storage.saved(game.id)).position, redo(game).position)
  assert.deepEqual(edited, [], 'clock checkpoints do not announce board edits')
  t.mock.timers.tick(10_000)
  assert.equal(storage.gameWrites.length, 1, 'no further write without another clock tick')
  unsubscribe()
})

test('each move and undo save immediately, including pending time in the same board write', async t => {
  const { store, storage, current } = await setup(t, 'move')
  store.add(playing())
  store.advanceElapsed('clock', 3)
  storage.resetCounts()
  store.update('clock', game => enter(game, [4], 'center', 8))
  assert.equal(storage.gameWrites.length, 1)
  assert.equal(storage.saved('clock').elapsed, 3)
  assert.deepEqual(storage.saved('clock').position, current().position)
  assert.equal(storage.writes.filter(({ key }) => key === activityPrefix + 'clock').length, 1)
  store.advanceElapsed('clock', 2)
  storage.resetCounts()
  store.update('clock', undo)
  assert.equal(storage.gameWrites.length, 1)
  assert.equal(storage.saved('clock').elapsed, 5)
  assert.deepEqual(storage.saved('clock').past, current().past)
  assert.deepEqual(storage.saved('clock').future, current().future)
  const reloaded = (await import('../src/sudoku/storage.ts?clock-move-reloaded')).roomStore.getSnapshot().games[0]
  assert.deepEqual(reloaded, JSON.parse(JSON.stringify(current())))
  assert.equal(redo(reloaded).position.center[4], 1 << 7)
  t.mock.timers.tick(10_000)
  assert.equal(storage.gameWrites.length, 1, 'a durable move cancels its clock checkpoint')
})

test('pagehide, puzzle navigation, stop, and disconnect flush the displayed clock', async t => {
  const { store, storage, events, current } = await setup(t, 'lifecycle')
  store.add(playing('clock'))
  store.add(playing('other'))
  store.select('clock')
  const disconnect = store.connect()
  storage.resetCounts()
  store.advanceElapsed('clock', 2)
  events.dispatchEvent(new Event('pagehide'))
  assert.equal(storage.saved('clock').elapsed, 2)
  store.advanceElapsed('clock', 3)
  store.view('other')
  assert.equal(storage.saved('clock').elapsed, 5)
  store.advanceElapsed('other', 4)
  store.select('clock')
  assert.equal(storage.saved('other').elapsed, 4)
  store.advanceElapsed('clock', 5)
  store.stopPlaying('clock')
  assert.equal(storage.saved('clock').elapsed, 10)
  assert.equal(store.getSnapshot().active, null)
  store.select('clock')
  store.advanceElapsed('clock', 6)
  disconnect()
  assert.equal(storage.saved('clock').elapsed, 16)
  assert.equal(current().elapsed, 16)
  assert.equal(storage.gameWrites.length, 5)
})

test('filing a puzzle keeps pending time and redo history with one board write', async t => {
  const { store, storage } = await setup(t, 'file')
  const game = undo(enter(playing(), [5], 'corner', 4))
  store.add(game)
  store.advanceElapsed(game.id, 4)
  storage.resetCounts()
  store.saveForLater(game.id)
  assert.equal(storage.gameWrites.length, 1)
  const saved = storage.saved(game.id)
  assert.equal(saved.elapsed, 4)
  assert.equal(saved.savedForLater, true)
  assert.equal(store.getSnapshot().active, null)
  assert.deepEqual(redo(saved).position, redo(game).position)
})

test('a pending clock never overwrites a remote reset or deletion before its storage event', async t => {
  const { store, storage, current } = await setup(t, 'remote-before-event')
  const game = { ...playing(), elapsed: 20 }
  store.add(game)
  store.advanceElapsed(game.id, 4)
  const reset = restartGame(game)
  storage.replace(reset)
  storage.resetCounts()
  store.flushElapsed(game.id)
  assert.deepEqual(storage.saved(game.id), JSON.parse(JSON.stringify(reset)))
  assert.equal(current().elapsed, 0)
  assert.equal(current().started, false)
  assert.equal(storage.gameWrites.length, 0)
  store.update(game.id, game => enter(game, [4], 'value', 3))
  store.advanceElapsed(game.id, 2)
  storage.removeItem(GAME_PREFIX + game.id)
  storage.resetCounts()
  store.flushElapsed(game.id)
  assert.equal(current(), undefined)
  assert.equal(storage.raw(game.id), null)
  assert.equal(storage.gameWrites.length, 0)
  t.mock.timers.tick(10_000)
  assert.equal(storage.raw(game.id), null, 'the cancelled checkpoint does not restore a deleted puzzle')
})

test('pagehide and storage events preserve a newer remote move and discard only the local pending clock', async t => {
  const { store, storage, events, current } = await setup(t, 'remote-events')
  store.add(playing())
  const disconnect = store.connect()
  store.advanceElapsed('clock', 4)
  storageEvent(events, storage, GAME_PREFIX + 'clock')
  assert.equal(current().elapsed, 4, 'an event for the same persisted version keeps the local clock')
  const remote = { ...enter(playing(), [4], 'value', 7), elapsed: 25 }
  storage.replace(remote)
  storage.resetCounts()
  events.dispatchEvent(new Event('pagehide'))
  assert.deepEqual(current(), JSON.parse(JSON.stringify(remote)))
  assert.equal(storage.gameWrites.length, 0)
  store.advanceElapsed('clock', 3)
  const reset = restartGame(remote)
  storage.replace(reset)
  storageEvent(events, storage, GAME_PREFIX + 'clock')
  assert.deepEqual(current(), JSON.parse(JSON.stringify(reset)))
  store.update('clock', game => enter(game, [0], 'value', 1))
  store.advanceElapsed('clock', 2)
  storage.clear()
  storage.resetCounts()
  storageEvent(events, storage, null)
  assert.deepEqual(store.getSnapshot().games, [])
  events.dispatchEvent(new Event('pagehide'))
  t.mock.timers.tick(10_000)
  assert.equal(storage.gameWrites.length, 0)
  disconnect()
})

test('quota failure keeps the displayed clock for a later checkpoint and connect does not reload stale time', async t => {
  const { store, storage, current } = await setup(t, 'quota')
  store.add(playing())
  storage.failWrites = true
  store.advanceElapsed('clock', 4)
  t.mock.timers.tick(5000)
  assert.equal(store.getSnapshot().storageAvailable, false)
  assert.equal(current().elapsed, 4)
  assert.equal(storage.saved('clock').elapsed, 0)
  const disconnect = store.connect()
  assert.equal(current().elapsed, 4)
  storage.failWrites = false
  storage.resetCounts()
  t.mock.timers.tick(5000)
  assert.equal(storage.saved('clock').elapsed, 4)
  assert.equal(storage.gameWrites.length, 1)
  disconnect()
})

test('a failed filing or initial save keeps its local changes until storage recovers', async t => {
  const { store, storage, current } = await setup(t, 'quota-local-changes')
  store.add(playing())
  store.advanceElapsed('clock', 4)
  storage.failWrites = true
  store.saveForLater('clock')
  store.update('clock', game => enter(game, [3], 'corner', 6))
  assert.equal(current().elapsed, 4)
  assert.equal(current().savedForLater, true)
  assert.equal(current().position.corner[3], 1 << 5)
  storage.failWrites = false
  store.flushElapsed()
  assert.equal(storage.saved('clock').elapsed, 4)
  assert.equal(storage.saved('clock').savedForLater, true)
  assert.equal(storage.saved('clock').position.corner[3], 1 << 5)

  storage.failWrites = true
  store.add(playing('unsaved'))
  store.advanceElapsed('unsaved', 3)
  store.update('unsaved', game => enter(game, [4], 'center', 8))
  store.saveForLater('unsaved')
  assert.equal(current('unsaved').elapsed, 3)
  assert.equal(current('unsaved').savedForLater, true)
  assert.equal(storage.raw('unsaved'), null)
  storage.failWrites = false
  store.flushElapsed()
  assert.equal(storage.saved('unsaved').elapsed, 3)
  assert.equal(storage.saved('unsaved').savedForLater, true)
  assert.equal(storage.saved('unsaved').position.center[4], 1 << 7)
})

test('remote changes still replace a pending clock after a failed checkpoint and before the next move', async t => {
  const { store, storage, current } = await setup(t, 'quota-remote')
  const game = playing()
  store.add(game)
  store.advanceElapsed(game.id, 4)
  storage.failWrites = true
  store.flushElapsed()
  assert.equal(store.getSnapshot().storageAvailable, false)
  storage.failWrites = false
  const reset = restartGame(game)
  storage.replace(reset)
  store.update(game.id, game => enter(game, [4], 'value', 5))
  assert.equal(current().elapsed, 0)
  assert.equal(current().position.entries[0], '0')
  assert.equal(current().position.entries[4], '5')
  assert.equal(storage.saved(game.id).elapsed, 0)
  store.advanceElapsed(game.id, 2)
  storage.removeItem(GAME_PREFIX + game.id)
  storage.resetCounts()
  store.update(game.id, game => enter(game, [5], 'value', 6))
  assert.equal(current(), undefined)
  assert.equal(storage.raw(game.id), null)
  assert.equal(storage.gameWrites.length, 0)
})

test('invalid ticks and stopped clocks leave state and storage unchanged', async t => {
  const { store, storage, current } = await setup(t, 'ignored')
  const game = playing()
  store.add(game)
  storage.resetCounts()
  for (const seconds of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) store.advanceElapsed(game.id, seconds)
  store.advanceElapsed('missing', 1)
  assert.equal(current(), game)
  assert.deepEqual(storage.reads, [])
  assert.deepEqual(storage.writes, [])
  const answer = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  for (const stopped of [
    { ...game, started: false }, { ...game, paused: true }, { ...game, timeUntracked: true as const },
    enter(makeGame(game.id, 'Solved', '0' + answer.slice(1), 'imported'), [0], 'value', 5),
  ]) {
    store.update(game.id, () => stopped)
    const before = current()
    storage.resetCounts()
    store.advanceElapsed(game.id, 1)
    assert.equal(current(), before)
    assert.deepEqual(storage.reads, [])
    assert.deepEqual(storage.writes, [])
  }
  store.update(game.id, () => game)
  puzzleTiming.set('trackTime', false)
  storage.resetCounts()
  store.advanceElapsed(game.id, 1)
  assert.equal(current().elapsed, 0)
  assert.deepEqual(storage.writes, [])
})
