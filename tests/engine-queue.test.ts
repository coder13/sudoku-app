import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import test from 'node:test'
import { createEngineSession, runEngine, runGeneration, type EngineRequest, type EngineResponse } from '../src/sudoku/engine.ts'

test('engine queues isolate play work, replace waiting refreshes, and cancel owned work', async t => {
  const values = '0'.repeat(81)
  type Message = { id: number; request: EngineRequest }
  class TestWorker {
    static all: TestWorker[] = []
    onmessage?: (event: { data: EngineResponse }) => void
    onerror?: () => void
    onmessageerror?: () => void
    sent: Message[] = []
    waiting: Message[] = []
    closed = false
    constructor() { TestWorker.all.push(this) }
    terminate() { this.closed = true }
    postMessage(message: Message) {
      assert.equal(this.closed, false)
      this.sent.push(message)
      this.waiting.push(message)
    }
    reply(value: unknown) {
      const message = this.waiting.shift()
      assert.ok(message)
      this.onmessage?.({ data: { id: message.id, value } as EngineResponse })
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TestWorker })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
  const newestWorker = () => TestWorker.all.at(-1)!

  await t.test('candidates, singles and metadata finish while a rating blocks the slow queue', async () => {
    const rating = runEngine({ type: 'rate', values })
    const slow = newestWorker()
    const hints = runEngine({ type: 'hints', values })
    const trace = runEngine({ type: 'logical-solve', values })
    assert.equal(slow.sent.length, 1)

    const candidates = runEngine({ type: 'notes', values })
    const fast = newestWorker()
    assert.notEqual(fast, slow)
    fast.reply([1])
    assert.deepEqual(await candidates, [1])

    const position = { version: 2 as const, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits: Array<number>(16).fill(0) }
    const fastRequests: EngineRequest[] = [
      { type: 'solve-singles', values },
      { type: 'variant', operation: 'candidates', position: { puzzle: { version: 1, givens: values, rules: [] } } },
      { type: 'variant', operation: 'solve-singles', position: { puzzle: { version: 1, givens: values, rules: [] } } },
      { type: 'sized-classic', operation: 'candidates', position },
      { type: 'sized-variant', operation: 'candidates', position: { ...position, rules: [] } },
      { type: 'sized-variant', operation: 'hints', position: { ...position, rules: [] }, limit: 0 },
      { type: 'sized-classic', operation: 'trace', position, singlesOnly: true },
      { type: 'sized-variant', operation: 'trace', position: { ...position, rules: [] }, singlesOnly: true },
    ]
    for (const request of fastRequests) {
      const pending = runEngine(request)
      assert.equal(newestWorker(), fast)
      assert.equal(fast.waiting.length, 1)
      fast.reply(null)
      await pending
    }

    const catalog = runEngine({ type: 'techniques' })
    const metadata = newestWorker()
    assert.notEqual(metadata, slow)
    assert.notEqual(metadata, fast)
    metadata.reply({ techniques: [] })
    await catalog
    assert.equal(slow.sent.length, 1)
    slow.reply({ status: 'stalled' })
    await rating
    assert.equal(slow.sent[1].request.type, 'hints')
    slow.reply({ choices: [] })
    await hints
    assert.equal(slow.sent[2].request.type, 'logical-solve')
    slow.reply({ steps: [] })
    await trace
  })

  const fast = TestWorker.all[1]
  await t.test('only the newest waiting refresh per caller is dispatched', async () => {
    const firstOwner = {}, secondOwner = {}
    const first = runEngine({ type: 'notes', values }, { latestKey: firstOwner })
    const stale = runEngine({ type: 'notes', values: `1${values.slice(1)}` }, { latestKey: firstOwner })
    const staleRejected = assert.rejects(stale, { name: 'AbortError' })
    const other = runEngine({ type: 'notes', values: `2${values.slice(1)}` }, { latestKey: secondOwner })
    const latest = runEngine({ type: 'notes', values: `3${values.slice(1)}` }, { latestKey: firstOwner })
    await staleRejected
    assert.equal(fast.waiting.length, 1)
    fast.reply([0])
    assert.deepEqual(await first, [0])
    assert.equal('values' in fast.waiting[0].request && fast.waiting[0].request.values[0], '2')
    fast.reply([2])
    assert.deepEqual(await other, [2])
    assert.equal('values' in fast.waiting[0].request && fast.waiting[0].request.values[0], '3')
    fast.reply([3])
    assert.deepEqual(await latest, [3])
  })

  await t.test('shared aborts remove work without stopping another caller', async () => {
    const activeController = new AbortController(), waitingController = new AbortController()
    const active = runEngine({ type: 'notes', values }, { signal: activeController.signal })
    const activeRejected = assert.rejects(active, { name: 'AbortError' })
    const waiting = runEngine({ type: 'notes', values }, { signal: waitingController.signal })
    const waitingRejected = assert.rejects(waiting, { name: 'AbortError' })
    const other = runEngine({ type: 'notes', values })
    waitingController.abort()
    activeController.abort()
    await Promise.all([activeRejected, waitingRejected])
    assert.equal(fast.closed, false)
    assert.equal(fast.waiting.length, 1)
    fast.reply([0])
    assert.equal(fast.waiting.length, 1)
    fast.reply([2])
    assert.deepEqual(await other, [2])
    assert.equal(getEventListeners(activeController.signal, 'abort').length, 0)
    assert.equal(getEventListeners(waitingController.signal, 'abort').length, 0)
  })

  await t.test('closing one session interrupts it and leaves other sessions and play running', async () => {
    const first = createEngineSession(), second = createEngineSession()
    const controller = new AbortController()
    const rating = first.run({ type: 'rate', values }, { signal: controller.signal })
    const firstWorker = newestWorker()
    const hints = first.run({ type: 'hints', values })
    const rejected = Promise.all([assert.rejects(rating, { name: 'AbortError' }), assert.rejects(hints, { name: 'AbortError' })])
    const other = second.run({ type: 'rate', values })
    const secondWorker = newestWorker()
    const candidates = runEngine({ type: 'notes', values })
    controller.abort()
    await rejected
    assert.equal(firstWorker.closed, true)
    assert.equal(firstWorker.sent.length, 1)
    assert.equal(secondWorker.closed, false)
    assert.equal(fast.closed, false)
    await assert.rejects(first.run({ type: 'rate', values }), { name: 'AbortError' })
    firstWorker.reply('late abandoned result')
    secondWorker.reply({ status: 'stalled' })
    await other
    fast.reply([1])
    await candidates
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    first.close()
    second.close()
  })

  await t.test('a queued session abort keeps active work and the session alive', async () => {
    const session = createEngineSession(), controller = new AbortController()
    const active = session.run({ type: 'rate', values })
    const worker = newestWorker()
    const queued = session.run({ type: 'hints', values }, { signal: controller.signal })
    const rejected = assert.rejects(queued, { name: 'AbortError' })
    controller.abort()
    await rejected
    assert.equal(worker.closed, false)
    worker.reply({ status: 'stalled' })
    await active
    const next = session.run({ type: 'hints', values })
    assert.equal(newestWorker(), worker)
    worker.reply({ choices: [] })
    await next
    session.close()
  })

  await t.test('completed and superseded calls remove abort listeners; closed sessions stay closed', async () => {
    const session = createEngineSession(), controller = new AbortController()
    const active = session.run({ type: 'rate', values }, { signal: controller.signal })
    const worker = newestWorker()
    assert.equal(getEventListeners(controller.signal, 'abort').length, 1)
    worker.reply({ status: 'stalled' })
    await active
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    const blocker = session.run({ type: 'rate', values })
    const stale = session.run({ type: 'notes', values }, { signal: controller.signal, latestKey: 'board' })
    const rejected = assert.rejects(stale, { name: 'AbortError' })
    const latest = session.run({ type: 'notes', values }, { latestKey: 'board' })
    await rejected
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    worker.reply({ status: 'stalled' })
    await blocker
    worker.reply([1])
    await latest
    session.close()
    await assert.rejects(session.run({ type: 'notes', values }), { name: 'AbortError' })
    const before = TestWorker.all.length
    const empty = createEngineSession()
    controller.abort()
    await assert.rejects(empty.run({ type: 'rate', values }, { signal: controller.signal }), { name: 'AbortError' })
    empty.close()
    assert.equal(TestWorker.all.length, before)
  })

  await t.test('worker failure rejects queued calls and stale messages cannot settle a retry', async () => {
    const session = createEngineSession()
    const active = session.run({ type: 'rate', values }), failedWorker = newestWorker()
    const queued = session.run({ type: 'hints', values })
    const failures = Promise.all([assert.rejects(active, /could not start/), assert.rejects(queued, /could not start/)])
    failedWorker.onerror?.()
    await failures
    assert.equal(failedWorker.closed, true)
    const retry = session.run({ type: 'rate', values }), retryWorker = newestWorker()
    assert.notEqual(retryWorker, failedWorker)
    failedWorker.reply('stale')
    retryWorker.reply({ status: 'stalled' })
    assert.deepEqual(await retry, { status: 'stalled' })
    session.close()
  })

  await t.test('unreadable worker responses reject queued calls and allow a retry', async () => {
    const session = createEngineSession()
    const active = session.run({ type: 'rate', values }), unreadableWorker = newestWorker()
    const queued = session.run({ type: 'hints', values })
    const failures = Promise.all([
      assert.rejects(active, /response could not be read/),
      assert.rejects(queued, /response could not be read/),
    ])
    unreadableWorker.onmessageerror?.()
    await failures
    assert.equal(unreadableWorker.closed, true)

    const retry = session.run({ type: 'rate', values }), retryWorker = newestWorker()
    assert.notEqual(retryWorker, unreadableWorker)
    unreadableWorker.reply('unreadable stale response')
    retryWorker.reply({ status: 'stalled' })
    assert.deepEqual(await retry, { status: 'stalled' })
    session.close()
  })

  await t.test('malformed worker responses reject queued calls and allow a retry', async () => {
    const session = createEngineSession()
    const active = session.run({ type: 'rate', values }), malformedWorker = newestWorker()
    const queued = session.run({ type: 'hints', values })
    const failures = Promise.all([
      assert.rejects(active, /invalid response/),
      assert.rejects(queued, /invalid response/),
    ])
    malformedWorker.onmessage?.({ data: null as unknown as EngineResponse })
    await failures
    assert.equal(malformedWorker.closed, true)

    const retry = session.run({ type: 'rate', values }), retryWorker = newestWorker()
    assert.notEqual(retryWorker, malformedWorker)
    malformedWorker.reply('malformed stale response')
    retryWorker.reply({ status: 'stalled' })
    assert.deepEqual(await retry, { status: 'stalled' })
    session.close()
  })

  await t.test('generation abort stops an active attempt without stopping another search', async () => {
    const options = { type: 'generate-targeted', seed: 1, maxAttempts: 3, target: { type: 'difficulty', level: 'medium' } } as const
    const controller = new AbortController()
    const abandoned = runGeneration(options, { signal: controller.signal }), abandonedWorker = newestWorker()
    const kept = runGeneration(options), keptWorker = newestWorker()
    assert.notEqual(abandonedWorker, keptWorker)
    abandonedWorker.reply({ status: 'pending', attempts: 0 })
    keptWorker.reply({ status: 'pending', attempts: 0 })
    await Promise.resolve()
    assert.equal(abandonedWorker.waiting[0].request.type, 'generation-advance')
    controller.abort()
    assert.deepEqual(await abandoned, { status: 'cancelled', attempts: 0 })
    assert.equal(abandonedWorker.closed, true)
    assert.equal(abandonedWorker.sent.length, 2)
    assert.equal(keptWorker.closed, false)
    keptWorker.reply({ status: 'matched', attempts: 1, puzzle: values })
    assert.deepEqual(await kept, { status: 'matched', attempts: 1, puzzle: values })
    assert.equal(keptWorker.closed, true)
  })

  await t.test('generation retains completed attempt counts and cleans up callback failures', async () => {
    const options = { type: 'generate-targeted', seed: 1, maxAttempts: 3, target: { type: 'difficulty', level: 'medium' } } as const
    const controller = new AbortController(), progress: number[] = []
    const cancelled = runGeneration(options, { signal: controller.signal, onProgress: attempts => {
      progress.push(attempts)
      controller.abort()
    } })
    const worker = newestWorker()
    worker.reply({ status: 'pending', attempts: 0 })
    await Promise.resolve()
    worker.reply({ status: 'pending', attempts: 1 })
    await Promise.resolve()
    assert.equal(worker.waiting[0].request.type, 'generation-cancel')
    worker.reply({ status: 'cancelled', attempts: 1 })
    assert.deepEqual(await cancelled, { status: 'cancelled', attempts: 1 })
    assert.deepEqual(progress, [1])
    assert.equal(worker.closed, true)

    const failed = runGeneration(options, { onProgress: () => { throw new Error('progress callback failed') } })
    const rejected = assert.rejects(failed, /progress callback failed/), failedWorker = newestWorker()
    failedWorker.reply({ status: 'pending', attempts: 0 })
    await Promise.resolve()
    failedWorker.reply({ status: 'pending', attempts: 1 })
    await Promise.resolve()
    assert.equal(failedWorker.waiting[0].request.type, 'generation-cancel')
    failedWorker.reply({ status: 'cancelled', attempts: 1 })
    await rejected
    assert.equal(failedWorker.closed, true)
  })
})
