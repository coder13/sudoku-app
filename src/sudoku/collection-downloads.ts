import { COLLECTIONS, findCollectionGame, type CollectionPuzzleInfo, type PuzzleCollection } from './collections.ts'
import { collectionGridHash } from './collection-integrity.ts'
import type { Game } from './game.ts'

const PREFIX = 'sudoku-app:v1:collection-download:'
type Grids = Readonly<Record<string, string>>
type Downloads = Readonly<Record<string, Grids>>
const empty: Downloads = {}

export function collectionDownloadUrl(collection: PuzzleCollection, puzzle: CollectionPuzzleInfo) {
  return `/collections/${collection.id}/${puzzle.id}-${puzzle.givensHash}.txt`
}

export function formatCollectionBytes(bytes: number) {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} KB`
}

export function collectionDownloadBytes(puzzles: readonly CollectionPuzzleInfo[]) {
  return puzzles.reduce((sum, puzzle) => sum + puzzle.bytes, 0)
}

export function validCollectionGrid(puzzle: CollectionPuzzleInfo, value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{81}$/.test(value) && collectionGridHash(value) === puzzle.givensHash
}

export async function fetchCollectionGrid(collection: PuzzleCollection, puzzle: CollectionPuzzleInfo,
  signal?: AbortSignal, request = fetch) {
  const unavailable = 'This puzzle could not load. Connect to the internet and try again.'
  let givens: string
  try {
    const response = await request(collectionDownloadUrl(collection, puzzle), { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(unavailable)
    givens = await response.text()
  } catch (error) {
    if (error instanceof TypeError) throw new Error(unavailable)
    throw error
  }
  signal?.throwIfAborted()
  if (!validCollectionGrid(puzzle, givens)) throw new Error('The puzzle data is invalid. Try again after updating the app.')
  return givens
}

// Store only downloaded grids. Playing a puzzle still uses the existing game store.
// One write commits a batch, so failures cannot claim that a partial batch is ready.
export function createCollectionDownloadStore(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage,
  request: typeof fetch = (...args) => fetch(...args)) {
  let snapshot: Downloads = empty
  const listeners = new Set<() => void>()
  const pending = new Set<string>()

  function read(collection: PuzzleCollection): Record<string, string> {
    try {
      const value: unknown = JSON.parse(storage().getItem(PREFIX + collection.id) ?? '{}')
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
      return Object.fromEntries(collection.puzzles.flatMap(puzzle => {
        const givens = (value as Record<string, unknown>)[puzzle.id]
        return validCollectionGrid(puzzle, givens) ? [[puzzle.id, givens]] : []
      }))
    } catch { return {} }
  }

  function publish(value: Downloads) {
    snapshot = value
    listeners.forEach(listener => listener())
  }

  const store = {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    connect() {
      function reload() { publish(Object.fromEntries(COLLECTIONS.map(collection => [collection.id, read(collection)]))) }
      function changed(event: StorageEvent) { if (!event.key || event.key.startsWith(PREFIX)) reload() }
      reload()
      window.addEventListener('storage', changed)
      return () => window.removeEventListener('storage', changed)
    },
    grids(collection: PuzzleCollection, games: readonly Game[] = []): Grids {
      const grids = { ...snapshot[collection.id] }
      // Keep puzzles from earlier app versions and matching imports playable offline.
      for (const puzzle of collection.puzzles) {
        const existing = findCollectionGame(puzzle, games)
        if (existing) grids[puzzle.id] = existing.givens
      }
      return grids
    },
    async download(collection: PuzzleCollection, puzzles: readonly CollectionPuzzleInfo[], options: {
      games?: readonly Game[]; signal?: AbortSignal; onProgress?: (done: number, total: number) => void
    } = {}) {
      if (pending.has(collection.id)) throw new Error('This collection already has a download in progress.')
      const saved = { ...read(collection), ...store.grids(collection, options.games) }
      const selection = [...new Set(puzzles.map(puzzle => puzzle.id))].map(id => {
        const puzzle = collection.puzzles.find(puzzle => puzzle.id === id)
        if (!puzzle) throw new Error('This puzzle is not in the collection.')
        return puzzle
      }).filter(puzzle => !saved[puzzle.id])
      if (!selection.length) return 0
      const controller = new AbortController()
      const abort = () => controller.abort()
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) abort()
      const received: Record<string, string> = {}
      let cursor = 0
      let done = 0
      pending.add(collection.id)
      try {
        controller.signal.throwIfAborted()
        options.onProgress?.(0, selection.length)
        await Promise.all(Array.from({ length: Math.min(4, selection.length) }, async () => {
          while (cursor < selection.length) {
            controller.signal.throwIfAborted()
            const puzzle = selection[cursor++]
            received[puzzle.id] = await fetchCollectionGrid(collection, puzzle, controller.signal, request)
            options.onProgress?.(++done, selection.length)
          }
        }))
        controller.signal.throwIfAborted()
        const merged = { ...read(collection), ...received }
        try { storage().setItem(PREFIX + collection.id, JSON.stringify(merged)) }
        catch { throw new Error('These puzzles could not be saved. Free some device storage or allow this site to save data, then try again.') }
        publish({ ...snapshot, [collection.id]: merged })
        return selection.length
      } catch (error) {
        controller.abort()
        throw error
      } finally {
        pending.delete(collection.id)
        options.signal?.removeEventListener('abort', abort)
      }
    },
  }
  return store
}

export const collectionDownloads = createCollectionDownloadStore()
