import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

export function savedPuzzles(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('sudoku-saves')
    open.onupgradeneeded = () => open.transaction.abort()
    open.onerror = () => {
      if (open.error?.name === 'AbortError') resolve([])
      else reject(open.error)
    }
    open.onsuccess = () => {
      const db = open.result
      const transaction = db.transaction('puzzles')
      const request = transaction.objectStore('puzzles').getAll()
      transaction.oncomplete = () => db.close()
      transaction.onabort = () => db.close()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result.flatMap(({ value }) =>
        value === null ? [] : [typeof value === 'string' ? JSON.parse(value) : value]))
    }
  }))
}

export async function waitForSavedPuzzle(page, matches) {
  const deadline = Date.now() + 10_000
  do {
    const game = (await savedPuzzles(page)).find(matches)
    if (game) return game
    await setTimeout(50)
  } while (Date.now() < deadline)
  assert.fail('The expected puzzle progress did not reach IndexedDB')
}
