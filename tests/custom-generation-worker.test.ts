import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { runEngine, type EngineRequest } from '../src/sudoku/engine.ts'

const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
const empty = '0'.repeat(81)
const generated = { puzzle: { version: 1, givens: empty, rules: [{ type: 'anti-knight' }] }, solution,
  rating: { status: { solved: 'easy' }, points: 100 } }

test('cancelling custom sampling, carving or a single-family preset frees only that search', async t => {
  let hold: (request: EngineRequest) => boolean = () => false
  let onHold: (worker: TestWorker) => void
  const commands: { request: EngineRequest; worker: TestWorker }[] = []
  class TestWorker {
    onmessage?: (message: { data: { id: number; value: unknown } }) => void
    terminated = 0
    held = false
    terminate() { this.terminated++ }
    postMessage({ id, request }: { id: number; request: EngineRequest }) {
      commands.push({ request, worker: this })
      if (this.held) return
      if (hold(request)) {
        this.held = true
        onHold(this)
        return
      }
      const value = request.type === 'techniques' ? { techniques: [], defaultOrder: [], difficultyOrder: [] }
        : request.type === 'variant' ? solution : generated
      queueMicrotask(() => this.onmessage?.({ data: { id, value } }))
    }
  }

  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TestWorker })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Worker', original)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })

  await runEngine({ type: 'generate', seed: 8 })
  const shared = commands[0].worker

  async function checkCancellation(rules: readonly ('diagonal-main' | 'thermometer' | 'anti-knight')[], requestType: 'variant' | 'generate-variant') {
    const controller = new AbortController()
    hold = request => request.type === requestType
    const started = new Promise<TestWorker>(resolve => { onHold = resolve })
    const result = generateCustomSudoku(rules, 'easy', 5, [], { signal: controller.signal })
    const rejected = assert.rejects(result, { name: 'AbortError' })
    const worker = await started
    assert.notEqual(worker, shared, 'custom work must use an independent worker')
    if (requestType === 'variant') {
      hold = () => false
      assert.deepEqual(await generateCustomSudoku(rules, 'easy', 6, []), generated)
      assert.notEqual(commands.at(-1)?.worker, worker, 'a second custom search can finish while the first is busy')
    }
    const previous = commands.length
    controller.abort()
    await rejected
    assert.equal(worker.terminated, 1)
    assert.equal(commands.length, previous, 'cancelled generation must stop after its active request')
    assert.deepEqual(await runEngine({ type: 'generate', seed: 9 }), generated)
    assert.equal(commands.at(-1)?.worker, shared)
    assert.equal(shared.terminated, 0)
  }

  const mixed = ['diagonal-main', 'thermometer'] as const
  await checkCancellation(mixed, 'variant')
  await checkCancellation(mixed, 'generate-variant')
  await checkCancellation(['anti-knight'], 'generate-variant')

  const clock = new AbortController()
  const timeout = t.mock.method(AbortSignal, 'timeout', () => clock.signal)
  hold = request => request.type === 'generate-variant'
  const started = new Promise<TestWorker>(resolve => { onHold = resolve })
  const timed = generateCustomSudoku(mixed, 'easy', 5, [])
  const exhausted = assert.rejects(timed, { code: 'search-limit' })
  const timedWorker = await started
  clock.abort(new DOMException('Generation time expired.', 'TimeoutError'))
  await exhausted
  assert.equal(timedWorker.terminated, 1)
  assert.equal(shared.terminated, 0)
  timeout.mock.restore()

  hold = () => false
  const controller = new AbortController()
  assert.deepEqual(await generateCustomSudoku(mixed, 'easy', 5, [], { signal: controller.signal }), generated)
  const warm = commands.at(-1)!.worker
  controller.abort()
  assert.equal(warm.terminated, 0, 'completed work must remove its abort listener')
  assert.deepEqual(await generateCustomSudoku(mixed, 'easy', 6, []), generated)
  assert.equal(commands.at(-1)?.worker, warm)
})
