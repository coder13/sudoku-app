import type { NumberPuzzleDifficulty } from './catalog.ts'
import type { GeneratedNumberGame } from './generated.ts'
import { readRequest, transactionDone, type GeneratedIdentity } from './generated-storage.ts'

export type PuzzleLayout = { difficulty: NumberPuzzleDifficulty; signature: string; latest: number }

export const layoutsStore = 'layouts'
const recentIndex = 'recent'
const checkpointStore = 'checkpoints'
const checkpointKey = 'latest'

export function openLayoutIndex(game: GeneratedNumberGame): Promise<IDBDatabase> {
  const open = indexedDB.open(`sudoku-${game}-layouts`, 1)
  open.onupgradeneeded = () => {
    const layouts = open.result.createObjectStore(layoutsStore, { keyPath: ['difficulty', 'signature'] })
    layouts.createIndex(recentIndex, ['difficulty', 'latest'])
    open.result.createObjectStore(checkpointStore)
  }
  return readRequest(open)
}

export function readLayoutCheckpoint(db: IDBDatabase) {
  const read = db.transaction(checkpointStore)
  return readRequest<GeneratedIdentity | undefined>(read.objectStore(checkpointStore).get(checkpointKey))
}

export function readRecentLayouts<Layout extends PuzzleLayout>(
  store: IDBObjectStore, difficulty: NumberPuzzleDifficulty, limit: number,
): Promise<Layout[]> {
  const range = IDBKeyRange.bound([difficulty, 1], [difficulty, Infinity])
  const request = store.index(recentIndex).openCursor(range, 'prev')
  return new Promise((resolve, reject) => {
    const recent: Layout[] = []
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(recent)
        return
      }
      recent.push(cursor.value)
      if (recent.length === limit) resolve(recent)
      else cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveLayouts<Layout extends PuzzleLayout>(
  db: IDBDatabase,
  checkpoint: GeneratedIdentity | undefined,
  last: GeneratedIdentity | undefined,
  additions: readonly Layout[],
  rebuild: boolean,
  merge?: (previous: Layout, addition: Layout) => Layout,
) {
  const write = db.transaction([layoutsStore, checkpointStore], 'readwrite', { durability: 'relaxed' })
  const finish = transactionDone(write)
  const apply = async () => {
    try {
      const markers = write.objectStore(checkpointStore)
      const current: GeneratedIdentity | undefined = await readRequest(markers.get(checkpointKey))
      // A second worker can finish while this worker reads the saved sessions.
      if (current?.number !== checkpoint?.number || current?.id !== checkpoint?.id) return false
      const layouts = write.objectStore(layoutsStore)
      if (rebuild) layouts.clear()
      await Promise.all(additions.map(async addition => {
        const previous: Layout | undefined = merge && !rebuild
          ? await readRequest(layouts.get([addition.difficulty, addition.signature])) : undefined
        layouts.put(previous && merge ? merge(previous, addition) : addition)
      }))
      if (last) markers.put(last, checkpointKey)
      else markers.delete(checkpointKey)
      return true
    } catch (error) {
      try { write.abort() } catch { /* IndexedDB may have already aborted the write. */ }
      throw error
    }
  }
  const [updated] = await Promise.all([apply(), finish])
  return updated
}
