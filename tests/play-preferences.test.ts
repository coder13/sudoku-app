import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createPlayPreferenceStore, DEFAULT_DESKTOP_INPUT_WIDTH, DEFAULT_DESKTOP_LAYOUT_WIDTH, DEFAULT_PLAY_PREFERENCES,
  parsePlayPreferences, PLAY_PREFERENCES_KEY,
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

test('overlay modes stay exclusive and keep the Pen or Pencil choice across reloads', () => {
  const storage = memoryStorage()
  let store = createPlayPreferenceStore(storage)
  assert.equal(store.getSnapshot().pencil, false)
  store.set('pencil', true)
  for (const mode of ['highlightMode', 'colorMode', 'eraseMode'] as const) {
    store.set(mode, true)
    const expected = { ...DEFAULT_PLAY_PREFERENCES, pencil: true, [mode]: true }
    assert.deepEqual(store.getSnapshot(), expected)
    store = createPlayPreferenceStore(storage)
    assert.deepEqual(store.getSnapshot(), expected)
    store.set(mode, false)
    assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), { ...DEFAULT_PLAY_PREFERENCES, pencil: true })
    store.set(mode, true)
  }
  store.set('eraseMode', false)
  store.set('pencil', false)
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), DEFAULT_PLAY_PREFERENCES)
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

test('experimental mode saves explicit choices and older settings use the environment default', () => {
  const storage = memoryStorage()
  const store = createPlayPreferenceStore(storage)
  assert.equal(store.getSnapshot().experimentalMode, null)
  for (const enabled of [true, false]) {
    store.set('experimentalMode', enabled)
    assert.equal(createPlayPreferenceStore(storage).getSnapshot().experimentalMode, enabled)
  }
  assert.equal(parsePlayPreferences({ experimentalMode: 'true' }).experimentalMode, null)
})

test('the mode badge position survives reloads and other play setting changes', () => {
  const storage = memoryStorage(JSON.stringify({ pencil: true }))
  const store = createPlayPreferenceStore(storage)
  const otherTab = createPlayPreferenceStore(storage)
  const position = { edge: 'right', offset: 0.37 } as const
  store.set('cardModeBadgePosition', position)
  otherTab.set('multi', true)
  const reloaded = createPlayPreferenceStore(storage)
  assert.deepEqual(reloaded.getSnapshot().cardModeBadgePosition, position)
  assert.equal(reloaded.getSnapshot().pencil, true)
  assert.equal(reloaded.getSnapshot().multi, true)
})

test('invalid card badge positions fall back to the default edge and offset', () => {
  for (const cardModeBadgePosition of [
    null, { edge: 'middle', offset: 0.5 }, { edge: 'left' }, { edge: 'right', offset: '0.5' },
    { edge: 'top', offset: -0.1 }, { edge: 'bottom', offset: 1.1 }, { edge: 'right', offset: Infinity },
  ]) {
    assert.deepEqual(parsePlayPreferences({ cardModeBadgePosition, pencil: true }), {
      ...DEFAULT_PLAY_PREFERENCES, pencil: true,
    })
  }
})

test('a saved grid badge position leaves the card badge at its bottom-right default', () => {
  const prefs = parsePlayPreferences({ modeBadgePosition: { edge: 'top', offset: 0.2 } })
  assert.deepEqual(prefs.cardModeBadgePosition, { edge: 'bottom', offset: 0.95 })
})

test('desktop layout width persists and can be reset without clearing other preferences', () => {
  const storage = memoryStorage(JSON.stringify({ selectedDigit: 6, desktopLayoutWidth: 1520 }))
  const store = createPlayPreferenceStore(storage)
  assert.equal(store.getSnapshot().desktopLayoutWidth, 1520)
  store.set('desktopLayoutWidth', 940)
  assert.equal(createPlayPreferenceStore(storage).getSnapshot().desktopLayoutWidth, 940)
  store.set('desktopLayoutWidth', DEFAULT_DESKTOP_LAYOUT_WIDTH)
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), { ...DEFAULT_PLAY_PREFERENCES, selectedDigit: 6 })
  for (const desktopLayoutWidth of [0, -1, 760.5, '1520', Infinity]) {
    assert.equal(parsePlayPreferences({ desktopLayoutWidth }).desktopLayoutWidth, DEFAULT_DESKTOP_LAYOUT_WIDTH)
  }
})

test('both desktop panel widths save and reset independently of the outer width', () => {
  const storage = memoryStorage(JSON.stringify({ desktopLayoutWidth: 1520 }))
  const store = createPlayPreferenceStore(storage)
  const widths = { input: 360, puzzle: 631 }
  store.set('desktopPanelWidths', widths)
  const reloaded = createPlayPreferenceStore(storage)
  assert.deepEqual(reloaded.getSnapshot().desktopPanelWidths, widths)
  reloaded.set('desktopPanelWidths', DEFAULT_PLAY_PREFERENCES.desktopPanelWidths)
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot(), {
    ...DEFAULT_PLAY_PREFERENCES, desktopLayoutWidth: 1520,
  })
})

test('the desktop split restores earlier input widths and validates saved pairs', () => {
  assert.deepEqual(parsePlayPreferences({ desktopInputWidth: 550 }).desktopPanelWidths, { input: 550, puzzle: null })
  assert.deepEqual(parsePlayPreferences({
    desktopInputWidth: 550, desktopPanelWidths: { input: DEFAULT_DESKTOP_INPUT_WIDTH, puzzle: null },
  }).desktopPanelWidths, DEFAULT_PLAY_PREFERENCES.desktopPanelWidths)
  for (const desktopPanelWidths of [
    null, { input: 323, puzzle: 600 }, { input: 420, puzzle: 259 }, { input: 420, puzzle: 900 }, { input: '500', puzzle: 400 },
  ]) {
    assert.deepEqual(parsePlayPreferences({ desktopPanelWidths }).desktopPanelWidths, DEFAULT_PLAY_PREFERENCES.desktopPanelWidths)
  }
})

test('malformed values cannot arm invalid digits, colors, or conflicting modes', () => {
  for (const value of [-1, 0, 10, 2.5, '7', true, [], {}, Infinity, NaN]) {
    assert.equal(parsePlayPreferences({ selectedDigit: value }).selectedDigit, null)
  }
  const saved = parsePlayPreferences({
    pencil: true, highlightMode: true, colorMode: true, eraseMode: true,
    candidateKind: 'invalid', colorTarget: 'invalid', selectedColor: 13, colorBrush: -1,
    multi: 'true', highlightCandidatePairs: 1, puzzleBrowserView: 'invalid', selectedDigit: 8,
  })
  assert.deepEqual(saved, { ...DEFAULT_PLAY_PREFERENCES, pencil: true, eraseMode: true, selectedDigit: 8 })
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

test('pinned puzzle buttons persist in order and ignore invalid saved entries', () => {
  const storage = memoryStorage()
  const store = createPlayPreferenceStore(storage)
  assert.deepEqual(store.getSnapshot().pinnedActions, [])
  store.set('pinnedActions', ['colors', 'candidates', 'hint'])
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot().pinnedActions, ['colors', 'candidates', 'hint'])
  store.set('pinnedActions', ['hint', 'colors'])
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot().pinnedActions, ['hint', 'colors'])
  assert.deepEqual(parsePlayPreferences({ pinnedActions: ['hint', 'unknown', 'hint', null, 'chain', 3] }).pinnedActions, ['hint', 'chain'])
  for (const pinnedActions of [null, true, 5, 'hint', {}]) {
    assert.deepEqual(parsePlayPreferences({ pinnedActions }).pinnedActions, [])
  }
})

test('refreshing pinned buttons keeps local tool settings and pending pin edits', () => {
  const storage = memoryStorage(JSON.stringify({ pinnedActions: ['hint'], pencil: false }))
  let full = false
  const store = createPlayPreferenceStore({
    ...storage,
    setItem(key, value) {
      if (full) throw new Error('Storage full')
      storage.setItem(key, value)
    },
  })
  const other = createPlayPreferenceStore(storage)
  let notifications = 0
  store.subscribe(() => { notifications++ })
  other.set('pencil', true)
  other.set('pinnedActions', ['colors', 'check'])
  store.refreshPinnedActions()
  store.refreshPinnedActions()
  assert.deepEqual(store.getSnapshot().pinnedActions, ['colors', 'check'])
  assert.equal(store.getSnapshot().pencil, false)
  assert.equal(notifications, 1)

  full = true
  store.set('pinnedActions', ['undo'])
  other.set('pinnedActions', ['redo'])
  store.refreshPinnedActions()
  assert.deepEqual(store.getSnapshot().pinnedActions, ['undo'])
  full = false
  store.set('multi', true)
  assert.deepEqual(createPlayPreferenceStore(storage).getSnapshot().pinnedActions, ['undo'])
})
