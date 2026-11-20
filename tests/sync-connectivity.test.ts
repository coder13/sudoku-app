import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { createSyncConnectivity } from '../src/sudoku/sync-connectivity.ts'

function mockWindow(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const events = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return events
}

test('offline browser state prevents checks and resumes when online fires', async t => {
  const events = mockWindow(t)
  let online = false
  let probes = 0
  const changes: boolean[] = []
  const gate = createSyncConnectivity({
    isOnline: () => online,
    probe: async () => { probes++; return true },
    onChange: value => changes.push(value),
  })
  gate.start()
  t.after(() => gate.stop())
  assert.equal(gate.available(), false)
  await gate.wake()
  await gate.verify()
  assert.equal(probes, 0)

  online = true
  events.dispatchEvent(new Event('online'))
  assert.equal(gate.available(), true)
  assert.deepEqual(changes, [true])

  online = false
  events.dispatchEvent(new Event('offline'))
  assert.equal(gate.available(), false)
  assert.deepEqual(changes, [true, false])
})

test('failed health check suspends requests; only health is retried until recovery', async t => {
  mockWindow(t)
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 })
  let healthy = false
  let probes = 0
  const changes: boolean[] = []
  const gate = createSyncConnectivity({
    probe: async () => { probes++; return healthy },
    isOnline: () => true,
    onChange: online => changes.push(online),
    retryMs: 30_000,
  })
  gate.start()
  t.after(() => gate.stop())

  await gate.verify()
  assert.equal(gate.available(), false)
  assert.deepEqual(changes, [false])
  await gate.wake()
  assert.equal(probes, 2)
  assert.equal(gate.available(), false)

  healthy = true
  t.mock.timers.tick(30_000)
  await gate.wake()
  assert.equal(probes, 3)
  assert.equal(gate.available(), true)
  assert.deepEqual(changes, [false, true])
  t.mock.timers.tick(90_000)
  assert.equal(probes, 3)
})

test('browser online event checks health before resuming a suspended sync', async t => {
  const events = mockWindow(t)
  let online = true
  let healthy = false
  const changes: boolean[] = []
  const gate = createSyncConnectivity({
    isOnline: () => online,
    probe: async () => healthy,
    onChange: value => changes.push(value),
  })
  gate.start()
  t.after(() => gate.stop())

  gate.suspend()
  online = false
  events.dispatchEvent(new Event('offline'))
  assert.equal(gate.available(), false)

  healthy = true
  online = true
  events.dispatchEvent(new Event('online'))
  await gate.wake()
  assert.equal(gate.available(), true)
  assert.equal(changes.at(-1), true)
})
