import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, enter, makeGame, paintCandidate, restartGame, STARTER_GAME, undo } from '../src/sudoku/game.ts'
import { addRatingHints, placementHintKey } from '../src/sudoku/player-rating.ts'
import { createPuzzleSelectionStore, puzzleSelectionKey } from '../src/sudoku/selection-preferences.ts'

class MemoryStorage {
  get length() { return Object.keys(this).length }

  key(index: number) { return Object.keys(this)[index] ?? null }

  getItem(key: string) {
    const values = this as unknown as Record<string, unknown>
    return Object.hasOwn(values, key) ? String(values[key]) : null
  }

  setItem(key: string, value: string) {
    Object.defineProperty(this, key, { value: String(value), writable: true, enumerable: true, configurable: true })
  }

  removeItem(key: string) { delete (this as unknown as Record<string, unknown>)[key] }

  clear() { Object.keys(this).forEach((key) => this.removeItem(key)) }
}

test('deleting a puzzle also deletes its saved cell selection', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?selection-test')
    for (const id of ['remove', 'keep']) {
      roomStore.add(makeGame(id, id, EMPTY, 'custom'))
      createPuzzleSelectionStore(id, 40, local).set('selected', [4])
    }
    roomStore.remove('remove')
    assert.equal(local.getItem(puzzleSelectionKey('remove')), null)
    assert.notEqual(local.getItem(puzzleSelectionKey('keep')), null)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('the puzzle library hydrates synchronously when the client module reloads', async () => {
  const local = new MemoryStorage()
  const session = new MemoryStorage()
  const initial = makeGame('hot-reload', 'Hot reload', EMPTY, 'custom')
  const marked = enter(enter(initial, [4], 'corner', 7), [4], 'center', 3)
  const rose = paintCandidate(marked, { cell: 4, digit: 7 }, 1)
  const mixed = paintCandidate(rose, { cell: 4, digit: 3 }, 6)
  const game = undo(paintCandidate(mixed, { cell: 4, digit: 3 }, 0))
  local.setItem('sudoku-app:v1:game:hot-reload', JSON.stringify(game))
  local.setItem('sudoku-app:v1:game:warmup', JSON.stringify(STARTER_GAME))
  local.setItem('sudoku-app:v1:initialized', '1')
  local.setItem('sudoku-app:v1:active', game.id)

  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: session, configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts')
    const snapshot = roomStore.getSnapshot()
    assert.equal(snapshot.active, game.id)
    const saved = snapshot.games.find(({ id }) => id === game.id)
    assert.equal(saved?.position.corner[4], 1 << 6)
    assert.deepEqual(saved?.position.candidateColors, { 4: { 3: 6, 7: 1 } })
    assert.deepEqual(saved?.past.at(-1)?.candidateColors, { 4: { 7: 1 } })
    assert.deepEqual(saved?.future.at(-1)?.candidateColors, { 4: { 7: 1 } })
    assert.equal(snapshot.games.some(({ id }) => id === STARTER_GAME.id), false)
    assert.equal(local.getItem('sudoku-app:v1:game:warmup'), null)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('rating survives reset, interrupted saves, and deleting or replaying a puzzle', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?rating-test')
    const givens = '034678912672195348198342567859761423426853791713924856961537284287419635345286179'
    const puzzle = makeGame('first-rated', 'Rated puzzle', givens, 'generated')
    const ratingAttempt = {
      grade: { difficulty: 'easy' as const, points: 4, scoringVersion: 10, techniqueOrder: ['full-house'] },
      viewed: [], applied: [], priorElapsed: 0,
    }
    roomStore.add({ ...puzzle, difficulty: 'easy', generatedWithAuto: true, ratingAttempt, elapsed: 60 })
    const hint = placementHintKey(0, 5)
    roomStore.update(puzzle.id, (game) => ({ ...game, ratingAttempt: addRatingHints(game.ratingAttempt!, [hint]) }))
    roomStore.update(puzzle.id, restartGame)
    roomStore.update(puzzle.id, (game) => ({
      ...enter(game, [0], 'value', 5), ratingAttempt: addRatingHints(game.ratingAttempt!, [hint], true),
    }))
    const result = roomStore.getSnapshot().playerRating.results.get(puzzle.id)
    assert.equal(result?.event.elapsed, 60)
    assert.equal(result?.event.viewed, 1)
    assert.equal(result?.event.applied, 1)
    local.removeItem(`sudoku-app:v1:rating-result:${result!.event.id}`)

    const fresh = (await import('../src/sudoku/storage.ts?rating-reload')).roomStore
    assert.deepEqual(fresh.getSnapshot().playerRating.results.get(puzzle.id), result)
    assert.equal(fresh.getSnapshot().games[0].generatedWithAuto, true)
    assert.equal(fresh.getSnapshot().games[0].difficulty, 'easy')
    assert.ok(local.getItem(`sudoku-app:v1:rating-result:${result!.event.id}`))
    fresh.remove(puzzle.id)
    const replay = { ...puzzle, id: 'replay', ratingAttempt }
    fresh.add(replay)
    fresh.update(replay.id, (game) => enter(game, [0], 'value', 5))
    assert.equal(fresh.getSnapshot().games[0].ratingAttempt, undefined)
    assert.equal(fresh.getSnapshot().playerRating.count, 1)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('saving an imported puzzle for later preserves the selected puzzle', async () => {
  const local = new MemoryStorage()
  const session = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: session, configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?import-test')
    const active = makeGame('current-game', 'Current puzzle', STARTER_GAME.givens, 'custom')
    roomStore.add(active)
    const imported = makeGame('imported-game', 'Imported puzzle', EMPTY, 'imported')
    roomStore.add({ ...imported, savedForLater: true })
    assert.equal(roomStore.getSnapshot().active, active.id)
    assert.equal(local.getItem('sudoku-app:v1:active'), active.id)
    assert.equal(session.getItem('sudoku-app:v1:active'), active.id)
    assert.equal(roomStore.getSnapshot().games.find(({ id }) => id === imported.id)?.savedForLater, true)

    const { roomStore: reloaded } = await import('../src/sudoku/storage.ts?import-reload')
    assert.equal(reloaded.getSnapshot().active, active.id)
    assert.equal(reloaded.getSnapshot().games.find(({ id }) => id === imported.id)?.savedForLater, true)
    reloaded.select(imported.id)
    assert.equal(reloaded.getSnapshot().active, imported.id)
    assert.equal(reloaded.getSnapshot().games.find(({ id }) => id === imported.id)?.savedForLater, undefined)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})
