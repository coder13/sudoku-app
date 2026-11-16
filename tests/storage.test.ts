import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, makeGame, STARTER_GAME } from '../src/sudoku/game.ts'

class MemoryStorage {
  get length() { return Object.keys(this).length }

  key(index: number) { return Object.keys(this)[index] ?? null }

  getItem(key: string) {
    const values = this as unknown as Record<string, unknown>
    return Object.hasOwn(values, key) ? String(values[key]) : null
  }

  setItem(key: string, value: string) {
    Object.defineProperty(this, key, { value: String(value), writable: true, enumerable: true, configurable: true })
  }

  removeItem(key: string) { delete (this as unknown as Record<string, unknown>)[key] }

  clear() { Object.keys(this).forEach((key) => this.removeItem(key)) }
}

test('the puzzle library hydrates synchronously when the client module reloads', async () => {
  const local = new MemoryStorage()
  const session = new MemoryStorage()
  const game = makeGame('hot-reload', 'Hot reload', EMPTY, 'custom')
  game.position.corner[4] = 1 << 6
  local.setItem('sudoku-app:v1:game:hot-reload', JSON.stringify(game))
  local.setItem('sudoku-app:v1:game:warmup', JSON.stringify(STARTER_GAME))
  local.setItem('sudoku-app:v1:initialized', '1')
  local.setItem('sudoku-app:v1:active', game.id)

  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: session, configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts')
    const snapshot = roomStore.getSnapshot()
    assert.equal(snapshot.active, game.id)
    assert.equal(snapshot.games.find(({ id }) => id === game.id)?.position.corner[4], 1 << 6)
    assert.equal(snapshot.games.some(({ id }) => id === STARTER_GAME.id), false)
    assert.equal(local.getItem('sudoku-app:v1:game:warmup'), null)
  } finally {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})
