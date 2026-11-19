import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSyncSocket, type LiveConnection } from '../src/sudoku/sync-socket.ts'

test('live status waits for the server, falls back on a missed reply, and recovers', t => {
  const sockets: FakeSocket[] = []
  class FakeSocket {
    static CONNECTING = 0
    static OPEN = 1
    readyState = FakeSocket.CONNECTING
    sent: string[] = []
    onopen?: () => void
    onmessage?: (event: { data: string }) => void
    onclose?: (event: { code: number }) => void
    constructor() { sockets.push(this) }
    open() { this.readyState = FakeSocket.OPEN; this.onopen?.() }
    send(message: string) { this.sent.push(message) }
    receive(message: string) { this.onmessage?.({ data: message }) }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }) }
  }

  const globals = {
    WebSocket: FakeSocket,
    location: { href: 'https://sudoku.example/' },
    navigator: { onLine: true },
    document: { hidden: false },
  }
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 })

  const statuses: LiveConnection[] = []
  let changes = 0
  const connection = createSyncSocket({
    status: next => statuses.push(next),
    opened: () => {},
    changes: () => { changes++ },
    devices: () => {},
    revoked: () => {},
  })
  t.after(() => connection.stop())
  connection.update({ id: 'device', token: 'test-token' })
  assert.deepEqual(statuses, ['connecting'])
  sockets[0].open()
  assert.deepEqual(sockets[0].sent, ['ping'])
  assert.equal(connection.isOpen(), false)
  sockets[0].receive('pong')
  assert.equal(connection.isOpen(), true)
  sockets[0].receive('changes')
  assert.equal(changes, 1)

  t.mock.timers.setTime(45_000)
  connection.check(Date.now())
  assert.deepEqual(sockets[0].sent, ['ping', 'ping'])
  t.mock.timers.setTime(60_000)
  connection.check(Date.now())
  assert.equal(connection.isOpen(), false)
  assert.deepEqual(statuses, ['connecting', 'live', 'fallback'])
  sockets[0].receive('pong')
  assert.equal(connection.isOpen(), false)

  t.mock.timers.tick(2000)
  sockets[1].open()
  assert.equal(connection.isOpen(), false)
  sockets[1].receive('pong')
  assert.equal(connection.isOpen(), true)
  assert.deepEqual(statuses, ['connecting', 'live', 'fallback', 'live'])

  globals.navigator.onLine = false
  connection.update({ id: 'device', token: 'test-token' })
  sockets[1].receive('changes')
  assert.equal(connection.isOpen(), false)
  assert.equal(statuses.at(-1), 'inactive')
  assert.equal(changes, 1)
})
