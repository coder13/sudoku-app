import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STARTER } from '../src/sudoku/formats.ts'
import { createGameId, enter, makeGame, restartGame, type Game } from '../src/sudoku/game.ts'
import { findSharedAttempt, isSharedPuzzleId, puzzleDefinitionForSharing, sharedPuzzleLink } from '../src/sudoku/puzzle-sharing.ts'
import { MINI_GRID } from '../src/sudoku/grid.ts'
import { GAME_PREFIX, readGame } from '../src/sudoku/storage.ts'
import { createSyncEngine, syncRequest, type Credentials } from '../src/sudoku/sync-engine.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { mixedFixtures } from './helpers/mixed-fixtures.ts'
import { syncDatabase } from './helpers/sync-database.ts'

test('sharing an in-progress variant publishes an immutable definition under a UUID', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const { puzzle, solution } = mixedFixtures['x-killer']
    const original = {
      ...makeGame('private-attempt', 'X-Killer', puzzle.givens, 'collection'),
      collection: { collectionId: 'x-killer', puzzleId: '1' },
      variant: { id: 'mixed' as const, puzzle, solution },
    }
    const progressed = { ...enter(original, [0], 'candidate', 4), elapsed: 45 }
    const definition = puzzleDefinitionForSharing(progressed)
    const [{ id }, duplicate] = await Promise.all([
      api<{ id: string }>('shares', 'POST', definition),
      api<{ id: string }>('shares', 'POST', puzzleDefinitionForSharing(original)),
    ])
    assert.ok(isSharedPuzzleId(id))
    assert.equal(id, duplicate.id)
    const link = new URL(sharedPuzzleLink(id, 'https://sudoku.example'))
    assert.deepEqual([...link.searchParams], [['share', id]])
    assert.equal(link.hash, '')
    const publicPuzzle = await api(`shares/${id.toUpperCase()}`)
    assert.deepEqual(publicPuzzle, {
      version: 1, title: original.title, givens: puzzle.givens,
      variant: { id: 'mixed', puzzle }, collection: original.collection,
    })
    const revision = await api<{ id: string }>('shares', 'POST', { ...definition, title: 'Updated X-Killer' })
    assert.notEqual(revision.id, id)
    assert.deepEqual(await api(`shares/${id}`), publicPuzzle)
    await assert.rejects(api(`shares/${createGameId()}`), { status: 404 })
    await assert.rejects(api('shares'), { status: 405 })
  } finally { sqlite.close() }
})

test('Mini Sudoku shares keep the four-by-four grid specification', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const game = makeGame('mini', 'Mini Sudoku', '1004040201034001', 'imported', undefined, MINI_GRID)
    const definition = puzzleDefinitionForSharing(game)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), {
      version: 1, title: game.title, givens: game.givens, grid: MINI_GRID,
    })
    await assert.rejects(api('shares', 'POST', { ...definition, grid: undefined }), { status: 400 })
    await assert.rejects(api('shares', 'POST', { ...definition, givens: STARTER }), { status: 400 })
  } finally { sqlite.close() }
})

test('the sharing API rejects save state and malformed or oversized definitions', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const classic = makeGame('original', 'Classic', STARTER, 'custom')
    const definition = puzzleDefinitionForSharing(classic)
    const { puzzle, solution } = mixedFixtures['x-killer']
    const variant = { id: 'mixed', puzzle }
    for (const invalid of [
      classic, { ...definition, version: 2 }, { ...definition, position: classic.position },
      { ...definition, variant },
      { ...definition, givens: puzzle.givens, variant: { ...variant, solution } },
      { ...definition, givens: puzzle.givens, variant: { ...variant, puzzle: { ...puzzle, rules: [{ type: 'anti-king', entries: solution }] } } },
    ]) await assert.rejects(api('shares', 'POST', invalid), { status: 400 })
    await assert.rejects(api('shares', 'POST', { ...definition, title: 'x'.repeat(300_000) }), { status: 413 })
    await assert.rejects(api('shares/not-a-uuid'), { status: 404 })
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM shared_puzzles').get()?.n, 0)
  } finally { sqlite.close() }
})

test('a linked recipient can sync their copy independently of the public puzzle', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const original = makeGame('original', 'Classic', STARTER, 'custom')
    const { id: share } = await api<{ id: string }>('shares', 'POST', puzzleDefinitionForSharing(original))
    const device = await api<Credentials>('libraries', 'POST')
    const owner = syncRequest(device.token, fetcher)
    const storage = new MemoryStorage()
    const copy: Game = { ...makeGame(createGameId(), original.title, STARTER, 'imported'), sharedPuzzleId: share, saved: true }
    const progressed = enter(copy, [2], 'value', 4)
    const key = GAME_PREFIX + copy.id
    storage.setItem(key, JSON.stringify(progressed))
    await createSyncEngine(storage, device.id, owner, () => {}).run()

    const { ticket } = await owner<{ ticket: string }>('invitations', 'POST')
    const other = await api<Credentials>('join', 'POST', { secret: ticket })
    const downloaded = new MemoryStorage()
    await createSyncEngine(downloaded, other.id, syncRequest(other.token, fetcher), () => {}).run()
    const saved = readGame(copy.id, downloaded.getItem(key))!
    assert.equal(saved.position.entries[2], '4')
    assert.equal(findSharedAttempt([original, saved], share), saved)
    assert.equal(restartGame(saved).sharedPuzzleId, share)
    assert.deepEqual(await api(`shares/${share}`), { version: 1, title: original.title, givens: STARTER })
    await assert.rejects(api(`puzzles/${copy.id}`), { status: 401 })
  } finally { sqlite.close() }
})
