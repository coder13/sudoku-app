import { generatedNumberToken, type GeneratedNumberGame } from './generated.ts'
import {
  advanceNumberClock, numberProgressWithClock, parseSavedNumberProgress, readNumberClock, saveNumberClock,
  saveNumberProgress, type NumberProgress, type SavedNumberProgress,
} from './progress.ts'

type GeneratedRecord = {
  game: GeneratedNumberGame
  id: string
  number: number
  progress?: SavedNumberProgress
}
export type GeneratedIdentity = Pick<GeneratedRecord, 'id' | 'number'>

const storeName = 'generated'
const tokenIndex = 'token'
const migrationBatchSize = 256
let database: Promise<IDBDatabase> | undefined
const migrations = new Map<GeneratedNumberGame, Promise<void>>()
type LocalPosition = { raw: string; progress: SavedNumberProgress }

export function numberPositionKey(game: string, id: string) {
  return `${game}.position.v1.${id}`
}

function legacyHistoryKey(game: GeneratedNumberGame) {
  return `${game}.generated.v1`
}

function pendingPositionKey(game: GeneratedNumberGame, id: string) {
  return `${game}.pending-position.v1.${id}`
}

function localValue(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function removeLocalVersion(key: string, raw: string | null) {
  try {
    if (raw !== null && localStorage.getItem(key) === raw) localStorage.removeItem(key)
  } catch { /* The database already holds the saved record. */ }
}

async function readLegacy(game: GeneratedNumberGame) {
  const positions = new Map<string, LocalPosition>()
  const pending = new Map<string, LocalPosition>()
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
    const pendingPrefix = pendingPositionKey(game, '')
    const keys = Object.keys(localStorage)
    for (const [index, key] of keys.entries()) {
      if (index && index % migrationBatchSize === 0) await nextTask()
      const current = key.startsWith(pendingPrefix)
      if (!current && !key.startsWith(prefix)) continue
      const id = generatedNumberToken(key.slice(current ? pendingPrefix.length : prefix.length))
      if (!id) continue
      const raw = localStorage.getItem(key)
      const progress = parseSavedNumberProgress(raw)
      if (progress && raw !== null) {
        ids.add(id)
        const destination = current ? pending : positions
        destination.set(id, { raw, progress })
      }
    }
  } catch { /* The database can still work when local storage is unavailable. */ }
  return { ids, history, positions, pending }
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

export function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, mode)
  const [, result] = await Promise.all([transactionDone(transaction), operation(transaction.objectStore(storeName))])
  return result
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}

function gameRange(game: GeneratedNumberGame) {
  return IDBKeyRange.bound([game, 1], [game, Infinity])
}

async function migrateLegacy(game: GeneratedNumberGame) {
  const legacy = await readLegacy(game)
  if (legacy.ids.size === 0) return
  if (legacy.history === null && legacy.positions.size === 0) {
    for (const id of legacy.pending.keys()) await writeGeneratedRecord(game, id)
    return
  }

  const copied = new Map<string, string>()
  await runTransaction('readwrite', async store => {
    const existing: GeneratedRecord[] = await readRequest(store.getAll(gameRange(game)))
    const known = new Map(existing.map(record => [record.id, record]))
    let number = existing.at(-1)?.number ?? 0
    let writes = 0
    for (const id of legacy.ids) {
      const saved = known.get(id)
      const pendingKey = pendingPositionKey(game, id)
      const pending = legacy.pending.get(id)
      const current = pending && localValue(pendingKey) === pending.raw ? pending : undefined
      const previous = legacy.positions.get(id)
      const progress = current?.progress ?? previous?.progress
      const same = previous && JSON.stringify(saved?.progress) === JSON.stringify(previous.progress)

      if (previous && (current || !saved?.progress || same)) copied.set(numberPositionKey(game, id), previous.raw)
      if (current) copied.set(pendingKey, current.raw)
      if (saved && !current && (saved.progress || !progress)) continue
      store.put({
        game, id, number: saved?.number ?? ++number,
        progress: progress && numberProgressWithClock(progress, saved?.progress),
      } satisfies GeneratedRecord)
      // Let the browser handle input between batches while this transaction stays open.
      if (++writes % migrationBatchSize === 0) await readRequest(store.get([game, 0]))
    }
  })

  // Remove only the versions that the transaction copied.
  let removals = 0
  for (const [key, raw] of copied) {
    removeLocalVersion(key, raw)
    if (++removals % migrationBatchSize === 0) await nextTask()
  }
  removeLocalVersion(legacyHistoryKey(game), legacy.history)
}

export function prepareGeneratedHistory(game: GeneratedNumberGame) {
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
    await prepareGeneratedHistory(game)
    return await runTransaction('readonly', store => readRequest(store.getAll(gameRange(game))))
  } catch {
    const { ids, positions, pending } = await readLegacy(game)
    return Array.from(ids, (id, index) => ({
      game, id, number: index + 1, progress: pending.get(id)?.progress ?? positions.get(id)?.progress,
    }))
  }
}

// The worker reads immutable identities. The main thread prepares legacy saves before it starts the worker.
export async function readCalcudokuSessions(checkpoint?: GeneratedIdentity) {
  return runTransaction('readonly', async store => {
    const anchor: GeneratedRecord | undefined = checkpoint
      ? await readRequest(store.get(['calcudoku', checkpoint.number])) : undefined
    const reset = Boolean(checkpoint && anchor?.id !== checkpoint.id)
    const range = checkpoint && !reset
      ? IDBKeyRange.bound(['calcudoku', checkpoint.number], ['calcudoku', Infinity], true)
      : gameRange('calcudoku')
    const records: GeneratedRecord[] = await readRequest(store.getAll(range))
    return { reset, sessions: records.map(({ id, number }) => ({ id, number })) }
  })
}

async function writeGeneratedRecord(game: GeneratedNumberGame, id: string, progress?: SavedNumberProgress, staged?: string) {
  const key = pendingPositionKey(game, id)
  const { record, consumed } = await runTransaction('readwrite', async store => {
    const existing: GeneratedRecord | undefined = await readRequest(store.index(tokenIndex).get([game, id]))
    const pending = localValue(key)
    const superseded = staged !== undefined && staged !== pending
    const next = superseded ? undefined : progress ?? parseSavedNumberProgress(pending) ?? undefined
    if (existing && !next) return { record: existing, consumed: null }
    let number = existing?.number
    if (number === undefined) {
      const last = await readRequest(store.openKeyCursor(gameRange(game), 'prev'))
      number = last ? (last.primaryKey as [GeneratedNumberGame, number])[1] + 1 : 1
    }
    const record: GeneratedRecord = { game, id, number, progress: next && numberProgressWithClock(next, existing?.progress) }
    store.put(record)
    return { record, consumed: next ? pending : null }
  })
  removeLocalVersion(key, consumed)
  return record
}

export async function openGeneratedNumberPuzzle(game: GeneratedNumberGame, id: string): Promise<GeneratedRecord> {
  try {
    await prepareGeneratedHistory(game)
    return await writeGeneratedRecord(game, id)
  } catch {
    const { ids, positions, pending } = await readLegacy(game)
    if (!ids.has(id)) {
      ids.add(id)
      try { localStorage.setItem(legacyHistoryKey(game), JSON.stringify([...ids])) } catch { /* The board link still works. */ }
    }
    return { game, id, number: [...ids].indexOf(id) + 1, progress: pending.get(id)?.progress ?? positions.get(id)?.progress }
  }
}

export async function saveGeneratedNumberProgress(game: GeneratedNumberGame, id: string, next: NumberProgress) {
  const key = pendingPositionKey(game, id)
  const { position, past, future, clock } = next
  const progress = numberProgressWithClock({ ...position, past, future, clock }, parseSavedNumberProgress(localValue(key)) ?? undefined)
  let staged: string | undefined
  // Keep the move across a reload until IndexedDB commits it.
  try {
    const raw = JSON.stringify(progress)
    localStorage.setItem(key, raw)
    staged = raw
  } catch { /* IndexedDB can still save if local storage is full. */ }

  try { await prepareGeneratedHistory(game) } catch {
    const saved = saveNumberProgress(numberPositionKey(game, id), next)
    if (saved && staged !== undefined) removeLocalVersion(key, staged)
    return saved || staged !== undefined
  }
  try {
    await writeGeneratedRecord(game, id, progress, staged)
    return true
  } catch { return staged !== undefined }
}

export async function saveGeneratedNumberClock(game: GeneratedNumberGame, id: string, change: number | 'untimed') {
  try {
    await prepareGeneratedHistory(game)
    return await runTransaction('readwrite', async store => {
      const record: GeneratedRecord | undefined = await readRequest(store.index(tokenIndex).get([game, id]))
      if (!record?.progress) return
      const previous = readNumberClock(record.progress.clock)
      const clock = advanceNumberClock(previous, change)
      if (clock !== previous) store.put({ ...record, progress: { ...record.progress, clock } })
      return clock
    })
  } catch {
    return saveNumberClock(pendingPositionKey(game, id), change) ?? saveNumberClock(numberPositionKey(game, id), change)
  }
}
