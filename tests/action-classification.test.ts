import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import test from 'node:test'
import { createClassificationScope } from '../src/sudoku/action-classification.ts'
import type { EngineRequest, EngineResponse } from '../src/sudoku/engine.ts'
import { SOLVER_PROFILE_KEY } from '../src/sudoku/solver-profile.ts'

test('history and progress share cancelable classification without canceling another reader', async t => {
  const values = '0'.repeat(81)
  const request = { type: 'classify-actions', values, actions: [{ place: { cell: 0, digit: 1 } }] } as const
  type Message = { id: number; request: EngineRequest }
  class TestWorker {
    static all: TestWorker[] = []
    onmessage?: (event: { data: EngineResponse }) => void
    sent: Message[] = []
    waiting: Message[] = []
    closed = false
    constructor() { TestWorker.all.push(this) }
    terminate() { this.closed = true }
    postMessage(message: Message) { assert.equal(this.closed, false); this.sent.push(message); this.waiting.push(message) }
    reply(value: unknown, error?: string) {
      const message = this.waiting.shift()
      assert.ok(message)
      this.onmessage?.({ data: (error ? { id: message.id, error } : { id: message.id, value }) as EngineResponse })
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TestWorker })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
  const newestWorker = () => TestWorker.all.at(-1)!

  await t.test('concurrent readers and a later history batch reuse the same result', async () => {
    const progress = createClassificationScope(), history = createClassificationScope()
    const first = progress.run(request)
    const firstRejected = assert.rejects(first, { name: 'AbortError' })
    const second = history.run({ actions: request.actions, values, type: 'classify-actions' })
    const worker = newestWorker()
    assert.equal(worker.sent.length, 1)
    progress.close()
    await firstRejected
    assert.equal(worker.closed, false)
    worker.reply(['hidden-single'])
    assert.deepEqual(await second, ['hidden-single'])
    history.close()
    const later = createClassificationScope()
    assert.deepEqual(await later.run(request), ['hidden-single'])
    assert.equal(worker.sent.length, 1)
    later.close()
  })

  await t.test('queued classifications stay on the main thread and abandoned work stops', async () => {
    const first = createClassificationScope(), waiting = createClassificationScope(), next = createClassificationScope()
    const one = first.run({ ...request, values: `1${values.slice(1)}` })
    const oneRejected = assert.rejects(one, { name: 'AbortError' })
    const worker = newestWorker()
    const count = worker.sent.length
    const two = waiting.run({ ...request, values: `2${values.slice(1)}` })
    const twoRejected = assert.rejects(two, { name: 'AbortError' })
    const three = next.run({ ...request, values: `3${values.slice(1)}` })
    assert.equal(worker.sent.length, count)
    waiting.close()
    await twoRejected
    assert.equal(worker.closed, false)
    first.close()
    await oneRejected
    await Promise.resolve()
    const nextWorker = newestWorker()
    assert.equal(worker.closed, true)
    assert.notEqual(nextWorker, worker)
    assert.equal(nextWorker.sent.length, 1)
    assert.equal('values' in nextWorker.sent[0].request && nextWorker.sent[0].request.values[0], '3')
    worker.reply(['stale'])
    nextWorker.reply(['pointing'])
    assert.deepEqual(await three, ['pointing'])
    next.close()
  })

  await t.test('an individual abort detaches its listener without stopping a shared request', async () => {
    const first = createClassificationScope(), second = createClassificationScope(), controller = new AbortController()
    const changed = { ...request, actions: [{ eliminate: { cell: 8, digit: 2 } }] }
    const one = first.run(changed, { signal: controller.signal })
    const rejected = assert.rejects(one, { name: 'AbortError' })
    const two = second.run(changed)
    const worker = newestWorker()
    controller.abort()
    await rejected
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    assert.equal(worker.closed, false)
    worker.reply([null])
    assert.deepEqual(await two, [null])
    first.close()
    second.close()
  })

  await t.test('failed work is not cached and can be retried', async () => {
    const scope = createClassificationScope()
    const changed = { ...request, actions: [{ place: { cell: 7, digit: 6 } }] }
    const first = scope.run(changed), failedWorker = newestWorker()
    const rejected = assert.rejects(first, /scan failed/)
    failedWorker.reply(undefined, 'scan failed')
    await rejected
    const retry = scope.run(changed), retryWorker = newestWorker()
    assert.notEqual(retryWorker, failedWorker)
    retryWorker.reply(['naked-single'])
    assert.deepEqual(await retry, ['naked-single'])
    scope.close()
  })

  await t.test('solver profile changes cannot reuse another profile’s proof result', async () => {
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    let profile = ['pointing']
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => key === SOLVER_PROFILE_KEY ? JSON.stringify(profile) : null,
    } })
    try {
      const scope = createClassificationScope()
      const first = scope.run({ type: 'deductions', values }), worker = newestWorker()
      worker.reply([])
      await first
      const before = worker.sent.length
      profile = ['claiming']
      const second = scope.run({ type: 'deductions', values })
      assert.equal(worker.sent.length, before + 1)
      const sent = worker.sent.at(-1)!.request
      assert.equal(sent.type, 'deductions')
      assert.ok('techniqueOrder' in sent)
      assert.deepEqual(sent.techniqueOrder, ['claiming'])
      worker.reply([])
      await second
      scope.close()
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  await t.test('queued work keeps the default profile captured by its cache key', async () => {
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    let profile: string[] | undefined
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => key === SOLVER_PROFILE_KEY && profile ? JSON.stringify(profile) : null,
    } })
    try {
      const scope = createClassificationScope()
      const blocker = scope.run({ ...request, values: `4${values.slice(1)}` }), worker = newestWorker()
      const count = worker.sent.length
      const queued = scope.run({ type: 'deductions', values })
      profile = ['claiming']
      assert.equal(worker.sent.length, count)
      worker.reply([null])
      await blocker
      const sent = worker.sent.at(-1)!.request
      assert.equal(sent.type, 'deductions')
      assert.ok('techniqueOrder' in sent)
      assert.equal(sent.techniqueOrder, undefined, 'default order must not become the later saved profile')
      worker.reply([])
      await queued
      profile = undefined
      const beforeCached = worker.sent.length
      assert.deepEqual(await scope.run({ type: 'deductions', values }), [])
      assert.equal(worker.sent.length, beforeCached)
      scope.close()
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })
})
