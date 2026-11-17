import assert from 'node:assert/strict'
import test from 'node:test'
import { runEngine, type EngineRequest } from '../src/sudoku/engine.ts'
import { watchTechniqueScan, cachedTechniqueCounts, techniqueScanKey } from '../src/sudoku/technique-scan.ts'

test('generation, history and foreground requests can finish while a scan is running', async t => {
  const values = '0'.repeat(81)
  const sent = new Map<string, TestWorker>()
  class TestWorker {
    onmessage?: (event: { data: { id: number; value: number } }) => void
    closed = false
    terminate() { this.closed = true }
    postMessage({ id, request }: { id: number; request: EngineRequest }) {
      sent.set(request.type, this)
      if (request.type !== 'technique-count') queueMicrotask(() => this.onmessage?.({ data: { id, value: 0 } }))
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TestWorker })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'Worker', previous); else Reflect.deleteProperty(globalThis, 'Worker') })

  const first = watchTechniqueScan(values)
  const other = watchTechniqueScan(values)
  const pending = first.count('nested-forcing-net')
  assert.equal(other.count('nested-forcing-net'), pending)
  await Promise.all([
    runEngine({ type: 'notes', values }),
    runEngine({ type: 'classify-actions', values, actions: [] }),
    runEngine({ type: 'generate', seed: 1 }),
    runEngine({ type: 'generate-targeted', seed: 1, maxAttempts: 0, target: { type: 'difficulty', level: 'medium' } }),
    runEngine({ type: 'generation-cancel', job: 1 }),
  ])
  assert.equal(sent.get('generate'), sent.get('generate-targeted'))
  assert.equal(sent.get('generate'), sent.get('generation-cancel'))
  assert.equal(new Set(['notes', 'generate', 'classify-actions', 'technique-count'].map(key => sent.get(key))).size, 4)
  first.close()
  assert.equal(sent.get('technique-count')?.closed, false)
  other.close()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(sent.get('technique-count')?.closed, true)
  assert.equal(sent.get('classify-actions')?.closed, false)
  assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(values)), {})
})
