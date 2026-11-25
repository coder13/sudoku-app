import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { createGameId, enter, makeGame, restartGame, type Game } from '../src/sudoku/game.ts'
import { findSharedAttempt, isSharedPuzzleId, puzzleDefinitionForSharing, puzzleExportText, sharedPuzzleLink } from '../src/sudoku/puzzle-sharing.ts'
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

test('exported puzzle copies round-trip through import without player progress', async () => {
  const { puzzle, solution } = mixedFixtures['x-killer']
  const original = {
    ...makeGame('private-attempt', 'X-Killer', puzzle.givens, 'collection'),
    collection: { collectionId: 'x-killer', puzzleId: '1' },
    variant: { id: 'mixed' as const, puzzle, solution },
  }
  const exported = puzzleExportText(enter(original, [0], 'candidate', 4))
  const imported = await detectPuzzle(exported)
  assert.equal(imported.format, 'Puzzle export')
  assert.equal(imported.title, original.title)
  assert.equal(imported.givens, original.givens)
  assert.deepEqual(imported.variant, { id: 'mixed', puzzle })
  assert.deepEqual(imported.collection, original.collection)
  assert.equal(imported.progress, undefined)
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

test('the sharing API validates the common rule contract against a Mini layout', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const definition = { version: 1, title: 'Mini Renban', grid: MINI_GRID, givens: '0'.repeat(16),
      sizedRules: [{ type: 'renban', cells: [0, 1, 5], segments: [[0, 1], [1, 5]] }], sizedAuthor: 'Test setter' }
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), definition)
    const kropki = { ...definition, title: 'Mini dots', sizedRules: [
      { type: 'kropki', consecutive: { pairs: [[0, 1]], negative: true }, ratioTwo: { pairs: [[1, 5]], negative: false } },
    ] }
    const { id: dotShareId } = await api<{ id: string }>('shares', 'POST', kropki)
    assert.deepEqual(await api(`shares/${dotShareId}`), kropki)
    const mixed = { ...kropki, sizedRules: [...kropki.sizedRules,
      { type: 'difference', cells: [4, 5], difference: 3 }] }
    const { id: differenceShareId } = await api<{ id: string }>('shares', 'POST', mixed)
    assert.deepEqual(await api(`shares/${differenceShareId}`), mixed)
    const arrow = { ...mixed, sizedRules: [...mixed.sizedRules, { type: 'arrow', circle: 1, cells: [0, 6] }] }
    const { id: arrowShareId } = await api<{ id: string }>('shares', 'POST', arrow)
    assert.deepEqual(await api(`shares/${arrowShareId}`), arrow)
    const regionSum = { type: 'region-sum', cells: [0, 4, 9, 5], groupByRegion: true, segments: [[0, 4], [4, 9, 5]] }
    const combined = { ...arrow, sizedRules: [...arrow.sizedRules, regionSum] }
    const { id: combinedShareId } = await api<{ id: string }>('shares', 'POST', combined)
    assert.deepEqual(await api(`shares/${combinedShareId}`), combined)
    const sixEntropy = { version: 1, title: 'Six Entropy', grid: { size: 6, boxRows: 2, boxColumns: 3 },
      givens: '0'.repeat(36), sizedRules: [{ type: 'global-entropy', groups: [[1, 2], [3, 4], [5, 6]] }] }
    const { id: entropyShareId } = await api<{ id: string }>('shares', 'POST', sixEntropy)
    assert.deepEqual(await api(`shares/${entropyShareId}`), sixEntropy)
    for (const invalid of [
      { ...combined, sizedRules: [{ ...regionSum, groupByRegion: 'true' }] },
      { ...combined, sizedRules: [{ ...regionSum, cells: [0, 1], segments: undefined }] },
      { ...combined, sizedRules: [{ ...regionSum, segments: [[0, 9, 5]] }] },
      { ...arrow, sizedRules: [{ type: 'arrow', circle: 1, cells: [0, 1] }] },
      { ...arrow, sizedRules: [{ type: 'arrow', circle: 1, cells: [6, 6] }] },
      { ...mixed, sizedRules: [{ type: 'difference', cells: [4, 5], difference: 4 }] },
      { ...mixed, sizedRules: [{ type: 'difference', cells: [0, 5], difference: 2 }] },
      { ...kropki, sizedRules: [{ type: 'kropki', consecutive: { pairs: [[3, 4]] } }] },
      { ...kropki, sizedRules: [{ type: 'kropki', ratioTwo: { negative: 'true' } }] },
      { ...definition, sizedRules: [] },
      { ...definition, sizedRules: undefined },
      { ...definition, sixRules: definition.sizedRules },
      { ...definition, sizedRules: [{ type: 'renban', cells: [0, 16] }] },
      { ...definition, sizedRules: [{ type: 'renban', cells: [0, 1, 5], segments: [[0, 1]] }] },
      { ...definition, sizedRules: [{ type: 'thermometer', cells: [0, 1, 2, 3, 7] }] },
      { ...definition, sizedRules: [{ ...definition.sizedRules[0], solution: '1234341221434321' }] },
      { ...sixEntropy, sizedRules: [{ type: 'global-entropy', groups: [[1, 2], [2, 4], [5, 6]] }] },
      { ...sixEntropy, sizedRules: [{ type: 'global-entropy', groups: [[1, 2], [3, 4]] }] },
    ]) await assert.rejects(api('shares', 'POST', invalid), { status: 400 })
  } finally { sqlite.close() }
})

test('shared 9 × 9 puzzles retain published Minimum, Maximum and numbered-dot rules', async () => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-mixed-rules.json', import.meta.url), 'utf8')) as {
    title: string; coach: string; solution: string
  }[]
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    for (const source of sources) {
      const { variant, givens } = await detectPuzzle(source.coach)
      assert.ok(variant)
      const game = { ...makeGame(createGameId(), source.title, givens, 'imported'), variant: { ...variant, solution: source.solution } }
      const definition = puzzleDefinitionForSharing(game)
      const { id } = await api<{ id: string }>('shares', 'POST', definition)
      assert.deepEqual(await api(`shares/${id}`), JSON.parse(JSON.stringify(definition)))
    }
    const definition = { version: 1, title: 'Invalid clues', givens: STARTER }
    for (const rule of [
      { type: 'maximum', cells: [0, 0] },
      { type: 'minimum', cells: [81] },
      { type: 'minimum', cells: [0], ignoreMarkedNeighbors: 'yes' },
      { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [8, 9], value: 3 }] },
      { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 1 }] },
      { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [0, 1], value: 9 }] },
      { type: 'labeled-dots', relation: 'difference', marks: [] },
    ]) {
      const variant = { id: 'mixed', puzzle: { version: 1, givens: STARTER, rules: [rule] } }
      await assert.rejects(api('shares', 'POST', { ...definition, variant }), { status: 400 })
    }
  } finally { sqlite.close() }
})

test('public share links preserve the Quad-Arrows arithmetic', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const source = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-sum.json', import.meta.url), 'utf8'))
    const { variant, givens } = await detectPuzzle(source.coach)
    assert.ok(variant?.puzzle.rules?.every(rule => rule.type === 'quadruple-sum'))
    const game = { ...makeGame(createGameId(), source.title, givens, 'imported'), variant: { ...variant, solution: source.solution } }
    const definition = puzzleDefinitionForSharing(game)
    const api = syncRequest(undefined, fetcher)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    const shared = await api(`shares/${id}`)
    assert.deepEqual(shared, JSON.parse(JSON.stringify(definition)))
  } finally { sqlite.close() }
})

test('sharing preserves Pill Arrow place value, Lockout Lines and Fog', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const sources = JSON.parse(readFileSync(new URL('./fixtures/coach-pill-arrow-lockout.json', import.meta.url), 'utf8'))
    const source = sources.find(({ url }: { url: string }) => url.endsWith('/DhdV'))
    const { variant, givens } = await detectPuzzle(source.coach)
    assert.ok(variant?.fog)
    const game = { ...makeGame(createGameId(), source.title, givens, 'imported'), variant: { ...variant, solution: source.solution } }
    const definition = puzzleDefinitionForSharing(game)
    const api = syncRequest(undefined, fetcher)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), JSON.parse(JSON.stringify(definition)))
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
