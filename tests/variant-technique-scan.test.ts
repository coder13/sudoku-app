import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type EngineRequest, type EngineResponse, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { cachedTechniqueCounts, watchTechniqueScan, techniqueScanKey } from '../src/sudoku/technique-scan.ts'

test('variant scans count distinct targets, retain rules, and leave foreground and selected hints independent', async (t) => {
  const workers: TestWorker[] = []
  class TestWorker {
    onmessage?: (message: { data: EngineResponse }) => void
    requests: { id: number; request: EngineRequest }[] = []
    closed = false
    terminate() { this.closed = true }
    constructor() { workers.push(this) }
    postMessage(message: { id: number; request: EngineRequest }) { this.requests.push(message) }
    reply(value: unknown) {
      const { id } = this.requests.shift()!
      this.onmessage?.({ data: { id, value } as EngineResponse })
    }
    fail(error: string) {
      const { id } = this.requests.shift()!
      this.onmessage?.({ data: { id, error } as EngineResponse })
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
  const scan = watchTechniqueScan(entries, removals, position)
  const otherView = watchTechniqueScan(entries, removals, position)
  const background = scan.count('locked-candidates')
  assert.equal(otherView.count('locked-candidates'), background)
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
    { technique: 'locked-candidates', actions: [{ eliminate: { cell: 3, digit: 2 } }, { eliminate: { cell: 4, digit: 2 } }] },
    { technique: 'locked-candidates', actions: [{ eliminate: { cell: 3, digit: 2 } }] },
    { technique: 'locked-candidates', actions: [{ place: { cell: 5, digit: 6 } }] },
  ])
  assert.equal(await background, 3)
  scan.close()
  assert.equal(workers[0].closed, false, 'Another view still owns the scan')
  assert.equal(await otherView.count('locked-candidates'), 3)
  assert.equal(workers[0].requests.length, 0, 'A repeated position should reuse the count')
  otherView.close()
  const other = { puzzle: { ...puzzle, rules: [] }, entries }
  const freshView = watchTechniqueScan(entries, removals, other)
  const fresh = freshView.count('locked-candidates')
  assert.equal(workers[0].requests.length, 1, 'Different rules must perform a fresh scan')
  workers[0].reply([])
  assert.equal(await fresh, 0)
  freshView.close()
  const order = ['locked-candidates', 'xy-wing', 'aic']
  const batchPosition = { puzzle, entries }
  const batchScan = watchTechniqueScan(entries, undefined, batchPosition, undefined, order)
  const counts = order.map(technique => batchScan.count(technique))
  assert.equal(workers[0].requests.length, 1)
  assert.deepEqual(workers[0].requests[0].request, {
    type: 'variant', operation: 'hints', position: { ...batchPosition, eliminations: undefined },
    techniqueOrder: order, limit: 0xffff_ffff,
  })
  workers[0].reply([
    { technique: 'locked-candidates', actions: [{ eliminate: { cell: 3, digit: 2 } }] },
    { technique: 'xy-wing', actions: [
      { eliminate: { cell: 3, digit: 2 } }, { eliminate: { cell: 4, digit: 2 } },
    ] },
    { technique: 'aic', actions: [
      { eliminate: { cell: 4, digit: 2 } }, { place: { cell: 5, digit: 6 } },
    ] },
  ])
  assert.deepEqual(await Promise.all(counts), [1, 1, 1])
  assert.equal(workers[0].requests.length, 0)
  batchScan.close()
  const retryPosition = { puzzle: { ...puzzle, rules: [{ type: 'anti-king' as const }] }, entries }
  const retryScan = watchTechniqueScan(entries, undefined, retryPosition, undefined, ['locked-candidates', 'xy-wing'])
  const failedBatch = retryScan.count('locked-candidates')
  assert.equal(workers[0].requests.length, 1)
  workers[0].fail('Batch scan failed')
  await assert.rejects(failedBatch, /Batch scan failed/)
  const retriedBatch = retryScan.count('locked-candidates')
  assert.equal(workers[0].requests.length, 1, 'A rejected batch can be retried on the same worker')
  workers[0].reply([])
  assert.equal(await retriedBatch, 0)
  retryScan.close()
  assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(entries, removals, puzzle))['locked-candidates'], { count: 3 })
  assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(entries, removals, other.puzzle))['locked-candidates'], { count: 0 })
  const cancelledPuzzle: VariantPuzzle = { ...puzzle, rules: [{ type: 'anti-knight' }] }
  const cancelledView = watchTechniqueScan(entries, removals, { puzzle: cancelledPuzzle, entries })
  const pending = cancelledView.count('locked-candidates')
  cancelledView.close()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(workers[0].closed, true)
  assert.equal(workers[1].closed, false, 'Closing a variant scan must preserve selected proofs')
  assert.equal(workers[2].closed, false, 'Closing a variant scan must preserve foreground help')
  assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(entries, removals, cancelledPuzzle)), {})
})

test('variant technique counts subtract candidate targets found by earlier techniques', async (t) => {
  const workers: TestWorker[] = []
  class TestWorker {
    onmessage?: (message: { data: EngineResponse }) => void
    requests: { id: number; request: EngineRequest }[] = []
    terminate() {}
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
  const order = ['locked-candidates', 'xy-wing']
  const scan = watchTechniqueScan(entries, undefined, { puzzle, entries }, undefined, order)
  const count = scan.count('xy-wing')
  assert.deepEqual(workers[0].requests[0].request, {
    type: 'variant', operation: 'hints', position: { puzzle, entries, eliminations: undefined },
    techniqueOrder: order, limit: 0xffff_ffff,
  })
  workers[0].reply([
    { technique: 'locked-candidates', actions: [{ eliminate: { cell: 3, digit: 2 } }] },
    { technique: 'xy-wing', actions: [
      { eliminate: { cell: 3, digit: 2 } }, { eliminate: { cell: 4, digit: 2 } },
    ] },
  ])
  assert.equal(await count, 1)
  const extra = scan.count('aic')
  assert.deepEqual(workers[0].requests[0].request, {
    type: 'variant', operation: 'hints', position: { puzzle, entries, eliminations: undefined },
    techniqueOrder: [...order, 'aic'], limit: 0xffff_ffff,
  })
  workers[0].reply([
    { technique: 'locked-candidates', actions: [{ eliminate: { cell: 3, digit: 2 } }] },
    { technique: 'xy-wing', actions: [{ eliminate: { cell: 3, digit: 2 } }] },
    { technique: 'aic', actions: [{ place: { cell: 5, digit: 6 } }] },
  ])
  assert.equal(await extra, 1)
  scan.close()
})
