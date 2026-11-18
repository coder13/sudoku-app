import { syncSettings, type SettingsValues } from './sync-settings.ts'
import type { Game } from './game.ts'
import { activityPrefix, lastPlayed } from './puzzle-activity.ts'
import { GAME_PREFIX, readGame } from './storage.ts'

export class SyncError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export type Credentials = { id: string; token: string }
export type SyncRequest = <T>(path: string, method?: string, body?: unknown) => Promise<T>
export function syncRequest(token?: string, fetcher: typeof fetch = fetch): SyncRequest {
  return async (path, method = 'GET', body) => {
    const response = await fetcher('/api/v1/' + path, {
      method, cache: 'no-store', signal: AbortSignal.timeout(20_000),
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data) throw new SyncError(response.status, data?.error ?? 'The sync service is unavailable.')
    return data
  }
}

type Base = { revision: number; hash: string; elapsed: number; pending?: string }
type Remote = Base & { played: number; game: Game | null }
const empty: Base = { revision: 0, hash: 'deleted', elapsed: 0 }

async function fingerprint(game: Game) {
  // Filing is local to the workspace. Clocks on two displays of the same
  // position converge to the highest elapsed time without creating a fork.
  const { elapsed, savedForLater, ...content } = game
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createSyncEngine(storage: Storage, deviceId: string, request: SyncRequest, notify: (id: string) => void) {
  const prefix = 'sudoku-app:sync:' + deviceId + ':'
  const basePrefix = prefix + 'base:'
  const cursorKey = prefix + 'cursor'
  const cache = new Map<string, { raw: string; game: Game; hash: string }>()
  const baseFor = (id: string): Base => JSON.parse(storage.getItem(basePrefix + id) ?? 'null') ?? empty
  const remember = (id: string, base: Base) => storage.setItem(basePrefix + id, JSON.stringify(base))

  async function local(id: string) {
    for (;;) {
      const raw = storage.getItem(GAME_PREFIX + id)
      if (raw === null) { cache.delete(id); return { raw, game: null, hash: 'deleted' } }
      const cached = cache.get(id)
      if (cached?.raw === raw) return cached
      const game = readGame(id, raw)
      if (!game) throw new Error('A local puzzle could not be read. Its save is still on this device.')
      const entry = { raw, game, hash: await fingerprint(game) }
      if (storage.getItem(GAME_PREFIX + id) === raw) { cache.set(id, entry); return entry }
    }
  }

  function install(id: string, game: Game | null, played: number) {
    if (game) {
      storage.setItem(activityPrefix + id, String(played))
      storage.setItem(GAME_PREFIX + id, JSON.stringify(game))
    } else {
      storage.removeItem(GAME_PREFIX + id)
      storage.removeItem('gridroom:v1:game:' + id)
      storage.removeItem(activityPrefix + id)
    }
    notify(id)
  }

  function fork(game: Game, hash: string, played: number) {
    // Stable across retries after a quota error, tab close or lost reply.
    const id = 'copy-' + hash
    if (storage.getItem(GAME_PREFIX + id) !== null) return
    install(id, { ...game, id, title: game.title.slice(0, 56) + ' (conflict copy)', ratingAttempt: undefined }, played)
  }

  async function pull(id: string) {
    const remote = await request<Remote>('puzzles/' + encodeURIComponent(id))
    const game = remote.game === null ? null : readGame(id, JSON.stringify(remote.game))
    if (game === undefined || (game ? await fingerprint(game) : 'deleted') !== remote.hash) {
      throw new Error('A downloaded puzzle could not be verified. Your local progress is safe.')
    }
    const base = baseFor(id)
    if (remote.revision <= base.revision) return
    const here = await local(id)
    // No await between reading the local save and recording the merged result.
    const oursReachedServer = base.pending === remote.hash && remote.revision === base.revision + 1
    const modified = here.hash !== base.hash
    if (here.hash === remote.hash) {
      if (game && here.game && game.elapsed > here.game.elapsed) {
        install(id, { ...here.game, elapsed: game.elapsed }, Math.max(remote.played, lastPlayed(here.game, storage)))
      }
    } else if (oursReachedServer || (modified && remote.hash === base.hash)) {
      // Only our pending save or the other device's timer changed. Keep working locally.
    } else if (!here.game && base.revision && modified && game) {
      fork(game, remote.hash, remote.played)
      // Preserve the pending local deletion. The next push advances the tombstone.
    } else {
      if (modified && here.game) fork(here.game, here.hash, lastPlayed(here.game, storage))
      install(id, game, remote.played)
    }
    remember(id, { revision: remote.revision, hash: remote.hash, elapsed: remote.elapsed })
  }

  async function run(flushClock = false) {
    let cursor = Number(storage.getItem(cursorKey)) || 0
    type Changes = { id: string; revision: number; sequence: number }[]
    let settings: SettingsValues | undefined
    for (;;) {
      const page = await request<Changes | { changes: Changes; settings: SettingsValues }>(
        'changes?after=' + cursor + (settings ? '' : '&settings=1'))
      const changes = Array.isArray(page) ? page : page.changes
      if (!Array.isArray(page)) settings = page.settings
      for (const change of changes) {
        if (baseFor(change.id).revision < change.revision) await pull(change.id)
        cursor = change.sequence
        storage.setItem(cursorKey, String(cursor))
      }
      if (changes.length < 100) break
    }
    const ids = new Set<string>()
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index) ?? ''
      if (key.startsWith(GAME_PREFIX)) ids.add(key.slice(GAME_PREFIX.length))
      if (key.startsWith(basePrefix)) ids.add(key.slice(basePrefix.length))
    }
    let skipped: string | undefined
    for (const id of ids) {
      const base = baseFor(id)
      const here = await local(id)
      const elapsed = here.game?.elapsed ?? 0
      if (here.hash === base.hash && elapsed - base.elapsed < (flushClock ? 1 : 30) && !base.pending) continue
      if (!here.game && !base.revision && !base.pending) continue
      const played = here.game ? lastPlayed(here.game, storage) : Date.now()
      remember(id, { ...base, pending: here.hash })
      try {
        const result = await request<{ revision: number }>('puzzles/' + encodeURIComponent(id), 'PUT',
          { revision: base.revision, hash: here.hash, played, game: here.game })
        remember(id, { revision: result.revision, hash: here.hash, elapsed })
      } catch (error) {
        if (error instanceof SyncError && error.status === 413) {
          skipped = '“' + (here.game?.title ?? id) + '” is too large to sync. Its progress is saved on this device.'
          continue
        }
        if (!(error instanceof SyncError) || error.status !== 409) throw error
        await pull(id)
      }
    }
    if (settings) await syncSettings(storage, prefix + 'settings', request, settings)
    if (skipped) throw new Error(skipped)
  }
  return { run }
}
