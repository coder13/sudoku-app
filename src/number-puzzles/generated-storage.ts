import { generatedNumberToken, type GeneratedNumberGame } from './generated.ts'
import { parseSavedNumberProgress, saveNumberProgress, type NumberProgress, type SavedNumberProgress } from './progress.ts'

type GeneratedRecord = {
  game: GeneratedNumberGame
  id: string
  number: number
  progress?: SavedNumberProgress
}

const storeName = 'generated'
const tokenIndex = 'token'
const migrationBatchSize = 256
let database: Promise<IDBDatabase> | undefined
const migrations = new Map<GeneratedNumberGame, Promise<void>>()

export function numberPositionKey(game: string, id: string) {
  return `${game}.position.v1.${id}`
}

function legacyHistoryKey(game: GeneratedNumberGame) {
  return `${game}.generated.v1`
}

async function readLegacy(game: GeneratedNumberGame) {
  const positions = new Map<string, { raw: string; progress: SavedNumberProgress }>()
  const ids = new Set<string>()
  let history: string | null = null
  try {
    history = localStorage.getItem(legacyHistoryKey(game))
    try {
      const stored: unknown = JSON.parse(history ?? '[]')
      if (Array.isArray(stored)) {
        for (const id of stored) if (generatedNumberToken(id)) ids.add(id)
      }
    } catch { /* Individual positions can still be recovered. */ }

    const prefix = numberPositionKey(game, '')
    const keys = Object.keys(localStorage)
    for (const [index, key] of keys.entries()) {
      if (index && index % migrationBatchSize === 0) await nextTask()
      if (!key.startsWith(prefix)) continue
      const id = generatedNumberToken(key.slice(prefix.length))
      if (!id) continue
      const raw = localStorage.getItem(key)
      const progress = parseSavedNumberProgress(raw)
      if (progress && raw !== null) {
        ids.add(id)
        positions.set(id, { raw, progress })
      }
    }
  } catch { /* The database can still work when local storage is unavailable. */ }
  return { ids, history, positions }
}

function nextTask() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('sudoku-number-puzzles', 1)
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(storeName, { keyPath: ['game', 'number'] })
      store.createIndex(tokenIndex, ['game', 'id'], { unique: true })
    }
    open.onsuccess = () => {
      const db = open.result
      db.onversionchange = () => {
        db.close()
        database = undefined
        migrations.clear()
      }
      resolve(db)
    }
    open.onerror = () => reject(open.error)
  }).catch(error => {
    database = undefined
    throw error
  })
  return database
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, mode)
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
  const [result] = await Promise.all([operation(transaction.objectStore(storeName)), complete])
  return result
}

function gameRange(game: GeneratedNumberGame) {
  return IDBKeyRange.bound([game, 1], [game, Infinity])
}

async function migrateLegacy(game: GeneratedNumberGame) {
  const legacy = await readLegacy(game)
  if (legacy.ids.size === 0) return

  const copied = new Set<string>()
  await runTransaction('readwrite', async store => {
    const existing: GeneratedRecord[] = await readRequest(store.getAll(gameRange(game)))
    const known = new Map(existing.map(record => [record.id, record]))
    let number = existing.at(-1)?.number ?? 0
    let writes = 0
    for (const id of legacy.ids) {
      const saved = known.get(id)
      const progress = legacy.positions.get(id)?.progress
      if (saved?.progress && progress && JSON.stringify(saved.progress) === JSON.stringify(progress)) copied.add(id)
      if (saved && (saved.progress || !progress)) continue
      if (progress) copied.add(id)
      store.put({ game, id, number: saved?.number ?? ++number, progress } satisfies GeneratedRecord)
      // Let the browser handle input between batches while this transaction stays open.
      if (++writes % migrationBatchSize === 0) await readRequest(store.get([game, 0]))
    }
  })

  // Remove only the versions that the transaction copied.
  try {
    let removals = 0
    for (const id of copied) {
      const key = numberPositionKey(game, id)
      if (localStorage.getItem(key) === legacy.positions.get(id)?.raw) localStorage.removeItem(key)
      if (++removals % migrationBatchSize === 0) await nextTask()
    }
    const key = legacyHistoryKey(game)
    if (localStorage.getItem(key) === legacy.history) localStorage.removeItem(key)
  } catch { /* The database now holds the migrated records. */ }
}

function prepareGame(game: GeneratedNumberGame) {
  let migration = migrations.get(game)
  if (!migration) {
    migration = openDatabase().then(() => migrateLegacy(game)).catch(error => {
      migrations.delete(game)
      throw error
    })
    migrations.set(game, migration)
  }
  return migration
}

export async function generatedNumberHistory(game: GeneratedNumberGame): Promise<GeneratedRecord[]> {
  try {
    await prepareGame(game)
    return await runTransaction('readonly', store => readRequest(store.getAll(gameRange(game))))
  } catch {
    const { ids, positions } = await readLegacy(game)
    return Array.from(ids, (id, index) => ({ game, id, number: index + 1, progress: positions.get(id)?.progress }))
  }
}

async function writeGeneratedRecord(game: GeneratedNumberGame, id: string, progress?: SavedNumberProgress) {
  return runTransaction('readwrite', async store => {
    const existing: GeneratedRecord | undefined = await readRequest(store.index(tokenIndex).get([game, id]))
    if (existing && !progress) return existing
    let number = existing?.number
    if (number === undefined) {
      const last = await readRequest(store.openKeyCursor(gameRange(game), 'prev'))
      number = last ? (last.primaryKey as [GeneratedNumberGame, number])[1] + 1 : 1
    }
    const record: GeneratedRecord = { game, id, number, progress }
    store.put(record)
    return record
  })
}

export async function openGeneratedNumberPuzzle(game: GeneratedNumberGame, id: string): Promise<GeneratedRecord> {
  try {
    await prepareGame(game)
    return await writeGeneratedRecord(game, id)
  } catch {
    const { ids, positions } = await readLegacy(game)
    if (!ids.has(id)) {
      ids.add(id)
      try { localStorage.setItem(legacyHistoryKey(game), JSON.stringify([...ids])) } catch { /* The board link still works. */ }
    }
    return { game, id, number: [...ids].indexOf(id) + 1, progress: positions.get(id)?.progress }
  }
}

export async function saveGeneratedNumberProgress(game: GeneratedNumberGame, id: string, { position, past, future }: NumberProgress) {
  try { await prepareGame(game) } catch {
    return saveNumberProgress(numberPositionKey(game, id), { position, past, future })
  }
  try {
    await writeGeneratedRecord(game, id, { ...position, past, future })
    return true
  } catch { return false }
}
