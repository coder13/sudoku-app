import { expect, test } from '@playwright/test'
import type { GeneratedNumberWindowResult, NumberHistoryWindow, NumberResultStatus } from '../../src/number-puzzles/generated-results'
import type { GeneratedRecord } from '../../src/number-puzzles/generated-storage'

test.use({ timezoneId: 'America/Los_Angeles' })

test('version 4 puzzle history stays available during backfill and preserves order and filters', async ({ page }) => {
  await page.goto('/iframe.html')
  const result = await page.evaluate(async () => {
    const open = indexedDB.open('sudoku-number-puzzles', 4)
    open.onupgradeneeded = () => {
      const db = open.result
      const generated = db.createObjectStore('generated', { keyPath: ['game', 'number'] })
      generated.createIndex('token', ['game', 'id'], { unique: true })
      const sessions = db.createObjectStore('sessions')
      const history = db.createObjectStore('history', { keyPath: ['game', 'number'] })
      history.createIndex('status', ['game', 'status', 'number'])
      const game = 'kakuro'
      const checkpoint = { game, number: 0, through: 611, ready: true }
      sessions.put(checkpoint, [game, 0])
      history.put(checkpoint)
      history.put({
        ...checkpoint, number: -1, totals: new Map([
          ['easy', { solved: 606, timed: 0, seconds: 0n }],
          ['hard', { solved: 3, timed: 0, seconds: 0n }],
        ]),
      })
      function put(number: number, difficulty: string, date?: string, status = 'solved') {
        history.put({ game, status, number, difficulty, id: String(number), generated: true,
          ...(date && { lastPlayed: new Date(date).getTime() }) })
      }
      put(1, 'hard')
      put(2, 'easy', '2026-11-19T23:59:59.999')
      put(3, 'hard', '2026-11-20T00:00:00')
      put(4, 'easy', '2026-11-20T23:59:59.999')
      put(5, 'hard', '2026-11-21T00:00:00')
      for (let number = 6; number <= 605; number++) put(number, 'easy', '2026-11-22T09:00:00')
      put(606, 'easy', undefined, 'started')
      put(607, 'easy', '2026-11-22T09:00:00', 'started')
      put(608, 'easy', '2026-10-31T23:59:59.999')
      put(609, 'easy', '2026-11-01T00:00:00')
      put(610, 'easy', '2026-11-01T23:59:59.999')
      put(611, 'easy', '2026-11-02T00:00:00')
    }
    await new Promise<void>((resolve, reject) => {
      open.onsuccess = () => { open.result.close(); resolve() }
      open.onerror = () => reject(open.error)
    })

    const storageModule = '/src/number-puzzles/generated-storage.ts'
    const storage = await import(storageModule) as typeof import('../../src/number-puzzles/generated-storage')
    async function read(status: NumberResultStatus, request: Omit<NumberHistoryWindow, 'revision'>) {
      const response = await storage.readGeneratedRecentHistory('kakuro', status, { ...request, revision: 1 })
      const result: GeneratedNumberWindowResult | undefined = response?.result
      return result && { numbers: result.entries.map(entry => entry.number), more: Boolean(result.hasMore), hasAny: result.hasAny }
    }
    const beforeBackfill = await read('solved', { limit: 3 })
    const oldHistory = await storage.readGeneratedPickerHistory('kakuro', 'solved')
    const scanned = await storage.scanGeneratedRecentHistory('kakuro', 'solved', { revision: 2, limit: 3 }, () => false)
    let batches = 0
    await storage.indexGeneratedRecentHistory('kakuro', () => batches++ > 0)
    const duringBackfill = await read('solved', { limit: 3 })
    await storage.indexGeneratedRecentHistory('kakuro')
    const pageReads: number[] = []
    const getAllKeys = IDBIndex.prototype.getAllKeys
    IDBIndex.prototype.getAllKeys = function (...args) {
      const request = getAllKeys.apply(this, args)
      request.addEventListener('success', () => { pageReads.push(request.result.length) })
      return request
    }
    const cutoff = await read('solved', { limit: 3 })
    const fallbackReads: (number | undefined)[] = []
    const getAll = IDBIndex.prototype.getAll
    IDBIndex.prototype.getAll = function (range, count) {
      fallbackReads.push(count)
      return getAll.call(this, range, count)
    }
    const historyModule = '/src/number-puzzles/difficulty-history.ts'
    const { openGeneratedNumberResults } = await import(historyModule) as typeof import('../../src/number-puzzles/difficulty-history')
    window.Worker = class extends window.Worker {
      constructor() { throw new Error('History worker unavailable') }
    }
    let publish: (result: GeneratedNumberWindowResult) => void
    const firstPage = new Promise<GeneratedNumberWindowResult>(resolve => { publish = resolve })
    const fallback = openGeneratedNumberResults({ game: 'kakuro', status: 'solved', window: { revision: 1, limit: 3 } }, result => {
      if ('revision' in result) publish(result)
    })
    const first = await firstPage
    const nextPage = new Promise<GeneratedNumberWindowResult>(resolve => { publish = resolve })
    fallback.query({ revision: 2, limit: 4, filters: { difficulty: 'hard' } })
    fallback.query({ revision: 3, limit: 4 })
    const next = await nextPage
    fallback.close()
    const fullFallbackReads = fallbackReads.filter(limit => limit === undefined).length
    const fallbackKeyCounts = pageReads.slice(1)

    return {
      beforeBackfill,
      hasKakuroHistory: await storage.hasGeneratedNumberHistory('kakuro'),
      hasCalcudokuHistory: await storage.hasGeneratedNumberHistory('calcudoku'),
      duringBackfill,
      scanned: scanned.entries.map(entry => entry.number),
      oldHistoryCount: 'rows' in oldHistory ? oldHistory.rows.length : 0,
      cutoff,
      cutoffReadCount: pageReads[0],
      fallback: { first: first.entries.map(entry => entry.number), next: next.entries.map(entry => entry.number), revision: next.revision,
        fullFallbackReads, keyCounts: fallbackKeyCounts },
      day: await read('solved', { limit: 3, filters: { from: '2026-11-20', to: '2026-11-20' } }),
      hardDay: await read('solved', { limit: 3, filters: { difficulty: 'hard', from: '2026-11-20', to: '2026-11-20' } }),
      clockChange: await read('solved', { limit: 3, filters: { from: '2026-11-01', to: '2026-11-01' } }),
      eveningBeforeChange: await read('solved', { limit: 3, filters: { to: '2026-10-31' } }),
      hardWithLegacy: await read('solved', { limit: 4, filters: { difficulty: 'hard' } }),
      anotherGame: await read('solved', { limit: 3, filters: { game: 'sudoku' } }),
      activeWithLegacy: await read('started', { limit: 2 }),
    }
  })
  expect(result).toEqual({
    beforeBackfill: undefined,
    hasKakuroHistory: true,
    hasCalcudokuHistory: false,
    duringBackfill: undefined,
    scanned: [6, 7, 8],
    oldHistoryCount: 609,
    cutoff: { numbers: [6, 7, 8], more: true, hasAny: true },
    cutoffReadCount: 4,
    fallback: { first: [6, 7, 8], next: [6, 7, 8, 9], revision: 3, fullFallbackReads: 0, keyCounts: [4, 5] },
    day: { numbers: [4, 3], more: false, hasAny: true },
    hardDay: { numbers: [3], more: false, hasAny: true },
    clockChange: { numbers: [610, 609], more: false, hasAny: true },
    eveningBeforeChange: { numbers: [608], more: false, hasAny: true },
    hardWithLegacy: { numbers: [5, 3, 1], more: false, hasAny: true },
    anotherGame: { numbers: [], more: false, hasAny: true },
    activeWithLegacy: { numbers: [607, 606], more: false, hasAny: true },
  })
})

test('generated moves update both history lists after the index is ready', async ({ page }) => {
  await page.goto('/iframe.html')
  const result = await page.evaluate(async () => {
    const source = '/src/number-puzzles/'
    const storage = await import(source + 'generated-storage.ts') as typeof import('../../src/number-puzzles/generated-storage')
    const generated = await import(source + 'generated.ts') as typeof import('../../src/number-puzzles/generated')
    const enginePath = '/src/kakuro/engine.ts'
    const { solveKakuro } = await import(enginePath) as typeof import('../../src/kakuro/engine')
    const recipe: [number, string] = [4, '/ / 18/ 3/ / 4/3 . . /10 . . . /12 . . /']
    const id = generated.encodeGeneratedNumberPuzzle({ game: 'kakuro', difficulty: 'easy', recipe })
    const puzzle = generated.kakuroFromRecipe(recipe)
    const solution = solveKakuro(puzzle).solution!
    const notes = solution.map(() => 0)
    const first = solution.findIndex(value => value > 0)
    const values = notes.map((_, cell) => cell === first ? solution[cell] : 0)
    const lastPlayed = Date.now()

    const empty = !await storage.hasGeneratedNumberHistory('kakuro')
    await storage.openGeneratedNumberPuzzle('kakuro', id)
    const hasRecord = await storage.hasGeneratedNumberHistory('kakuro')
    async function read(status: NumberResultStatus) {
      const response = await storage.readGeneratedRecentHistory('kakuro', status, { limit: 24, revision: 1 })
      return response?.result.entries.map(entry => [entry.id, entry.lastPlayed, entry.elapsed])
    }
    await storage.saveGeneratedNumberProgress('kakuro', id, {
      position: { values, notes }, past: [], future: [], lastPlayed,
    })
    const started = await read('started')
    await storage.saveGeneratedNumberProgress('kakuro', id, {
      position: { values: solution, notes }, past: [], future: [], lastPlayed: lastPlayed + 1, clock: { elapsed: 0 },
    })
    await storage.saveGeneratedNumberClock('kakuro', id, 12)
    const solved = await read('solved')
    const remaining = await read('started')
    await storage.saveGeneratedNumberProgress('kakuro', id, {
      position: { values: notes, notes }, past: [], future: [], lastPlayed: lastPlayed + 2,
    })
    return { id, lastPlayed, empty, hasRecord, started, solved, remaining, reset: await read('solved') }
  })
  expect(result.empty).toBe(true)
  expect(result.hasRecord).toBe(true)
  expect(result.started).toEqual([[result.id, result.lastPlayed, undefined]])
  expect(result.solved).toEqual([[result.id, result.lastPlayed + 1, 12]])
  expect(result.remaining).toEqual([])
  expect(result.reset).toEqual([])
})

test('legacy generated saves merge by token without reading the full puzzle store', async ({ page }) => {
  await page.goto('/iframe.html')
  const result = await page.evaluate(async () => {
    const source = '/src/number-puzzles/'
    const storage = await import(source + 'generated-storage.ts') as typeof import('../../src/number-puzzles/generated-storage')
    const generated = await import(source + 'generated.ts') as typeof import('../../src/number-puzzles/generated')
    const recipe: [number, string] = [4, '/ / 18/ 3/ / 4/3 . . /10 . . . /12 . . /']
    const id = (number: number) => generated.encodeGeneratedNumberPuzzle({ game: 'kakuro', difficulty: 'easy', recipe },
      `00000000-0000-0000-0000-${number.toString().padStart(12, '0')}`)
    const game = 'kakuro'
    // Create the database without preparing the legacy saves in this page.
    await storage.hasGeneratedNumberHistory(game)
    const db = await storage.readRequest(indexedDB.open('sudoku-number-puzzles'))
    const seed = db.transaction('generated', 'readwrite')
    const seeded = storage.transactionDone(seed)
    const store = seed.objectStore('generated')
    const progress = (digit: number, lastPlayed: number, elapsed = lastPlayed) => ({
      values: Array.from({ length: 16 }, (_, cell) => cell === 6 ? digit : 0),
      notes: Array<number>(16).fill(0), past: [[6, 0, 0]], future: [], lastPlayed, clock: { elapsed },
    })
    for (let number = 1; number <= 600; number++) store.put({ game, id: id(number), number })
    store.put({ game, id: id(2), number: 2, progress: progress(1, 22) })
    store.put({ game, id: id(3), number: 3, progress: progress(1, 33) })
    store.put({ game: 'calcudoku', id: 'separate-game', number: 1200 })
    await seeded
    const save = (number: number, value: ReturnType<typeof progress>, pending = false) =>
      localStorage.setItem(`${game}.${pending ? 'pending-' : ''}position.v1.${id(number)}`, JSON.stringify(value))
    localStorage.setItem('kakuro.generated.v1', JSON.stringify([id(602), id(2), id(3), id(7), id(601), id(603)]))
    save(2, progress(9, 11))
    save(3, progress(1, 33))
    save(3, progress(2, 34, 1), true)
    save(7, progress(3, 77))
    save(601, progress(4, 61))
    save(604, progress(5, 64), true)

    let bulkReads = 0
    const getAll = IDBObjectStore.prototype.getAll
    IDBObjectStore.prototype.getAll = function (query, count) {
      if (this.name === 'generated') bulkReads++
      return getAll.call(this, query, count)
    }
    try {
      await storage.prepareGeneratedHistory(game)
    } finally {
      IDBObjectStore.prototype.getAll = getAll
    }
    const read = db.transaction('generated').objectStore('generated').index('token')
    const records = await Promise.all([2, 3, 7, 601, 602, 603, 604].map(async n => {
      const { number, progress } = await storage.readRequest<GeneratedRecord>(read.get([game, id(n)]))
      return [number, progress?.values[6], progress?.lastPlayed, progress?.clock]
    }))
    db.close()
    const active = await storage.readGeneratedRecentHistory(game, 'started', { limit: 24, revision: 1 })
    const { sessions } = await storage.readGeneratedSessions(game)
    return {
      bulkReads, records, active: active?.result.entries.map(entry => entry.number), sessions: sessions.map(({ number }) => number),
      remaining: Object.keys(localStorage).filter(key => key.startsWith('kakuro.')),
      conflictingKey: storage.numberPositionKey(game, id(2)),
    }
  })
  expect(result.records).toEqual([
    [2, 1, 22, { elapsed: 22 }],
    [3, 2, 34, { elapsed: 33 }],
    [7, 3, 77, { elapsed: 77 }],
    [602, 4, 61, { elapsed: 61 }],
    [601, undefined, undefined, undefined],
    [603, undefined, undefined, undefined],
    [604, 5, 64, { elapsed: 64 }],
  ])
  expect(result.active).toEqual([7, 604, 602, 3])
  expect(result.sessions).toEqual([601, 602, 603, 604])
  expect(result.remaining).toEqual([result.conflictingKey])
  expect(result.bulkReads).toBe(0)
})

test('legacy generated saves stay available when IndexedDB is blocked', async ({ page }) => {
  await page.goto('/iframe.html')
  const received = await page.evaluate(async () => {
    const generatedModule = '/src/number-puzzles/generated.ts'
    const { encodeGeneratedNumberPuzzle } = await import(generatedModule) as typeof import('../../src/number-puzzles/generated')
    const historyModule = '/src/number-puzzles/difficulty-history.ts'
    const { openGeneratedNumberResults } = await import(historyModule) as typeof import('../../src/number-puzzles/difficulty-history')
    const recipe: [number, string] = [4, '/ / 18/ 3/ / 4/3 . . /10 . . . /12 . . /']
    for (const number of [1, 2, 3]) {
      const id = encodeGeneratedNumberPuzzle({ game: 'kakuro', difficulty: 'easy', recipe }, `00000000-0000-0000-0000-00000000000${number}`)
      const values = Array<number>(16).fill(0)
      values[6] = 1
      localStorage.setItem('kakuro.position.v1.' + id, JSON.stringify({ values, notes: Array<number>(16).fill(0), lastPlayed: number }))
    }
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Storage unavailable', 'SecurityError') } })
    let publish: (result: GeneratedNumberWindowResult) => void
    const firstPage = new Promise<GeneratedNumberWindowResult>(resolve => { publish = resolve })
    const fallback = openGeneratedNumberResults({ game: 'kakuro', status: 'started', window: { limit: 1, revision: 1 } }, result => {
      if ('revision' in result) publish(result)
    })
    const first = await firstPage
    const secondPage = new Promise<GeneratedNumberWindowResult>(resolve => { publish = resolve })
    fallback.query({ limit: 3, revision: 2 })
    const next = await secondPage
    fallback.close()
    return { first: first.entries.map(entry => entry.lastPlayed), more: first.hasMore, next: next.entries.map(entry => entry.lastPlayed) }
  })
  expect(received).toEqual({ first: [3], more: true, next: [3, 2, 1] })
})
