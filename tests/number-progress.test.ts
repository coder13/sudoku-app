import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadNumberProgress, NUMBER_HISTORY_SIZE, saveNumberProgress } from '../src/number-puzzles/progress.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

const key = 'calcudoku.position.v1.easy-1'
const editable = [true, false, true]
const empty = { values: [0, 0, 0], notes: [0, 0, 0] }
const noted = { values: [0, 0, 0], notes: [0, 0, 4] }
const filled = { values: [0, 0, 3], notes: [0, 0, 0] }

test('number game progress reads old saves and saves both history stacks with the current board', () => {
  const storage = new MemoryStorage()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    storage.setItem(key, JSON.stringify(noted))
    assert.deepEqual(loadNumberProgress(key, editable, 4), { position: noted, past: [], future: [] })

    const progress = { position: noted, past: [empty], future: [filled] }
    assert.equal(saveNumberProgress(key, progress), true)
    assert.deepEqual(loadNumberProgress(key, editable, 4), progress)

    const past = [filled, ...Array.from({ length: NUMBER_HISTORY_SIZE }, () => empty)]
    storage.setItem(key, JSON.stringify({
      ...noted, past, future: [filled, { values: [0], notes: [0] }],
    }))
    assert.deepEqual(loadNumberProgress(key, editable, 4), {
      position: noted, past: past.slice(1), future: [],
    })
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
