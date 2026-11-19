import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlaySession, defaultMobileInput } from '../src/sudoku/play-session.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

test('the open input tabs, drawing mode, and pause state survive a reload in this tab', () => {
  const storage = new MemoryStorage()
  const session = createPlaySession(storage)
  session.set('puzzle-a', 'mobileInput', { open: ['colors', 'chains'], active: 'chains' })
  session.set('puzzle-a', 'drawingIntent', true)
  session.set('puzzle-a', 'launchPaused', true)

  const reloaded = createPlaySession(storage)
  reloaded.activate('puzzle-a')
  assert.deepEqual(reloaded.getSnapshot(), {
    puzzleId: 'puzzle-a', mobileInput: { open: ['colors', 'chains'], active: 'chains' },
    drawingIntent: true, launchPaused: true,
  })

  reloaded.set('puzzle-a', 'drawingIntent', false)
  reloaded.set('puzzle-a', 'launchPaused', false)
  assert.equal(createPlaySession(storage).getSnapshot().drawingIntent, false)
  assert.equal(createPlaySession(storage).getSnapshot().launchPaused, false)
  assert.equal(createPlaySession(new MemoryStorage()).getSnapshot().puzzleId, null)

  reloaded.activate('puzzle-b')
  assert.deepEqual(reloaded.getSnapshot(), {
    puzzleId: 'puzzle-b', mobileInput: defaultMobileInput, drawingIntent: null, launchPaused: false,
  })
})

test('a saved mobile tab must be one of the open tools', () => {
  const storage = new MemoryStorage()
  storage.setItem('sudoku-app:v1:play-session', JSON.stringify({
    puzzleId: 'puzzle-a', mobileInput: { open: ['colors', 'colors', 'unknown'], active: 'chains' },
    drawingIntent: 'true', launchPaused: true,
  }))
  assert.deepEqual(createPlaySession(storage).getSnapshot(), {
    puzzleId: 'puzzle-a', mobileInput: { open: ['colors'], active: 'digits' },
    drawingIntent: null, launchPaused: true,
  })
})

test('the Subsets tab survives a reload in this tab', () => {
  const storage = new MemoryStorage()
  createPlaySession(storage).set('puzzle-a', 'mobileInput', { open: ['chains', 'subsets'], active: 'subsets' })
  assert.deepEqual(createPlaySession(storage).getSnapshot().mobileInput, { open: ['chains', 'subsets'], active: 'subsets' })
})
