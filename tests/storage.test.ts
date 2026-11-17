import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, enter, makeGame, paintCandidate, restartGame, STARTER_GAME, undo } from '../src/sudoku/game.ts'
import { addRatingHints, placementHintKey, PLAYER_RATING_VERSION, type RatingAttempt, type RatingEvent } from '../src/sudoku/player-rating.ts'
import { recordAction } from '../src/sudoku/action-history.ts'
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

test('action history survives a reload and corrupt history does not discard the puzzle', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?action-history')
    const original = makeGame('history', 'History', EMPTY, 'custom')
    roomStore.add(original)
    roomStore.update(original.id, (game) => recordAction(game, enter(game, [0], 'value', 3)))
    const saved = roomStore.getSnapshot().games[0]
    const reloaded = (await import('../src/sudoku/storage.ts?action-history-reload')).roomStore
    assert.deepEqual(reloaded.getSnapshot().games[0].actionHistory, JSON.parse(JSON.stringify(saved.actionHistory)))
    assert.ok(reloaded.getSnapshot().games[0].actionHistory![0].pending)
    local.setItem('sudoku-app:v1:game:history', JSON.stringify({ ...saved, actionHistory: [null] }))
    const recovered = (await import('../src/sudoku/storage.ts?action-history-corrupt')).roomStore
    assert.equal(recovered.getSnapshot().games[0].position.entries[0], '3')
    assert.equal(recovered.getSnapshot().games[0].actionHistory, undefined)
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

test('an upgrade preserves production rating evidence and records later solves under the new rules', async () => {
  const local = new MemoryStorage()
  const prefix = 'sudoku-app:v1:'
  const outcome: RatingEvent = {
    id: 'old-outcome', gameId: 'deleted-solve', givens: STARTER_GAME.givens, difficulty: 'medium',
    at: 1, finish: 'solved', elapsed: 90, viewed: 0, applied: 0,
  }
  const oldRecord = JSON.stringify(outcome)
  local.setItem(prefix + 'rating-result:' + outcome.id, oldRecord)
  const givens = '034678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const attempt: RatingAttempt = {
    grade: { difficulty: 'hard', points: 960, scoringVersion: 10, techniqueOrder: ['full-house'] },
    viewed: ['p0:5', 'p1:3'], applied: [], requested: ['first-position', 'second-position'],
    priorElapsed: 0, lastHintAt: 2,
  }
  const puzzle = { ...makeGame('in-progress', 'A saved puzzle', givens, 'generated'), elapsed: 120,
    difficulty: 'hard' as const, ratingAttempt: attempt }
  local.setItem(prefix + 'game:' + puzzle.id, JSON.stringify(puzzle))

  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?prod-rating-upgrade')
    const old = roomStore.getSnapshot().playerRating
    assert.ok(Math.abs(old.rating - 946.9965032228188) < 1e-10)
    assert.equal(old.recommended, 'medium')
    assert.equal(old.results.get(outcome.gameId)?.after, 951)
    assert.equal(old.results.get(puzzle.id)?.event.finish, 'hints')

    roomStore.update(puzzle.id, game => enter(game, [0], 'value', 5))
    const updated = roomStore.getSnapshot().playerRating
    assert.equal(updated.count, 2)
    assert.deepEqual(updated.results.get(outcome.gameId), old.results.get(outcome.gameId))
    const solved = updated.results.get(puzzle.id)
    assert.equal(solved?.before, 951)
    assert.equal(solved?.event.finish, 'solved')
    assert.equal(solved?.event.difficulty, 'hard')
    assert.equal(solved?.event.hintsRequested, 2)
    assert.equal(solved?.event.ratingVersion, PLAYER_RATING_VERSION)
    assert.equal(local.getItem(prefix + 'rating-result:' + outcome.id), oldRecord)

    const { roomStore: reloaded } = await import('../src/sudoku/storage.ts?prod-rating-upgrade-reload')
    assert.deepEqual(reloaded.getSnapshot().playerRating, updated)
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
