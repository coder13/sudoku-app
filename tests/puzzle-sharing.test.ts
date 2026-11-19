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

test('Difference and Ratio dots shares preserve the rule definition', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const givens = '0'.repeat(81)
    const rule = { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 3 }], negative: true }
    const definition = { version: 1, title: 'Difference and Ratio dots', givens, variant: {
      id: rule.type, puzzle: { version: 1, givens, rules: [rule] },
    } }
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), definition)
    const invalid = { ...definition, variant: { ...definition.variant, puzzle: {
      ...definition.variant.puzzle, rules: [{ ...rule, solution: givens }],
    } } }
    await assert.rejects(api('shares', 'POST', invalid), { status: 400 })
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

test('the public Algebraic Cages share contains rules and givens without private play state', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const rules = [
      { type: 'algebraic-cage', cells: [0], label: 'n+2', total: { type: 'variable', name: 'n', offset: 2 } },
      { type: 'algebraic-cage', cells: [4], label: 'n', total: { type: 'variable', name: 'n', offset: 0 } },
    ] as const
    const game = { ...makeGame('private-cages', 'Cage practice', '0000000201400000', 'custom', undefined, MINI_GRID),
      algebraic: { rules, solution: '3214143221434321' } }
    const definition = puzzleDefinitionForSharing(enter(game, [0], 'value', 3))
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), {
      version: 1, title: game.title, givens: game.givens, grid: MINI_GRID, algebraic: { rules },
    })
    for (const algebraic of [
      { rules, solution: game.algebraic.solution }, { rules: [{ ...rules[0], cells: [16] }] },
      { rules: [...rules, rules[0]] }, { rules: [{ ...rules[0], label: 'n+3' }] },
    ]) await assert.rejects(api('shares', 'POST', { ...definition, algebraic }), { status: 400 })
    await assert.rejects(api('shares', 'POST', { ...definition, givens: STARTER, grid: undefined }), { status: 400 })
  } finally { sqlite.close() }
})

test('the sharing API requires full rule data for either rectangular 6 × 6 layout', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const givens = '0'.repeat(36)
    const sixRules = [
      { type: 'diagonal', diagonal: 'main' },
      { type: 'parity', parity: 'even', cells: [2] },
      { type: 'thermometer', cells: [1, 2, 8, 14] },
      { type: 'renban', cells: [2, 8, 9, 15], segments: [[2, 8, 9], [9, 15]] },
    ] as const
    for (const grid of [{ size: 6, boxRows: 2, boxColumns: 3 }, { size: 6, boxRows: 3, boxColumns: 2 }] as const) {
      const definition = { version: 1, title: '6 × 6 rule contract', grid, givens, sixRules, sixAuthor: 'Test author' }
      const { id } = await api<{ id: string }>('shares', 'POST', definition)
      assert.deepEqual(await api(`shares/${id}`), definition)
      for (const invalid of [
        { ...definition, sixRules: undefined },
        { ...definition, grid: { ...grid, boxRows: 6 }},
        { ...definition, givens: '7'.repeat(36) },
        { ...definition, sixAuthor: ' '.repeat(5) },
        { ...definition, sixRules: [{ type: 'thermometer', cells: [1, 35, 1] }] },
        { ...definition, sixRules: [{ type: 'parity', parity: 'odd', cells: [36] }] },
        { ...definition, sixRules: [{ type: 'renban', cells: [1, 2, 3], segments: [[1, 2, 7]] }] },
        { ...definition, sixRules: [{ type: 'diagonal', diagonal: 'main', solution: givens }] },
      ]) await assert.rejects(api('shares', 'POST', invalid), { status: 400 })
    }
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
