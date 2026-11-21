import { generatedNumberToken, type GeneratedNumberGame } from './generated.ts'
import {
  changeGeneratedSolveTotal, createGeneratedHistoryReader, generatedDifficultyTotals,
  type GeneratedHistoryRow, type GeneratedNumberResults, type NumberHistoryPage, type NumberResultStatus, type StoredSolveTotals,
} from './generated-results.ts'
import {
  advanceNumberClock, numberProgressWithClock, parseSavedNumberProgress, readNumberClock, saveNumberClock,
  saveNumberProgress, type NumberProgress, type SavedNumberProgress,
} from './progress.ts'

export type GeneratedRecord = {
  game: GeneratedNumberGame
  id: string
  number: number
  progress?: SavedNumberProgress
}
export type GeneratedIdentity = Pick<GeneratedRecord, 'id' | 'number'>

const storeName = 'generated'
const tokenIndex = 'token'
const historyStore = 'history'
const resultStatusIndex = 'status'
const sessionsStore = 'sessions'
const migrationBatchSize = 256
type IndexCheckpoint = { game: GeneratedNumberGame; number: 0; through: number; ready: boolean }
type ResultTotals = Omit<IndexCheckpoint, 'number'> & { number: -1; totals: StoredSolveTotals }
const historyReaders = {
  kakuro: createGeneratedHistoryReader('kakuro'),
  calcudoku: createGeneratedHistoryReader('calcudoku'),
}
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
    const open = indexedDB.open('sudoku-number-puzzles', 4)
    open.onupgradeneeded = ({ oldVersion }) => {
      const db = open.result
      const sessions = oldVersion < 3 ? db.createObjectStore(sessionsStore) : open.transaction!.objectStore(sessionsStore)
      const history = oldVersion < 2 ? db.createObjectStore(historyStore, { keyPath: ['game', 'number'] })
        : open.transaction!.objectStore(historyStore)
      history.createIndex(resultStatusIndex, ['game', 'status', 'number'])
      if (oldVersion === 0) {
        const store = db.createObjectStore(storeName, { keyPath: ['game', 'number'] })
        store.createIndex(tokenIndex, ['game', 'id'], { unique: true })
        for (const game of ['kakuro', 'calcudoku'] as const) {
          const checkpoint = { game, number: 0, through: 0, ready: true } satisfies IndexCheckpoint
          history.put(checkpoint)
          history.put({ ...checkpoint, number: -1, totals: new Map() } satisfies ResultTotals)
          sessions.put(checkpoint, [game, 0])
        }
      }
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

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, history: IDBObjectStore, sessions: IDBObjectStore) => Promise<T>,
  options?: IDBTransactionOptions,
) {
  const db = await openDatabase()
  const transaction = db.transaction([storeName, historyStore, sessionsStore], mode, options)
  const finished = transactionDone(transaction)
  const work = operation(
    transaction.objectStore(storeName), transaction.objectStore(historyStore), transaction.objectStore(sessionsStore),
  ).catch(error => {
    try { transaction.abort() } catch { /* The transaction can already be closed. */ }
    throw error
  })
  const [, result] = await Promise.all([finished, work])
  return result
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}

function gameRange(game: GeneratedNumberGame, after = 0) {
  return IDBKeyRange.bound([game, after + 1], [game, Infinity])
}

function statusRange(game: GeneratedNumberGame, status: NumberResultStatus, after = 0) {
  return IDBKeyRange.bound([game, status, after + 1], [game, status, Infinity])
}

function saveSession(sessions: IDBObjectStore, { game, id, number }: GeneratedRecord) {
  sessions.put({ id, number } satisfies GeneratedIdentity, [game, number])
}

function saveHistoryRow(history: IDBObjectStore, record: GeneratedRecord) {
  const row = historyReaders[record.game](record)
  if (row) history.put(row)
  else if (record.progress) history.delete([record.game, record.number])
  return row
}

function readResultTotals(history: IDBObjectStore, game: GeneratedNumberGame) {
  return readRequest<ResultTotals | undefined>(history.get([game, -1]))
}

async function updateHistoryRow(history: IDBObjectStore, record: GeneratedRecord, previous?: GeneratedRecord) {
  const row = saveHistoryRow(history, record)
  const before = previous && historyReaders[record.game](previous)
  const removed = before?.status === 'solved' ? before : undefined
  const added = row?.status === 'solved' ? row : undefined
  if (removed?.difficulty === added?.difficulty && removed?.elapsed === added?.elapsed) return

  const summary = await readResultTotals(history, record.game)
  // A batch that has yet to reach this record will see its latest result.
  if (!summary || (!summary.ready && record.number > summary.through)) return
  if (removed) changeGeneratedSolveTotal(summary.totals, removed, -1)
  if (added) changeGeneratedSolveTotal(summary.totals, added, 1)
  history.put(summary)
}

async function migrateLegacy(game: GeneratedNumberGame) {
  const legacy = await readLegacy(game)
  if (legacy.ids.size === 0) return
  if (legacy.history === null && legacy.positions.size === 0) {
    for (const id of legacy.pending.keys()) await writeGeneratedRecord(game, id)
    return
  }

  const copied = new Map<string, string>()
  await runTransaction('readwrite', async (store, history, sessions) => {
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
      const record: GeneratedRecord = {
        game, id, number: saved?.number ?? ++number,
        progress: progress && numberProgressWithClock(progress, saved?.progress),
      }
      store.put(record)
      if (!saved) saveSession(sessions, record)
      await updateHistoryRow(history, record, saved)
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

// The window prepares legacy and pending saves before either worker reads the database.
export function readGeneratedRecords(game: GeneratedNumberGame): Promise<GeneratedRecord[]> {
  return runTransaction('readonly', store => readRequest(store.getAll(gameRange(game))))
}

function readCheckpoint(store: IDBObjectStore, game: GeneratedNumberGame) {
  return readRequest<IndexCheckpoint | undefined>(store.get([game, 0]))
}

type PickerHistory =
  | { rows: GeneratedHistoryRow[]; totals?: GeneratedNumberResults['totals']; indexPending: boolean }
  | { records: GeneratedRecord[]; indexPending: true }

export function readGeneratedPickerHistory(game: GeneratedNumberGame, status: NumberResultStatus, page?: NumberHistoryPage): Promise<PickerHistory> {
  return runTransaction('readonly', async (store, history, sessions) => {
    const [resultIndex, sessionIndex, summary] = await Promise.all([
      readCheckpoint(history, game), readCheckpoint(sessions, game), readResultTotals(history, game),
    ])
    if (summary?.ready || (resultIndex?.ready && page?.after)) {
      const range = statusRange(game, status, page?.after)
      const index = history.index(resultStatusIndex)
      const rows = await readRequest<GeneratedHistoryRow[]>(page ? index.getAll(range, page.limit + 1) : index.getAll(range))
      const totals = summary?.ready && !page?.after ? generatedDifficultyTotals(summary.totals) : undefined
      return { rows, totals, indexPending: !summary?.ready || !sessionIndex?.ready }
    }
    if (resultIndex?.ready) {
      return { rows: await readRequest(history.getAll(gameRange(game))), indexPending: true }
    }
    if (page?.after) {
      // The first page can arrive before the legacy index finishes.
      const rows: GeneratedHistoryRow[] = []
      let after = page.after
      while (rows.length <= page.limit) {
        const records = await readRequest<GeneratedRecord[]>(store.getAll(gameRange(game, after), migrationBatchSize))
        for (const record of records) {
          const row = historyReaders[game](record)
          if (row?.status !== status) continue
          rows.push(row)
          if (rows.length > page.limit) break
        }
        if (records.length < migrationBatchSize) break
        after = records[records.length - 1].number
      }
      return { rows, indexPending: true }
    }
    return { records: await readRequest(store.getAll(gameRange(game))), indexPending: true }
  })
}

export async function indexGeneratedHistory(game: GeneratedNumberGame, cancelled: () => boolean = () => false) {
  async function indexBatch() {
    return runTransaction('readwrite', async (store, history, sessions) => {
      const [resultIndex, sessionIndex] = await Promise.all([readCheckpoint(history, game), readCheckpoint(sessions, game)])
      // An older database can have result summaries ahead of its session index.
      const resultsThrough = resultIndex?.ready ? Infinity : resultIndex?.through ?? 0
      const sessionsThrough = sessionIndex?.ready ? Infinity : sessionIndex?.through ?? 0
      const through = Math.min(resultsThrough, sessionsThrough)
      if (through === Infinity) return true
      const records = await readRequest<GeneratedRecord[]>(store.getAll(gameRange(game, through), migrationBatchSize))
      for (const record of records) {
        if (record.number > resultsThrough) saveHistoryRow(history, record)
        if (record.number > sessionsThrough) saveSession(sessions, record)
      }
      const ready = records.length < migrationBatchSize
      const checkpoint = { game, number: 0, through: records.at(-1)?.number ?? through, ready } satisfies IndexCheckpoint
      if (!resultIndex?.ready && (ready || checkpoint.through > resultsThrough)) history.put(checkpoint)
      if (!sessionIndex?.ready && (ready || checkpoint.through > sessionsThrough)) sessions.put(checkpoint, [game, 0])
      return ready
    }, { durability: 'relaxed' })
  }
  // Each batch reads the current saves and commits their results with the checkpoint.
  while (!cancelled() && !await indexBatch()) await nextTask()

  async function totalBatch() {
    return runTransaction('readwrite', async (_, history) => {
      const summary = await readResultTotals(history, game) ??
        { game, number: -1, through: 0, ready: false, totals: new Map() } satisfies ResultTotals
      if (summary.ready) return true
      const rows = await readRequest<GeneratedHistoryRow[]>(history.index(resultStatusIndex)
        .getAll(statusRange(game, 'solved', summary.through), migrationBatchSize))
      for (const row of rows) changeGeneratedSolveTotal(summary.totals, row, 1)
      summary.ready = rows.length < migrationBatchSize
      summary.through = rows.at(-1)?.number ?? summary.through
      history.put(summary)
      return summary.ready
    }, { durability: 'relaxed' })
  }
  while (!cancelled() && !await totalBatch()) await nextTask()
}

export async function generatedNumberHistory(game: GeneratedNumberGame): Promise<GeneratedRecord[]> {
  try {
    await prepareGeneratedHistory(game)
    return await readGeneratedRecords(game)
  } catch {
    const { ids, positions, pending } = await readLegacy(game)
    return Array.from(ids, (id, index) => ({
      game, id, number: index + 1, progress: pending.get(id)?.progress ?? positions.get(id)?.progress,
    }))
  }
}

// The worker reads immutable identities. The main thread prepares legacy saves before it starts the worker.
export async function readGeneratedSessions(game: GeneratedNumberGame, checkpoint?: GeneratedIdentity) {
  return runTransaction('readonly', async (store, _, sessions) => {
    const [anchor, index] = await Promise.all([
      checkpoint && readRequest(store.index(tokenIndex).getKey([game, checkpoint.id])),
      readCheckpoint(sessions, game),
    ])
    const reset = Boolean(checkpoint && (!Array.isArray(anchor) || anchor[1] !== checkpoint.number))
    const range = gameRange(game, checkpoint && !reset ? checkpoint.number : 0)
    if (index?.ready) return { reset, sessions: await readRequest<GeneratedIdentity[]>(sessions.getAll(range)) }
    const records: GeneratedRecord[] = await readRequest(store.getAll(range))
    return { reset, sessions: records.map(({ id, number }) => ({ id, number })) }
  })
}

async function writeGeneratedRecord(game: GeneratedNumberGame, id: string, progress?: SavedNumberProgress, staged?: string) {
  const key = pendingPositionKey(game, id)
  const { record, consumed } = await runTransaction('readwrite', async (store, history, sessions) => {
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
    if (!existing) saveSession(sessions, record)
    await updateHistoryRow(history, record, existing)
    return { record, consumed: next ? pending : null }
  })
  removeLocalVersion(key, consumed)
  return record
}

async function readGeneratedRecord(game: GeneratedNumberGame, id: string) {
  const db = await openDatabase()
  const store = db.transaction(storeName).objectStore(storeName)
  return readRequest<GeneratedRecord | undefined>(store.index(tokenIndex).get([game, id]))
}

export async function openGeneratedNumberPuzzle(
  game: GeneratedNumberGame, id: string, { readOnlyIfSaved = false } = {},
): Promise<GeneratedRecord> {
  try {
    await prepareGeneratedHistory(game)
    if (readOnlyIfSaved) {
      const record = await readGeneratedRecord(game, id).catch(() => undefined)
      // A staged move must pass through the regular write and recovery path.
      if (record && localValue(pendingPositionKey(game, id)) === null) return record
    }
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
  const { position, past, future, clock, lastPlayed } = next
  const progress = numberProgressWithClock({ ...position, past, future, clock, lastPlayed }, parseSavedNumberProgress(localValue(key)) ?? undefined)
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
    return await runTransaction('readwrite', async (store, history) => {
      const record: GeneratedRecord | undefined = await readRequest(store.index(tokenIndex).get([game, id]))
      if (!record?.progress) return
      const previous = readNumberClock(record.progress.clock)
      const clock = advanceNumberClock(previous, change)
      if (clock !== previous) {
        const updated = { ...record, progress: { ...record.progress, clock } }
        store.put(updated)
        await updateHistoryRow(history, updated, record)
      }
      return clock
    })
  } catch {
    return saveNumberClock(pendingPositionKey(game, id), change) ?? saveNumberClock(numberPositionKey(game, id), change)
  }
}
