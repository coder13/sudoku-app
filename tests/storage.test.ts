import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { EMPTY, enter, makeGame, paintCandidate, puzzleIdentity, restartGame, STARTER_GAME, redo, undo } from '../src/sudoku/game.ts'
import { addRatingHints, placementHintKey, PLAYER_RATING_VERSION, ratingAttemptFor, type RatingAttempt, type RatingEvent } from '../src/sudoku/player-rating.ts'
import { recordAction } from '../src/sudoku/action-history.ts'
import { createPuzzleSelectionStore, puzzleSelectionKey } from '../src/sudoku/selection-preferences.ts'
import { mixedFixtures } from './helpers/mixed-fixtures.ts'
import { WINDOKU_REGIONS } from '../src/sudoku/variants.ts'
import { puzzleTiming } from '../src/sudoku/puzzle-timing.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'

test('readable puzzles remain available when initializing storage cannot write', async () => {
  const local = new MemoryStorage()
  const original = makeGame('read-only', 'Read-only storage', EMPTY, 'custom')
  const played = undo(enter(enter(original, [4], 'corner', 7), [3], 'value', 2))
  local.setItem('sudoku-app:v1:game:read-only', JSON.stringify(played))
  local.setItem('sudoku-app:v1:active', played.id)
  Object.defineProperty(local, 'setItem', { value: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError') } })
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?read-only-initialization')
    const snapshot = roomStore.getSnapshot()
    assert.equal(snapshot.storageAvailable, false)
    assert.equal(snapshot.active, played.id)
    assert.deepEqual(snapshot.games, [JSON.parse(JSON.stringify(played))])
    assert.deepEqual(redo(snapshot.games[0]).position, redo(played).position)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('legacy library migration preserves newer records, session selection, progress, and undo', async () => {
  const local = new MemoryStorage()
  const session = new MemoryStorage()
  const legacy = makeGame('legacy', 'Legacy puzzle', EMPTY, 'custom', 1)
  const edited = enter(enter(legacy, [4], 'corner', 7), [3], 'value', 2)
  const newer = { ...undo(edited), elapsed: 137, saved: true, difficulty: 'unfair' as const }
  const savedForLater = { ...makeGame('later', 'Saved puzzle', EMPTY, 'imported', 2), savedForLater: true as const }
  local.setItem('gridroom:v1:game:legacy', JSON.stringify(legacy))
  local.setItem('sudoku-app:v1:game:legacy', JSON.stringify(newer))
  local.setItem('gridroom:v1:game:later', JSON.stringify(savedForLater))
  local.setItem('gridroom:v1:initialized', '1')
  local.setItem('gridroom:v1:active', 'missing-puzzle')
  session.setItem('gridroom:v1:active', newer.id)
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: session, configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?legacy-library-integrity')
    const snapshot = roomStore.getSnapshot()
    assert.equal(snapshot.storageAvailable, true)
    assert.equal(snapshot.active, newer.id)
    assert.equal(snapshot.games.length, 2)
    assert.deepEqual(snapshot.games.find(game => game.id === newer.id), JSON.parse(JSON.stringify(newer)))
    assert.deepEqual(redo(snapshot.games.find(game => game.id === newer.id)!).position, edited.position)
    assert.equal(snapshot.games.find(game => game.id === savedForLater.id)?.savedForLater, true)
    assert.ok(Object.keys(local).every(key => !key.startsWith('gridroom:v1:')))
    assert.equal(session.getItem('sudoku-app:v1:active'), newer.id)
    assert.equal(session.getItem('gridroom:v1:active'), null)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('isolated corruption and invalid optional metadata do not hide the rest of the saved library', async () => {
  const local = new MemoryStorage()
  const original = enter(makeGame('recover', 'Recover this puzzle', EMPTY, 'custom'), [2], 'value', 4)
  const corruptedMetadata = { ...original, difficulty: 'nonexistent-level', score: -1, actionHistory: [null],
    candidatesInitialized: 'yes', savedForLater: 'yes', ratingAttempt: { viewed: [] }, collection: { bad: true } }
  local.setItem('sudoku-app:v1:game:recover', JSON.stringify(corruptedMetadata))
  local.setItem('sudoku-app:v1:game:broken-json', '{"broken"')
  local.setItem('sudoku-app:v1:game:null', 'null')
  local.setItem('sudoku-app:v1:game:broken-position', JSON.stringify({ ...original, id: 'broken-position', position: {} }))
  local.setItem('sudoku-app:v1:active', 'broken-json')
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?corruption-isolation')
    const snapshot = roomStore.getSnapshot()
    assert.equal(snapshot.active, original.id)
    assert.equal(snapshot.games.length, 1)
    assert.deepEqual(snapshot.games[0].position, original.position)
    assert.deepEqual(snapshot.games[0].past, original.past)
    for (const key of ['difficulty', 'score', 'actionHistory', 'candidatesInitialized', 'savedForLater', 'ratingAttempt', 'collection'] as const) {
      assert.equal(snapshot.games[0][key], undefined, key)
    }
    assert.equal(local.getItem('sudoku-app:v1:game:broken-json'), '{"broken"', 'recovery does not erase unreadable evidence')
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('repeated play, undo, redo, and reset preserve their state through reloads', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    let store = (await import('../src/sudoku/storage.ts?repeated-reload-0')).roomStore
    let expected = { ...makeGame('stress-reload', 'Reload stress', EMPTY, 'custom'), saved: true }
    store.add(expected)
    for (let step = 0; step < 180; step++) {
      const update = step % 11 === 0 ? undo : step % 13 === 0 ? redo :
        (game: typeof expected) => enter(game, [step % 81], step % 3 === 0 ? 'value' : step % 3 === 1 ? 'corner' : 'center', step % 9 + 1)
      expected = update(expected)
      store.update(expected.id, update)
      if (step % 9 === 0) {
        store = (await import(`../src/sudoku/storage.ts?repeated-reload-${step + 1}`)).roomStore
        assert.deepEqual(store.getSnapshot().games[0], JSON.parse(JSON.stringify(expected)), 'reload after edit ' + step)
      }
    }
    const reset = restartGame(expected)
    store.update(expected.id, restartGame)
    const reloaded = (await import('../src/sudoku/storage.ts?reset-reload-final')).roomStore
    assert.deepEqual(reloaded.getSnapshot().games[0], JSON.parse(JSON.stringify(reset)))
    assert.equal(reset.position.entries, EMPTY)
    assert.equal(reset.past.length, 0)
    assert.equal(reset.future.length, 0)
    assert.equal(reset.saved, true)
    assert.equal(reset.elapsed, 0)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('historical variant identity ordering preserves rating outcomes and prevents replay credit after deletion', async () => {
  const local = new MemoryStorage()
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const givens = '0' + solution.slice(1)
  const regions: VariantPuzzle['regions'] = { type: 'jigsaw', regions: Array.from({ length: 9 }, (_, box) =>
    Array.from({ length: 9 }, (_, offset) => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(offset / 3) * 9 + offset % 3)) }
  const legacyPuzzle: VariantPuzzle = { regions, givens, version: 1 }
  const legacyIdentity = 'jigsaw:' + JSON.stringify(legacyPuzzle)
  const variant = { id: 'jigsaw' as const, puzzle: legacyPuzzle, solution }
  const original = { ...makeGame('old-variant', 'Old variant', givens, 'generated'), variant }
  const event: RatingEvent = { id: 'old-variant-outcome', gameId: original.id, givens, puzzleKey: legacyIdentity,
    at: 1, finish: 'solved', elapsed: 100, viewed: 0, applied: 0, difficulty: 'easy', ratingVersion: PLAYER_RATING_VERSION }
  const attempt = ratingAttemptFor({ difficulty: 'easy', points: 4, scoringVersion: 10, techniqueOrder: ['full-house'] })
  const saved = { ...original, difficulty: 'easy', ratingAttempt: { ...attempt, outcome: event } }
  const rawEvent = JSON.stringify(event)
  local.setItem('sudoku-app:v1:game:old-variant', JSON.stringify(saved))
  local.setItem('sudoku-app:v1:rating-result:' + event.id, rawEvent)
  local.setItem('sudoku-app:v1:seen-puzzle:' + legacyIdentity, original.id)
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const store = (await import('../src/sudoku/storage.ts?legacy-variant-outcome')).roomStore
    assert.deepEqual(store.getSnapshot().games[0].ratingAttempt?.outcome, event, 'the original attempt is retained')
    assert.equal(store.getSnapshot().playerRating.count, 1)
    assert.equal(store.getSnapshot().playerRating.results.get(original.id)?.event.puzzleKey, puzzleIdentity(original))
    assert.equal(local.getItem('sudoku-app:v1:rating-result:' + event.id), rawEvent, 'historical rating evidence is not rewritten')

    local.removeItem('sudoku-app:v1:game:old-variant')
    const reloaded = (await import('../src/sudoku/storage.ts?legacy-variant-replay')).roomStore
    const replay = { ...makeGame('new-variant', 'Replayed variant', givens, 'generated'), ratingAttempt: attempt,
      variant: { ...variant, puzzle: { version: 1 as const, givens, regions } } }
    reloaded.add(replay)
    assert.equal(reloaded.getSnapshot().games[0].ratingAttempt, undefined, 'old seen keys prevent new replay credit')
    assert.equal(reloaded.getSnapshot().playerRating.count, 1)
    assert.equal(local.getItem('sudoku-app:v1:rating-result:' + event.id), rawEvent)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

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

test('switching keeps both puzzles active and explicitly filing preserves undo and redo after reload', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?save-on-switch')
    const first = enter(makeGame('first', 'First puzzle', EMPTY, 'imported'), [0], 'value', 1)
    roomStore.add(first)
    const played = { ...undo(enter(enter(first, [1], 'corner', 3), [2], 'color', 1)), elapsed: 48 }
    // Another tab saved this position before the current tab received its storage event.
    local.setItem('sudoku-app:v1:game:first', JSON.stringify(played))
    const expected = JSON.parse(JSON.stringify(played))
    const stored = (id: string) => JSON.parse(local.getItem('sudoku-app:v1:game:' + id)!)

    const second = enter(makeGame('second', 'Second puzzle', STARTER_GAME.givens, 'generated'), [2], 'corner', 4)
    roomStore.add(second)
    assert.equal(roomStore.getSnapshot().active, second.id)
    assert.deepEqual(stored(first.id), expected)
    roomStore.select(first.id)
    // A timer update must use the newer board written before the storage event.
    roomStore.update(first.id, current => ({ ...current, elapsed: current.elapsed + 1 }))
    expected.elapsed++
    assert.deepEqual(stored(first.id), expected)
    assert.equal(stored(second.id).savedForLater, undefined)

    roomStore.saveForLater(first.id)
    const { roomStore: reloaded } = await import('../src/sudoku/storage.ts?save-on-stop-reload')
    assert.equal(reloaded.getSnapshot().active, null)
    assert.equal(reloaded.getSnapshot().stoppedPlaying, true)
    assert.deepEqual(stored(first.id), { ...expected, savedForLater: true })
    reloaded.select(first.id)
    const resumed = reloaded.getSnapshot().games.find(game => game.id === first.id)!
    assert.equal(reloaded.getSnapshot().active, first.id)
    assert.equal(resumed.savedForLater, undefined)
    assert.equal(resumed.elapsed, 49)
    assert.deepEqual(undo(resumed).position, undo(played).position)
    assert.deepEqual(redo(resumed).position, redo(played).position)
    assert.deepEqual(stored(first.id), expected)

    local.setItem('sudoku-app:v1:game:first', JSON.stringify({ ...expected, savedForLater: true }))
    reloaded.update(first.id, game => ({ ...game, elapsed: game.elapsed + 1 }))
    assert.equal(stored(first.id).savedForLater, true, 'a timer tick preserves a save from another tab')
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

test('an untimed solve stays untimed in the library and counts toward player rating', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?untimed-test')
    const givens = '034678912672195348198342567859761423426853791713924856961537284287419635345286179'
    const game = makeGame('untimed', 'Untimed puzzle', givens, 'generated')
    const attempt = ratingAttemptFor({ difficulty: 'easy', points: 4, scoringVersion: 10, techniqueOrder: ['full-house'] })
    roomStore.add({ ...game, difficulty: 'easy', elapsed: 24, started: true, ratingAttempt: attempt })
    puzzleTiming.set('trackTime', false)
    roomStore.update(game.id, (current) => enter(current, [0], 'value', 5))
    const result = roomStore.getSnapshot().playerRating.results.get(game.id)
    assert.equal(result?.event.finish, 'solved')
    assert.equal(result?.event.elapsed, 0)
    assert.equal(result?.speedBonus, 0)
    const { roomStore: reloaded } = await import('../src/sudoku/storage.ts?untimed-reload')
    assert.equal(reloaded.getSnapshot().games[0].timeUntracked, true)
    assert.equal(reloaded.getSnapshot().games[0].elapsed, 0)
    assert.deepEqual(reloaded.getSnapshot().playerRating.results.get(game.id), result)
  } finally {
    puzzleTiming.set('trackTime', true)
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})


test('mixed rules, candidates, and undo history survive reload alongside older named variants', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { puzzle, solution } = mixedFixtures['x-killer']
    const { roomStore } = await import('../src/sudoku/storage.ts?mixed-rules')
    roomStore.add({ ...makeGame('mixed-save', 'Mixed puzzle', puzzle.givens, 'imported'),
      variant: { id: 'mixed', puzzle, solution } })
    roomStore.update('mixed-save', game => enter(game, [0], 'value', Number(solution[0])))
    roomStore.update('mixed-save', game => enter(game, [1], 'center', Number(solution[1])))
    roomStore.update('mixed-save', game => undo(enter(game, [2], 'corner', 3)))
    const saved = roomStore.getSnapshot().games.find(game => game.id === 'mixed-save')!
    const windoku = {
      version: 1 as const,
      givens: '000000070700000056000590000000000300040001090016000000000000800003254000007100000',
      rules: WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })),
    }
    roomStore.add({ ...makeGame('legacy-windoku', 'Older Windoku save', windoku.givens, 'imported'),
      variant: { id: 'windoku', puzzle: windoku,
        solution: '495613278731842956862597413579426381248371695316985724154769832983254167627138549' } })
    roomStore.select('mixed-save')
    const reloaded = (await import('../src/sudoku/storage.ts?mixed-rules-reload')).roomStore.getSnapshot()
    const restored = reloaded.games.find(game => game.id === 'mixed-save')!
    assert.equal(reloaded.active, restored.id)
    assert.deepEqual(restored.variant, saved.variant)
    assert.deepEqual(restored.position, JSON.parse(JSON.stringify(saved.position)))
    assert.deepEqual(restored.past, JSON.parse(JSON.stringify(saved.past)))
    assert.deepEqual(restored.future, JSON.parse(JSON.stringify(saved.future)))
    assert.equal(redo(restored).position.corner[2], 1 << 2)
    assert.equal(reloaded.games.find(game => game.id === 'legacy-windoku')?.variant?.id, 'windoku')
    assert.deepEqual(reloaded.games.find(game => game.id === 'legacy-windoku')?.variant?.puzzle, windoku)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})
