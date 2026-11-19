import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSyncSocket, type LiveConnection } from '../src/sudoku/sync-socket.ts'

test('live status waits for the server, falls back on a missed reply, and recovers', t => {
  const sockets: FakeSocket[] = []
  class FakeSocket {
    static CONNECTING = 0
    static OPEN = 1
    readyState = FakeSocket.CONNECTING
    protocol = 'sudoku-sync-presence'
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
  const seenPeers: (readonly string[])[] = []
  let changes = 0
  const connection = createSyncSocket({
    status: next => statuses.push(next),
    opened: () => {},
    changes: () => { changes++ },
    devices: () => {},
    presence: puzzles => seenPeers.push(puzzles),
    revoked: () => {},
  })
  t.after(() => connection.stop())
  connection.update({ id: 'device', token: 'test-token' })
  connection.showPuzzle('current-puzzle')
  assert.deepEqual(statuses, ['connecting'])
  sockets[0].open()
  assert.deepEqual(sockets[0].sent, ['ping'])
  assert.equal(connection.isOpen(), false)
  sockets[0].receive('pong')
  assert.equal(connection.isOpen(), true)
  assert.deepEqual(sockets[0].sent, ['ping', 'puzzle:current-puzzle'])
  sockets[0].receive('presence:[{"device":"device","puzzle":"other-tab"},{"device":"peer","puzzle":"next-puzzle"}]')
  assert.deepEqual(seenPeers.at(-1), ['next-puzzle'])
  connection.showPuzzle('current-puzzle')
  assert.equal(sockets[0].sent.length, 2)
  globals.document.hidden = true
  connection.showPuzzle('current-puzzle')
  assert.equal(sockets[0].sent.at(-1), 'puzzle:')
  globals.document.hidden = false
  connection.showPuzzle('current-puzzle')
  assert.equal(sockets[0].sent.at(-1), 'puzzle:current-puzzle')
  sockets[0].receive('changes')
  assert.equal(changes, 1)

  t.mock.timers.setTime(45_000)
  connection.check(Date.now())
  assert.equal(sockets[0].sent.at(-1), 'ping')
  t.mock.timers.setTime(60_000)
  connection.check(Date.now())
  assert.equal(connection.isOpen(), false)
  assert.deepEqual(statuses, ['connecting', 'live', 'fallback'])
  assert.deepEqual(seenPeers.at(-1), [])
  sockets[0].receive('pong')
  assert.equal(connection.isOpen(), false)

  t.mock.timers.tick(2000)
  sockets[1].protocol = 'sudoku-sync'
  sockets[1].open()
  assert.equal(connection.isOpen(), false)
  sockets[1].receive('pong')
  assert.equal(connection.isOpen(), true)
  assert.deepEqual(sockets[1].sent, ['ping'])
  assert.deepEqual(statuses, ['connecting', 'live', 'fallback', 'live'])

  globals.navigator.onLine = false
  connection.update({ id: 'device', token: 'test-token' })
  sockets[1].receive('changes')
  assert.equal(connection.isOpen(), false)
  assert.equal(statuses.at(-1), 'inactive')
  assert.equal(changes, 1)
})
