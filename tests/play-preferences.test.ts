import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createPlayPreferenceStore, DEFAULT_PLAY_PREFERENCES, parsePlayPreferences, PLAY_PREFERENCES_KEY,
} from '../src/sudoku/play-preferences.ts'

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>()
  if (initial !== null) values.set(PLAY_PREFERENCES_KEY, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

test('play controls save immediately and survive a fresh app instance', () => {
  const storage = memoryStorage()
  const store = createPlayPreferenceStore(storage)
  store.set('pencil', true)
  store.set('selectedDigit', 7)
  store.set('candidateKind', 'center')
  store.set('selectedColor', 3)
  store.set('colorTarget', 'candidate')
  store.set('colorBrush', 5)
  store.set('highlightCandidatePairs', true)
  store.set('multi', true)
  store.set('puzzleBrowserView', 'saved')

  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), {
    ...DEFAULT_PLAY_PREFERENCES,
    pencil: true, selectedDigit: 7, candidateKind: 'center', selectedColor: 3,
    colorTarget: 'candidate', colorBrush: 5, highlightCandidatePairs: true, multi: true, puzzleBrowserView: 'saved',
  })
  assert.deepEqual(JSON.parse(storage.getItem(PLAY_PREFERENCES_KEY)!), store.getSnapshot())
  assert.deepEqual(store.getServerSnapshot(), DEFAULT_PLAY_PREFERENCES)
})

test('each input mode survives reload and switching modes remains exclusive', () => {
  const storage = memoryStorage()
  let store = createPlayPreferenceStore(storage)
  for (const mode of ['pencil', 'highlightMode', 'colorMode', 'eraseMode'] as const) {
    store.set(mode, true)
    const expected = { ...DEFAULT_PLAY_PREFERENCES, [mode]: true }
    assert.deepEqual(store.getSnapshot(), expected)
    store = createPlayPreferenceStore(storage)
    assert.deepEqual(store.getSnapshot(), expected)
    store.set(mode, (current) => !current)
    assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), DEFAULT_PLAY_PREFERENCES)
    store.set(mode, true)
  }
})

test('deselecting digits and colors persists null, and candidate color erasers preserve zero', () => {
  const storage = memoryStorage()
  const store = createPlayPreferenceStore(storage)
  store.set('selectedDigit', 9)
  store.set('selectedColor', 6)
  store.set('colorBrush', 6)
  store.set('selectedDigit', null)
  store.set('selectedColor', null)
  store.set('colorBrush', null)
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), DEFAULT_PLAY_PREFERENCES)
  store.set('selectedColor', 0)
  store.set('colorBrush', 0)
  const reloaded = createPlayPreferenceStore(storage).getSnapshot()
  assert.equal(reloaded.selectedColor, 0)
  assert.equal(reloaded.colorBrush, 0)
})

test('older partial settings gain new defaults without losing saved choices', () => {
  const storage = memoryStorage(JSON.stringify({ pencil: true, selectedDigit: 4 }))
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), {
    ...DEFAULT_PLAY_PREFERENCES, pencil: true, selectedDigit: 4,
  })
})

test('malformed values cannot arm invalid digits, colors, or conflicting modes', () => {
  for (const value of [-1, 0, 10, 2.5, '7', true, [], {}, Infinity, NaN]) {
    assert.equal(parsePlayPreferences({ selectedDigit: value }).selectedDigit, null)
  }
  const saved = parsePlayPreferences({
    pencil: true, highlightMode: true, colorMode: true, eraseMode: true,
    candidateKind: 'invalid', colorTarget: 'invalid', selectedColor: 7, colorBrush: -1,
    multi: 'true', highlightCandidatePairs: 1, puzzleBrowserView: 'invalid', selectedDigit: 8,
  })
  assert.deepEqual(saved, { ...DEFAULT_PLAY_PREFERENCES, eraseMode: true, selectedDigit: 8 })
  for (const value of [null, false, 7, 'bad', [], '{broken', { selectedDigit: 'bad', pencil: true }]) {
    const store = createPlayPreferenceStore(memoryStorage(typeof value === 'string' ? value : JSON.stringify(value)))
    assert.equal(store.getSnapshot().selectedDigit, null)
    assert.equal(store.getSnapshot().pencil, typeof value === 'object' && value !== null && 'pencil' in value)
  }
})

test('blocked reads and failed writes leave controls usable and notify subscribers', () => {
  const storage = {
    getItem(): never { throw new Error('Storage blocked') },
    setItem(): never { throw new Error('Storage full') },
  }
  const store = createPlayPreferenceStore(storage)
  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications++ })
  store.set('pencil', true)
  store.set('selectedDigit', 6)
  store.set('selectedDigit', 6)
  assert.equal(store.getSnapshot().pencil, true)
  assert.equal(store.getSnapshot().selectedDigit, 6)
  assert.equal(notifications, 2)
  unsubscribe()
  store.set('selectedDigit', null)
  assert.equal(notifications, 2)
})

test('one tab cannot overwrite unrelated settings saved by another tab', () => {
  const storage = memoryStorage()
  const first = createPlayPreferenceStore(storage)
  const second = createPlayPreferenceStore(storage)
  first.set('pencil', true)
  first.set('selectedDigit', 7)
  second.set('multi', true)
  second.set('puzzleBrowserView', 'saved')
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), {
    ...DEFAULT_PLAY_PREFERENCES, pencil: true, selectedDigit: 7, multi: true, puzzleBrowserView: 'saved',
  })
  // Other tabs do not change the active input mode in the middle of a move.
  assert.equal(second.getSnapshot().pencil, false)
  second.set('highlightMode', true)
  first.set('pencil', false)
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), {
    ...DEFAULT_PLAY_PREFERENCES, selectedDigit: 7, multi: true, puzzleBrowserView: 'saved',
  })
})

test('an older app tab preserves settings introduced by a newer app update', () => {
  const storage = memoryStorage(JSON.stringify({ pencil: true, futureSetting: { enabled: true } }))
  const store = createPlayPreferenceStore(storage)
  store.set('selectedDigit', 8)
  assert.deepEqual(JSON.parse(storage.getItem(PLAY_PREFERENCES_KEY)!).futureSetting, { enabled: true })
  assert.equal(createPlayPreferenceStore(storage).getSnapshot().pencil, true)
})

test('a later successful write recovers unsaved changes and keeps other tabs settings', () => {
  const storage = memoryStorage()
  let full = true
  const first = createPlayPreferenceStore({
    ...storage,
    setItem(key, value) {
      if (full) throw new Error('Storage full')
      storage.setItem(key, value)
    },
  })
  first.set('pencil', true)
  first.set('selectedDigit', 3)
  createPlayPreferenceStore(storage).set('multi', true)
  full = false
  first.set('candidateKind', 'center')
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), {
    ...DEFAULT_PLAY_PREFERENCES, pencil: true, selectedDigit: 3, multi: true, candidateKind: 'center',
  })
})
