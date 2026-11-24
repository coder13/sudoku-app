import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlaySession, defaultDigitHighlight, defaultToolPanels, puzzleTabsKey } from '../src/sudoku/play-session.ts'
import { PLAY_PREFERENCES_KEY } from '../src/sudoku/play-preferences.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

test('the open input tabs, drawing mode, and pause state survive a reload in this tab', () => {
  const storage = new MemoryStorage()
  const session = createPlaySession(storage)
  session.set('puzzle-a', 'toolPanels', { open: ['colors', 'chains'], active: 'chains' })
  session.set('puzzle-a', 'drawingIntent', true)
  session.set('puzzle-a', 'launchPaused', true)

  const reloaded = createPlaySession(storage)
  reloaded.activate('puzzle-a')
  assert.deepEqual(reloaded.getSnapshot(), {
    puzzleId: 'puzzle-a', toolPanels: { open: ['colors', 'chains'], active: 'chains' },
    drawingIntent: true, launchPaused: true,
    digitHighlight: defaultDigitHighlight, showStrongLinks: false, solutionView: null,
  })

  reloaded.set('puzzle-a', 'drawingIntent', false)
  reloaded.set('puzzle-a', 'launchPaused', false)
  assert.equal(createPlaySession(storage).getSnapshot().drawingIntent, false)
  assert.equal(createPlaySession(storage).getSnapshot().launchPaused, false)
  assert.equal(createPlaySession(new MemoryStorage()).getSnapshot().puzzleId, null)

  reloaded.activate('puzzle-b')
  assert.deepEqual(reloaded.getSnapshot(), {
    puzzleId: 'puzzle-b', toolPanels: { open: ['colors', 'chains'], active: 'chains' }, drawingIntent: null, launchPaused: false,
    digitHighlight: defaultDigitHighlight, showStrongLinks: false, solutionView: null,
  })
})

test('pinned Rules survives a reload in the shared puzzle tool layout', () => {
  const storage = new MemoryStorage()
  const persistent = new MemoryStorage()
  const layout = { open: ['chains', 'rules'] as const, active: 'rules' as const }
  createPlaySession(storage, persistent).set('mixed-puzzle', 'toolPanels', { ...layout, open: [...layout.open] })
  const reloaded = createPlaySession(new MemoryStorage(), persistent)
  reloaded.activate('mixed-puzzle')
  assert.deepEqual(reloaded.getSnapshot().toolPanels, layout)
})

test('a saved mobile tab must be one of the open tools', () => {
  const storage = new MemoryStorage()
  storage.setItem('sudoku-app:v1:play-session', JSON.stringify({
    puzzleId: 'puzzle-a', toolPanels: { open: ['colors', 'colors', 'unknown'], active: 'chains' },
    drawingIntent: 'true', launchPaused: true,
  }))
  assert.deepEqual(createPlaySession(storage).getSnapshot(), {
    puzzleId: 'puzzle-a', toolPanels: { open: ['colors'], active: 'digits' },
    drawingIntent: null, launchPaused: true,
    digitHighlight: defaultDigitHighlight, showStrongLinks: false, solutionView: null,
  })
})

test('saved tab state can resume on app relaunch without restoring a launch pause', () => {
  const persistent = new MemoryStorage()
  const session = createPlaySession(new MemoryStorage(), persistent)
  session.set('puzzle-a', 'toolPanels', { open: ['solution', 'chains'], active: 'solution', height: 308 })
  session.set('puzzle-a', 'digitHighlight', { mask: 10, match: 'any' })
  session.set('puzzle-a', 'showStrongLinks', true)
  session.set('puzzle-a', 'drawingIntent', false)
  session.set('puzzle-a', 'solutionView', { identity: 'givens-a', step: 7, hintOpen: true })
  session.set('puzzle-a', 'launchPaused', true)
  session.activate('puzzle-b')
  assert.deepEqual(session.getSnapshot().toolPanels, { open: ['solution', 'chains'], active: 'solution' })
  assert.equal(session.getSnapshot().solutionView, null)

  const relaunched = createPlaySession(new MemoryStorage(), persistent)
  relaunched.activate('puzzle-a')
  assert.deepEqual(relaunched.getSnapshot(), {
    puzzleId: 'puzzle-a', launchPaused: false,
    toolPanels: { open: ['solution', 'chains'], active: 'solution', height: 308 },
    digitHighlight: { mask: 10, match: 'any' },
    showStrongLinks: true, drawingIntent: false,
    solutionView: { identity: 'givens-a', step: 7, hintOpen: true },
  })
})

test('older digit groups restore their mask and match without a mode override', () => {
  const persistent = new MemoryStorage()
  persistent.setItem(puzzleTabsKey('puzzle-a'), JSON.stringify({
    digitHighlight: { mask: 10, match: 'any', modeOverridden: true },
  }))
  const session = createPlaySession(new MemoryStorage(), persistent)
  session.activate('puzzle-a')
  assert.deepEqual(session.getSnapshot().digitHighlight, { mask: 10, match: 'any' })
})

test('a new puzzle inherits the last layout after leaving play, and existing puzzles keep their own tabs', () => {
  const persistent = new MemoryStorage()
  const session = createPlaySession(new MemoryStorage(), persistent)
  const layout = { open: ['techniques'], active: 'techniques' } as const
  session.set('puzzle-a', 'toolPanels', { ...layout, open: [...layout.open] })
  session.activate(null)

  const reloaded = createPlaySession(new MemoryStorage(), persistent)
  reloaded.set('puzzle-b', 'launchPaused', false)
  assert.deepEqual(reloaded.getSnapshot().toolPanels, layout)
  reloaded.set('puzzle-b', 'toolPanels', defaultToolPanels)
  reloaded.activate('puzzle-c')
  assert.deepEqual(reloaded.getSnapshot().toolPanels, defaultToolPanels)

  reloaded.activate('puzzle-a')
  assert.deepEqual(reloaded.getSnapshot().toolPanels, layout)
  reloaded.activate('puzzle-d')
  assert.deepEqual(reloaded.getSnapshot().toolPanels, layout)
})

test('the previous session-only format is promoted to the puzzle save', () => {
  const storage = new MemoryStorage()
  const persistent = new MemoryStorage()
  storage.setItem('sudoku-app:v1:play-session', JSON.stringify({
    puzzleId: 'puzzle-a', mobileInput: { open: ['techniques'], active: 'techniques' },
  }))
  createPlaySession(storage, persistent)
  assert.ok(persistent.getItem(puzzleTabsKey('puzzle-a')))
  const relaunched = createPlaySession(new MemoryStorage(), persistent)
  relaunched.activate('puzzle-a')
  assert.deepEqual(relaunched.getSnapshot().toolPanels, { open: ['techniques'], active: 'techniques' })
})

test('legacy desktop views migrate into the shared layout without reopening a closed tool', () => {
  const persistent = new MemoryStorage()
  persistent.setItem(PLAY_PREFERENCES_KEY, JSON.stringify({ desktopViews: { open: ['chains', 'unknown', 'colors', 'chains'], active: 'solution' } }))
  const session = createPlaySession(new MemoryStorage(), persistent)
  session.activate('desktop-puzzle')
  assert.deepEqual(session.getSnapshot().toolPanels, { open: ['colors', 'chains'], active: 'colors' })
  session.set('desktop-puzzle', 'toolPanels', defaultToolPanels)
  const reloaded = createPlaySession(new MemoryStorage(), persistent)
  reloaded.activate('next-puzzle')
  assert.deepEqual(reloaded.getSnapshot().toolPanels, defaultToolPanels)
  reloaded.activate('desktop-puzzle')
  assert.deepEqual(reloaded.getSnapshot().toolPanels, defaultToolPanels)
})

test('a saved mobile selection takes priority over legacy desktop preferences', () => {
  const persistent = new MemoryStorage()
  persistent.setItem(PLAY_PREFERENCES_KEY, JSON.stringify({ colorsPanelOpen: true }))
  persistent.setItem('sudoku-app:v1:techniques-card-open', 'true')
  persistent.setItem(puzzleTabsKey('mobile-puzzle'), JSON.stringify({ mobileInput: { open: ['solution'], active: 'solution', height: 308 } }))
  const session = createPlaySession(new MemoryStorage(), persistent)
  session.activate('desktop-puzzle')
  assert.deepEqual(session.getSnapshot().toolPanels, { open: ['techniques', 'colors'], active: 'colors' })
  session.activate('mobile-puzzle')
  assert.deepEqual(session.getSnapshot().toolPanels, { open: ['solution'], active: 'solution', height: 308 })
})

test('saved mobile tools restore in display order and keep the selected tab', () => {
  const storage = new MemoryStorage()
  storage.setItem('sudoku-app:v1:play-session', JSON.stringify({
    puzzleId: 'puzzle-a',
    toolPanels: { open: ['subsets', 'techniques', 'chains', 'solution', 'colors'], active: 'techniques' },
  }))
  assert.deepEqual(createPlaySession(storage).getSnapshot().toolPanels, {
    open: ['solution', 'techniques', 'colors', 'chains'], active: 'techniques',
  })
})
