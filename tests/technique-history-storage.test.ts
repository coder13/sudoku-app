import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { EMPTY, puzzleIdentity } from '../src/sudoku/game.ts'
import type { PuzzleTechniqueHistory } from '../src/sudoku/technique-progress.ts'

let server: ViteDevServer

before(async () => {
  server = await createServer({
    configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
})
after(async () => { await server?.close() })

function historyDatabase(records: Map<string, PuzzleTechniqueHistory>) {
  let scans = 0
  let puts = 0
  const database = {
    transaction() {
      let pending = 0
      const transaction: any = {}
      function schedule(run: () => void) {
        pending++
        queueMicrotask(() => {
          run()
          pending--
          queueMicrotask(() => { if (!pending) transaction.oncomplete?.() })
        })
      }
      const store = {
        get(key: string) {
          const request: any = {}
          schedule(() => { request.result = structuredClone(records.get(key)); request.onsuccess?.() })
          return request
        },
        getAll() {
          const request: any = {}
          schedule(() => { request.result = structuredClone([...records.values()]); request.onsuccess?.() })
          return request
        },
        openCursor() {
          scans++
          const keys = [...records.keys()]
          const request: any = {}
          let index = 0
          function advance() {
            const key = keys[index]
            request.result = key === undefined ? null : { key, value: structuredClone(records.get(key)),
              continue() { index++; schedule(advance) } }
            request.onsuccess?.()
          }
          schedule(advance)
          return request
        },
        put(value: PuzzleTechniqueHistory) {
          puts++
          schedule(() => { records.set(value.givens, structuredClone(value)) })
        },
      }
      transaction.objectStore = () => store
      return transaction
    },
  }
  return {
    indexedDB: {
      open() {
        const request: any = {}
        queueMicrotask(() => { request.result = database; request.onsuccess?.() })
        return request
      },
    },
    counts: () => ({ scans, puts }),
  }
}

test('reordered legacy variant technique history is read and updated in place without rewriting other records', async () => {
  const givens = EMPTY
  const legacyPuzzle = { rules: [{ cells: [0, 1, 2], type: 'thermometer' as const }], givens, version: 1 as const }
  const game = { givens, variant: { id: 'thermometer' as const, puzzle: legacyPuzzle, solution: '123456789'.repeat(9) } }
  const legacyKey = 'thermometer:' + JSON.stringify(legacyPuzzle)
  const canonical = puzzleIdentity(game)
  assert.notEqual(legacyKey, canonical)
  const old: PuzzleTechniqueHistory = { givens: legacyKey,
    actions: { 'e2:4': { at: 1, technique: 'thermometer', source: 'independent' } } }
  const untouched: PuzzleTechniqueHistory = { givens: 'unrelated-puzzle', actions: {} }
  const records = new Map([[legacyKey, old], [untouched.givens, structuredClone(untouched)]])
  const fake = historyDatabase(records)
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fake.indexedDB })
  const originalBroadcast = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined })
  try {
    const { techniqueHistory, markTechniqueSolution } = await server.ssrLoadModule('/src/sudoku/technique-history.ts')
    const history = await techniqueHistory.readPuzzle(game)
    assert.equal(history[0]?.technique, 'thermometer')
    assert.equal(fake.counts().scans, 1)
    markTechniqueSolution(game)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(fake.counts().puts, 1)
    assert.ok(records.get(legacyKey)?.solutionRevealedAt)
    assert.equal(records.has(canonical), false, 'the old record is reused rather than duplicated')
    assert.deepEqual(records.get(untouched.givens), untouched)

    records.set(canonical, { ...old, givens: canonical })
    const scans = fake.counts().scans
    await techniqueHistory.readPuzzle(game)
    assert.equal(fake.counts().scans, scans, 'normal direct reads never scan the database')
  } finally {
    Reflect.deleteProperty(globalThis, 'indexedDB')
    if (originalBroadcast) Object.defineProperty(globalThis, 'BroadcastChannel', originalBroadcast)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
  }
})
