import type { Game } from './game.ts'
import { activityPrefix } from './puzzle-activity.ts'
import { createUuid } from '../uuid.ts'

export const GAME_PREFIX = 'sudoku-app:v1:game:'
const legacyPrefix = 'gridroom:v1:game:'
const legacyActivity = 'gridroom:v1:played:'
const storeName = 'puzzles'
const changeKey = 'sudoku-app:puzzle-saved'
const checkpointPrefix = 'sudoku-app:save-checkpoint:'

export type PuzzleVersion = number | string
type EditStamp = { writer: string; sequence: number }
type Checkpoint = EditStamp & { version?: PuzzleVersion; game: Game | null; played?: number }
export type PuzzleSave = { id: string; version: PuzzleVersion; value: Game | string | null; played?: number; stamp?: EditStamp }
type PuzzleCopy = { game: Game; played: number }
type PuzzleWrite = { game: Game | null; played?: number; copy?: PuzzleCopy; stamp?: EditStamp }
type SaveResult = { saved: boolean; record?: PuzzleSave; copied?: boolean }
export type PuzzleSaves = {
  read(id: string): Promise<PuzzleSave | undefined>
  ids(): Promise<string[]>
  change(id: string, version: PuzzleVersion | undefined, game: Game | null, played?: number, copy?: PuzzleCopy): Promise<SaveResult>
}

function legacySave(storage: Storage, id: string): PuzzleSave | undefined {
  const value = storage.getItem(GAME_PREFIX + id) ?? storage.getItem(legacyPrefix + id)
  if (value !== null) return { id, version: value, value, played: Number(storage.getItem(activityPrefix + id) ?? storage.getItem(legacyActivity + id)) || undefined }
}

function legacyIds(storage: Storage) {
  const ids = new Set<string>()
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index) ?? ''
    if (key.startsWith(GAME_PREFIX)) ids.add(key.slice(GAME_PREFIX.length))
    if (key.startsWith(legacyPrefix)) ids.add(key.slice(legacyPrefix.length))
  }
  return [...ids]
}

export function legacyPuzzleSaves(storage: Storage): PuzzleSaves {
  function write(id: string, game: Game | null, played?: number) {
    if (game) {
      storage.setItem(GAME_PREFIX + id, JSON.stringify(game))
      if (played !== undefined) storage.setItem(activityPrefix + id, String(played))
    } else {
      storage.removeItem(legacyPrefix + id)
      storage.removeItem(GAME_PREFIX + id)
      storage.removeItem(activityPrefix + id)
    }
  }
  return {
    async read(id) { return legacySave(storage, id) },
    async ids() { return legacyIds(storage) },
    async change(id, version, game, played, copy) {
      const current = legacySave(storage, id)
      if (current?.version !== version) return { saved: false, record: current }
      const copied = Boolean(copy && !legacySave(storage, copy.game.id))
      if (copy && copied) write(copy.game.id, copy.game, copy.played)
      write(id, game, played)
      return { saved: true, record: legacySave(storage, id), copied }
    },
  }
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('The puzzle save was interrupted.'))
  })
}

export function createIndexedPuzzleSaves(factory: IDBFactory, legacy: () => Storage) {
  let connection: Promise<IDBDatabase> | undefined
  let migration: Promise<void> | undefined
  let channel: BroadcastChannel | undefined
  let useStorageEvents = false
  const localCheckpoints = new Map<string, string>()

  function open() {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('sudoku-saves', 1)
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' })
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          connection = undefined
        }
        database.onclose = () => { connection = undefined }
        resolve(database)
      }
      request.onerror = () => reject(request.error)
    }).catch(error => {
      connection = undefined
      throw error
    })
    return connection
  }

  async function importLegacy(ids: string[]) {
    let storage: Storage
    const saves: PuzzleSave[] = []
    try {
      storage = legacy()
      for (const id of ids) {
        const save = legacySave(storage, id)
        if (save) saves.push(save)
      }
    } catch { return }
    if (!saves.length) return
    const database = await open()
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const done = transactionDone(transaction)
    for (const save of saves) {
      const request = store.get(save.id)
      request.onsuccess = () => {
        if (!request.result) store.add({ ...save, version: 1 })
      }
    }
    await done
    // A committed record, including a deletion, takes precedence over legacy data.
    for (const { id, value } of saves) {
      try {
        const current = storage.getItem(GAME_PREFIX + id)
        const old = storage.getItem(legacyPrefix + id)
        if ((current ?? old) !== value) continue
        storage.removeItem(legacyPrefix + id)
        storage.removeItem(GAME_PREFIX + id)
        storage.removeItem(activityPrefix + id)
        storage.removeItem(legacyActivity + id)
      } catch { /* The IndexedDB save is already complete. */ }
    }
  }

  function migrate() {
    migration ??= (async () => {
      let ids: string[]
      try { ids = legacyIds(legacy()) } catch { return }
      for (let index = 0; index < ids.length; index += 32) {
        await importLegacy(ids.slice(index, index + 32))
      }
    })().catch(error => {
      migration = undefined
      throw error
    })
    return migration
  }

  async function query<T>(read: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await open()
    return requestResult(read(database.transaction(storeName).objectStore(storeName)))
  }

  function signal(id: string) {
    try {
      if (channel) channel.postMessage(id)
      else if (useStorageEvents) legacy().setItem(changeKey, JSON.stringify([id, createUuid()]))
    } catch { /* A notification failure cannot undo a committed save. */ }
  }

  async function edit(id: string, update: (current?: PuzzleSave) => PuzzleWrite | undefined): Promise<SaveResult> {
    const database = await open()
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const done = transactionDone(transaction)
    let result: SaveResult = { saved: false }
    let copyId: string | undefined
    let error: unknown
    const request = store.get(id)
    request.onsuccess = () => {
      const record: PuzzleSave | undefined = request.result
      try {
        const write = update(record)
        if (!write) {
          result = { saved: false, record }
          return
        }
        const { game, played, copy, stamp } = write
        const updated = { id, version: (Number(record?.version) || 0) + 1, value: game,
          played: game ? played ?? record?.played : undefined, stamp }
        store.put(updated)
        result = { saved: true, record: updated }
        if (copy) {
          copyId = copy.game.id
          const existing = store.get(copyId)
          existing.onsuccess = () => {
            if (existing.result?.value != null) return
            store.put({ id: copy.game.id, version: (Number(existing.result?.version) || 0) + 1,
              value: copy.game, played: copy.played })
            result.copied = true
          }
        }
      } catch (reason) {
        error = reason
        transaction.abort()
      }
    }
    await done.catch(reason => { throw error ?? reason })
    if (result.saved) {
      const stamp = result.record?.stamp
      const raw = localCheckpoints.get(id)
      if (stamp && raw) {
        const checkpoint: Checkpoint = JSON.parse(raw)
        if (checkpoint.writer === stamp.writer && checkpoint.sequence <= stamp.sequence) {
          localCheckpoints.delete(id)
          clearCheckpoint(id, raw)
        }
      }
      signal(id)
    }
    if (copyId && result.copied) signal(copyId)
    return result
  }

  function clearCheckpoint(id: string, raw: string) {
    try {
      const key = checkpointPrefix + id
      const storage = legacy()
      if (storage.getItem(key) === raw) storage.removeItem(key)
    } catch { /* A committed save remains available. */ }
  }

  async function recover(id: string, read: () => Promise<PuzzleSave | undefined>) {
    let raw: string | null
    let checkpoint: Checkpoint
    try {
      raw = legacy().getItem(checkpointPrefix + id)
      if (!raw) return read()
      checkpoint = JSON.parse(raw)
      if (typeof checkpoint.writer !== 'string' || !Number.isSafeInteger(checkpoint.sequence) ||
          (checkpoint.game !== null && (checkpoint.game?.id !== id || typeof checkpoint.game.title !== 'string'))) return read()
    } catch { return read() }
    let separateCopy = false
    const { game, played, version, writer, sequence } = checkpoint
    const result = await edit(id, current => {
      if (current?.stamp?.writer === writer) {
        if (current.stamp.sequence >= sequence) return
      } else if (current?.version !== version) {
        separateCopy = true
        return
      }
      return { game, played, stamp: { writer, sequence } }
    })
    if (separateCopy && game) {
      const id = `recovered-${writer}-${sequence}`
      const title = game.title.slice(0, 58) + ' (recovered)'
      await edit(id, existing => existing ? undefined : { game: { ...game, id, title, ratingAttempt: undefined }, played })
    }
    clearCheckpoint(id, raw)
    return result.record
  }

  async function read(id: string): Promise<PuzzleSave | undefined> {
    const get = () => query<PuzzleSave | undefined>(store => store.get(id))
    return recover(id, async () => {
      const current = await get()
      if (current) return current
      let exists = false
      try { exists = Boolean(legacySave(legacy(), id)) } catch { /* IndexedDB can still be read. */ }
      if (!exists) return undefined
      await importLegacy([id])
      return get()
    })
  }

  return {
    read,
    async all(): Promise<PuzzleSave[]> {
      await migrate()
      let keys: string[] = []
      try { keys = Object.keys(legacy()).filter(key => key.startsWith(checkpointPrefix)) } catch { /* No checkpoints to recover. */ }
      for (const key of keys) await read(key.slice(checkpointPrefix.length))
      return query(store => store.getAll())
    },
    async ids() {
      await migrate()
      return (await query(store => store.getAllKeys())).map(String)
    },
    checkpoint(id: string, value: Checkpoint) {
      try {
        const raw = JSON.stringify(value)
        legacy().setItem(checkpointPrefix + id, raw)
        localCheckpoints.set(id, raw)
      } catch { /* The IndexedDB transaction can still finish. */ }
    },
    edit,
    change(id: string, version: PuzzleVersion | undefined, game: Game | null, played?: number, copy?: PuzzleCopy) {
      return edit(id, current => current?.version === version ? { game, played, copy } : undefined)
    },
    subscribe(listener: (id: string) => void) {
      if (typeof BroadcastChannel !== 'undefined') {
        const broadcast = new BroadcastChannel(changeKey)
        channel = broadcast
        broadcast.onmessage = event => { if (typeof event.data === 'string') listener(event.data) }
        return () => {
          if (channel === broadcast) channel = undefined
          broadcast.close()
        }
      }
      const changed = (event: StorageEvent) => {
        if (event.key !== changeKey || !event.newValue) return
        const [id] = JSON.parse(event.newValue)
        if (typeof id === 'string') listener(id)
      }
      useStorageEvents = true
      window.addEventListener('storage', changed)
      return () => {
        useStorageEvents = false
        window.removeEventListener('storage', changed)
      }
    },
  }
}

export const indexedPuzzleSaves = typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
  ? createIndexedPuzzleSaves(indexedDB, () => localStorage)
  : undefined
