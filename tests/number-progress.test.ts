import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasNumberMoves, loadNumberProgress, numberValuesWithMoves, NUMBER_HISTORY_SIZE, parseNumberProgress, readNumberProgress,
  saveNumberClock, saveNumberProgress, type NumberProgress,
} from '../src/number-puzzles/progress.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

const key = 'calcudoku.position.v1.easy-1'
const editable = [true, false, true]
const noted = { values: [0, 0, 0], notes: [0, 0, 4] }

test('number game progress reads old saves and saves both history stacks with the current board', () => {
  const storage = new MemoryStorage()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    storage.setItem(key, JSON.stringify(noted))
    assert.deepEqual(loadNumberProgress(key, editable, 4), { position: noted, past: [], future: [] })

    const progress: NumberProgress = { position: noted, past: [[2, 0, 0]], future: [[2, 3, 0]] }
    assert.equal(saveNumberProgress(key, progress), true)
    assert.deepEqual(loadNumberProgress(key, editable, 4), progress)
    const saved = readNumberProgress(key)
    assert.ok(saved)
    assert.deepEqual(parseNumberProgress(saved, editable, 4), progress)
    assert.equal(parseNumberProgress(saved, [true, true], 4), null)

    const past = [[2, 3, 0], ...Array.from({ length: NUMBER_HISTORY_SIZE }, () => [2, 0, 0])]
    storage.setItem(key, JSON.stringify({
      ...noted, past, future: [[2, 0, 0], [1, 2, 0]],
    }))
    assert.deepEqual(loadNumberProgress(key, editable, 4), {
      position: noted, past: past.slice(1), future: [],
    })
    const timed = { ...progress, lastPlayed: 1_790_000_000_000 }
    assert.equal(saveNumberProgress(key, { ...timed, clock: { elapsed: 0 } }), true)
    assert.deepEqual(saveNumberClock(key, 8), { elapsed: 8 })
    assert.deepEqual(loadNumberProgress(key, editable, 4), { ...timed, clock: { elapsed: 8 } })
    assert.equal(saveNumberProgress(key, { ...timed, clock: { elapsed: 6, finished: true } }), true)
    assert.deepEqual(saveNumberClock(key, 2), { elapsed: 8, finished: true })
    assert.deepEqual(loadNumberProgress(key, editable, 4), { ...timed, clock: { elapsed: 8, finished: true } })
    storage.setItem(key, '{"values": [], "notes": false}')
    assert.equal(readNumberProgress(key), null)
    storage.setItem(key, '{')
    assert.equal(readNumberProgress(key), null)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('corner marks count as progress and survive undo and redo storage', () => {
  const saved = {
    values: [0, 0, 0], notes: [0, 0, 0], cornerNotes: [1, 0, 0],
    past: [[0, 0, 0]], future: [[0, 0, 0, 3]],
  }
  assert.deepEqual(numberValuesWithMoves(saved, editable, 4), [0, 0, 0])
  const progress = parseNumberProgress(saved, editable, 4)
  assert.ok(progress && hasNumberMoves(progress))
  assert.deepEqual(progress.position.cornerNotes, [1, 0, 0])
  assert.deepEqual(progress.past, [[0, 0, 0]])
  assert.deepEqual(progress.future, [[0, 0, 0, 3]])
})

test('generated history recovers unlisted boards and saves moves when IndexedDB is unavailable', async () => {
  const storage = new MemoryStorage()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  const { generatedNumberHistory, openGeneratedNumberPuzzle, saveGeneratedNumberClock, saveGeneratedNumberProgress } =
    await import('../src/number-puzzles/generated-storage.ts')
  try {
    const history = 'calcudoku.generated.v1'
    const [first, orphan, next] = ['v1.YQ', 'v1.Yg', 'v1.Yw']
    const orphanKey = `calcudoku.position.v1.${orphan}`
    const saved = { ...noted, past: [[2, 0, 0]], future: [[2, 3, 0]] }
    storage.setItem(history, JSON.stringify([first, first, 'invalid']))
    storage.setItem(orphanKey, JSON.stringify(saved))

    assert.deepEqual((await generatedNumberHistory('calcudoku')).map(({ id }) => id), [first, orphan])
    assert.deepEqual(await openGeneratedNumberPuzzle('calcudoku', orphan), {
      game: 'calcudoku', id: orphan, number: 2, progress: saved,
    })
    assert.equal((await openGeneratedNumberPuzzle('calcudoku', next)).number, 3)
    assert.equal(await saveGeneratedNumberProgress('calcudoku', next, {
      position: noted, past: [[2, 0, 0]], future: [[2, 3, 0]],
    }), true)
    assert.deepEqual((await openGeneratedNumberPuzzle('calcudoku', next)).progress, saved)
    assert.deepEqual(storage.getItem(orphanKey), JSON.stringify(saved))

    // A reload can interrupt the database write after the move becomes visible.
    const pendingKey = `calcudoku.pending-position.v1.${next}`
    const newest = { values: [0, 0, 2], notes: [0, 0, 0], past: [[2, 0, 4]], future: [] }
    storage.setItem(pendingKey, JSON.stringify(newest))
    assert.deepEqual((await generatedNumberHistory('calcudoku')).at(-1)?.progress, newest)
    assert.deepEqual((await openGeneratedNumberPuzzle('calcudoku', next, { readOnlyIfSaved: true })).progress, newest)
    assert.equal(await saveGeneratedNumberProgress('calcudoku', next, {
      position: newest, past: [[2, 0, 4]], future: [],
    }), true)
    assert.equal(storage.getItem(pendingKey), null)
    assert.equal(await saveGeneratedNumberProgress('calcudoku', next, {
      position: newest, past: [[2, 0, 4]], future: [], clock: { elapsed: 0 },
    }), true)
    assert.deepEqual(await saveGeneratedNumberClock('calcudoku', next, 5), { elapsed: 5 })
    assert.equal(await saveGeneratedNumberClock('calcudoku', next, 'untimed'), 'untimed')
    assert.equal(await saveGeneratedNumberProgress('calcudoku', next, {
      position: newest, past: [[2, 0, 4]], future: [], clock: { elapsed: 9, finished: true }, lastPlayed: 1_790_000_000_000,
    }), true)
    assert.deepEqual((await openGeneratedNumberPuzzle('calcudoku', next)).progress, { ...newest, clock: 'untimed', lastPlayed: 1_790_000_000_000 })
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
