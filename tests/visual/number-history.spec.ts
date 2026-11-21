import { expect, test } from '@playwright/test'
import type { GeneratedNumberWindowResult, NumberHistoryWindow, NumberResultStatus } from '../../src/number-puzzles/generated-results'

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
      const checkpoint = { game, number: 0, through: 607, ready: true }
      sessions.put(checkpoint, [game, 0])
      history.put(checkpoint)
      history.put({
        ...checkpoint, number: -1, totals: new Map([
          ['easy', { solved: 602, timed: 0, seconds: 0n }],
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
    return {
      beforeBackfill,
      duringBackfill,
      oldHistoryCount: 'rows' in oldHistory ? oldHistory.rows.length : 0,
      cutoff,
      cutoffReadCount: pageReads[0],
      day: await read('solved', { limit: 3, filters: { from: '2026-11-20', to: '2026-11-20' } }),
      hardDay: await read('solved', { limit: 3, filters: { difficulty: 'hard', from: '2026-11-20', to: '2026-11-20' } }),
      clockChange: await read('solved', { limit: 3, filters: { from: '2026-11-01' } }),
      hardWithLegacy: await read('solved', { limit: 4, filters: { difficulty: 'hard' } }),
      anotherGame: await read('solved', { limit: 3, filters: { game: 'sudoku' } }),
      activeWithLegacy: await read('started', { limit: 2 }),
    }
  })
  expect(result).toEqual({
    beforeBackfill: undefined,
    duringBackfill: undefined,
    oldHistoryCount: 605,
    cutoff: { numbers: [6, 7, 8], more: true, hasAny: true },
    cutoffReadCount: 4,
    day: { numbers: [4, 3], more: false, hasAny: true },
    hardDay: { numbers: [3], more: false, hasAny: true },
    clockChange: undefined,
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

    await storage.openGeneratedNumberPuzzle('kakuro', id)
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
    return { id, lastPlayed, started, solved, remaining, reset: await read('solved') }
  })
  expect(result.started).toEqual([[result.id, result.lastPlayed, undefined]])
  expect(result.solved).toEqual([[result.id, result.lastPlayed + 1, 12]])
  expect(result.remaining).toEqual([])
  expect(result.reset).toEqual([])
})
