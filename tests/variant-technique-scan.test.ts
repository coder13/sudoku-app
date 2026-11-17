import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type EngineRequest, type EngineResponse, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { cachedTechniqueCounts, scanTechnique, techniqueScanKey } from '../src/sudoku/technique-scan.ts'

test('variant scans count distinct targets, retain rules, and leave foreground and selected hints independent', async (t) => {
  const workers: TestWorker[] = []
  class TestWorker {
    onmessage?: (message: { data: EngineResponse }) => void
    requests: { id: number; request: EngineRequest }[] = []
    constructor() { workers.push(this) }
    postMessage(message: { id: number; request: EngineRequest }) { this.requests.push(message) }
    reply(value: unknown) {
      const { id } = this.requests.shift()!
      this.onmessage?.({ data: { id, value } as EngineResponse })
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Worker', original)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
  const puzzle: VariantPuzzle = { givens: '0'.repeat(81), rules: [{ type: 'diagonal', diagonal: 'main' }] }
  const entries = `1${'0'.repeat(80)}`
  const removals = [0, 2, ...Array<number>(79).fill(0)]
  const position = { puzzle, entries }
  const background = scanTechnique(entries, removals, 'locked-candidates', position)
  const selected = runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['locked-candidates'] }, { interactive: true })
  const foreground = runEngine({ type: 'variant', operation: 'hints', position })
  assert.equal(workers.length, 3, 'A blocked scan must not queue foreground help or a selected technique')
  assert.deepEqual(workers[0].requests[0].request, {
    type: 'variant', operation: 'hints', position: { ...position, eliminations: removals },
    techniqueOrder: ['locked-candidates'], limit: 0xffff_ffff,
  })
  workers[1].reply([])
  workers[2].reply([])
  await Promise.all([selected, foreground])
  workers[0].reply([
    { actions: [{ eliminate: { cell: 3, digit: 2 } }, { eliminate: { cell: 4, digit: 2 } }] },
    { actions: [{ eliminate: { cell: 3, digit: 2 } }] },
    { actions: [{ place: { cell: 5, digit: 6 } }] },
  ])
  assert.equal(await background, 3)
  assert.equal(await scanTechnique(entries, removals, 'locked-candidates', position), 3)
  assert.equal(workers[0].requests.length, 0, 'A repeated position should reuse the count')
  const other = { puzzle: { ...puzzle, rules: [] }, entries }
  const fresh = scanTechnique(entries, removals, 'locked-candidates', other)
  assert.equal(workers[0].requests.length, 1, 'Different rules must perform a fresh scan')
  workers[0].reply([])
  assert.equal(await fresh, 0)
  assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(entries, removals, puzzle))['locked-candidates'], { count: 3 })
  assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(entries, removals, other.puzzle))['locked-candidates'], { count: 0 })
})
