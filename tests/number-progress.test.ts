import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  loadNumberProgress, NUMBER_HISTORY_SIZE, parseNumberProgress, readNumberProgress, saveNumberProgress, type NumberProgress,
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
    storage.setItem(key, '{"values": [], "notes": false}')
    assert.equal(readNumberProgress(key), null)
    storage.setItem(key, '{')
    assert.equal(readNumberProgress(key), null)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
