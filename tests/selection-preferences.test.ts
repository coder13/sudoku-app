import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPuzzleSelectionStore, parsePuzzleSelection, puzzleSelectionKey } from '../src/sudoku/selection-preferences.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

test('selected cells, the active cell, and the range anchor survive a reload', () => {
  const storage = memoryStorage()
  const store = createPuzzleSelectionStore('puzzle', 40, storage)
  store.set('active', 11)
  store.set('anchor', 1)
  store.set('selected', [1, 2, 10, 11])
  const expected = { active: 11, anchor: 1, selected: [1, 2, 10, 11] }
  assert.deepEqual(createPuzzleSelectionStore('puzzle', 40, storage).getSnapshot(), expected)
  assert.deepEqual(JSON.parse(storage.getItem(puzzleSelectionKey('puzzle'))!), expected)
  assert.deepEqual(store.getServerSnapshot(), { active: 40, anchor: 40, selected: [] })
})

test('switching puzzles restores only the selection for that puzzle', () => {
  const storage = memoryStorage()
  const first = createPuzzleSelectionStore('first', 40, storage)
  first.set('active', 0)
  first.set('anchor', 0)
  first.set('selected', [0])
  const second = createPuzzleSelectionStore('second', 12, storage)
  assert.deepEqual(second.getSnapshot(), { active: 12, anchor: 12, selected: [] })
  second.set('selected', [12, 13])
  assert.deepEqual(createPuzzleSelectionStore('first', 40, storage).getSnapshot(), { active: 0, anchor: 0, selected: [0] })
  assert.deepEqual(createPuzzleSelectionStore('second', 12, storage).getSnapshot().selected, [12, 13])
  first.set('selected', [])
  assert.deepEqual(createPuzzleSelectionStore('first', 40, storage).getSnapshot().selected, [])
})

test('invalid and duplicate cells cannot become restored selections', () => {
  assert.deepEqual(parsePuzzleSelection({ active: 81, anchor: -1, selected: [0, 80, 80, -1, 81, 2.5, '4', null] }, 40), {
    active: 40, anchor: 40, selected: [0, 80],
  })
  const storage = memoryStorage()
  storage.setItem(puzzleSelectionKey('broken'), '{broken')
  assert.deepEqual(createPuzzleSelectionStore('broken', 7, storage).getSnapshot(), { active: 7, anchor: 7, selected: [] })
  for (const value of [null, 42, [], 'bad']) {
    assert.deepEqual(parsePuzzleSelection(value, 40), { active: 40, anchor: 40, selected: [] })
  }
})

test('selection works with blocked storage and ignores unchanged cell lists', () => {
  const store = createPuzzleSelectionStore('blocked', 40, {
    getItem(): never { throw new Error('Blocked') },
    setItem(): never { throw new Error('Blocked') },
  })
  let notifications = 0
  store.subscribe(() => { notifications++ })
  store.set('selected', [4])
  store.set('selected', [4])
  store.set('selected', (previous) => [...previous, 5])
  assert.deepEqual(store.getSnapshot().selected, [4, 5])
  assert.equal(notifications, 2)
})
