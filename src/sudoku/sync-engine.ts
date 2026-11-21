import { syncSettings, type SettingsValues } from './sync-settings.ts'
import type { Game } from './game.ts'
import { lastPlayed } from './puzzle-activity.ts'
import { readGame } from './storage.ts'
import { legacyPuzzleSaves, type PuzzleSaves, type PuzzleVersion } from './puzzle-saves.ts'

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

type Base = { revision: number; hash: string; elapsed: number; pending?: string; progressHash?: string }
type SyncOptions = {
  uploads?: ReadonlySet<string>
  includeElapsed?: boolean
  settings?: boolean
  priority?: string
  onPuzzlesLoaded?: () => void
}

type Remote = Base & { played: number; game: Game | null }
const empty: Base = { revision: 0, hash: 'deleted', elapsed: 0 }

async function digest(content: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

function fingerprint(game: Game) {
  // Filing is local to the workspace. Clocks on two displays of the same
  // position converge to the highest elapsed time without creating a fork.
  const { elapsed, savedForLater, pendingSave, ...content } = game
  return digest(content)
}

function progressFingerprint(game: Game) {
  // A receiving device can rate a puzzle or classify the same moves itself.
  // Preserve actual moves, independent of their technique labels and grouping.
  const { elapsed, savedForLater, pendingSave, difficulty, score, fogRatingVersion, variantRatingVersion,
    uniquenessProof, ratingAttempt, actionHistory, ...progress } = game
  const actions = actionHistory?.flatMap(({ kind, changes }) => changes.map(change => ({ kind, change })))
  const hasRatingEvidence = ratingAttempt && (ratingAttempt.outcome || ratingAttempt.lastHintAt !== undefined ||
    ratingAttempt.viewed.length || ratingAttempt.applied.length || ratingAttempt.requested?.length ||
    ratingAttempt.analysisUsed || ratingAttempt.singlesAssistance || ratingAttempt.priorElapsed || ratingAttempt.timeUntracked)
  return digest({ ...progress, actions: actions?.length ? actions : undefined, ratingAttempt: hasRatingEvidence ? ratingAttempt : undefined })
}

function matchesProgress(base: Base, save: { hash: string; progressHash: string }) {
  return base.hash === save.hash || base.progressHash === save.progressHash
}

export function createSyncEngine(storage: Storage, deviceId: string, request: SyncRequest,
  notify: (id: string, copiedFrom?: string) => void | Promise<void>, saves: PuzzleSaves = legacyPuzzleSaves(storage)) {
  const prefix = 'sudoku-app:sync:' + deviceId + ':'
  const basePrefix = prefix + 'base:'
  const cursorKey = prefix + 'cursor'
  const cache = new Map<string, { version: PuzzleVersion; game: Game; hash: string; progressHash: string }>()
  const baseFor = (id: string): Base => JSON.parse(storage.getItem(basePrefix + id) ?? 'null') ?? empty
  const remember = (id: string, base: Base) => storage.setItem(basePrefix + id, JSON.stringify(base))

  async function local(id: string) {
    for (;;) {
      const record = await saves.read(id)
      if (!record || record.value === null) {
        cache.delete(id)
        return { version: record?.version, game: null, hash: 'deleted', progressHash: 'deleted', played: undefined }
      }
      const cached = cache.get(id)
      if (cached?.version === record.version) return { ...cached, played: record.played }
      const game = readGame(id, record.value)
      if (!game) throw new SyncError(422, 'A local puzzle could not be read.')
      const [hash, progressHash] = await Promise.all([fingerprint(game), progressFingerprint(game)])
      const entry = { version: record.version, game, hash, progressHash }
      if ((await saves.read(id))?.version === record.version) {
        cache.set(id, entry)
        return { ...entry, played: record.played }
      }
    }
  }

  function conflictCopy(game: Game, hash: string, played: number) {
    // A stable ID lets a retry reuse an existing copy.
    const id = 'copy-' + hash
    return { game: { ...game, id, title: game.title.slice(0, 56) + ' (conflict copy)', ratingAttempt: undefined }, played }
  }

  async function pull(id: string, copies: Map<string, string>) {
    const remote = await request<Remote>('puzzles/' + encodeURIComponent(id))
    const game = remote.game === null ? null : readGame(id, remote.game)
    if (game === undefined || (game ? await fingerprint(game) : 'deleted') !== remote.hash) {
      throw new Error('A downloaded puzzle could not be verified. Your local progress is safe.')
    }
    const progressHash = game ? await progressFingerprint(game) : 'deleted'
    const base = baseFor(id)
    if (remote.revision <= base.revision) return false
    const oursReachedServer = base.pending === remote.hash && remote.revision === base.revision + 1
    for (;;) {
      const here = await local(id)
      const modified = !matchesProgress(base, here)
      const playedHere = here.game ? here.played ?? lastPlayed(here.game, storage) : 0
      let next = game
      let played = remote.played
      let copy: ReturnType<typeof conflictCopy> | undefined
      if (matchesProgress({ ...remote, progressHash }, here)) {
        if (!game || !here.game || game.elapsed <= here.game.elapsed) break
        next = { ...here.game, elapsed: game.elapsed }
        played = Math.max(played, playedHere)
      } else if (oursReachedServer || (modified && matchesProgress(base, { ...remote, progressHash }))) {
        // Only our pending save or the other device's timer changed.
        break
      } else if (!here.game && base.revision && modified && game) {
        copy = conflictCopy(game, remote.hash, played)
        next = null
      } else if (modified && here.game) {
        copy = conflictCopy(here.game, here.hash, playedHere)
      }
      const result = await saves.change(id, here.version, next, played, copy)
      if (!result.saved) continue
      if (copy) {
        copies.set(id, copy.game.id)
        if (result.copied) await notify(copy.game.id, id)
      }
      await notify(id)
      break
    }
    remember(id, { revision: remote.revision, hash: remote.hash, elapsed: remote.elapsed, progressHash })
    return true
  }

  async function puzzleIds() {
    const ids = new Set(await saves.ids())
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index) ?? ''
      if (key.startsWith(basePrefix)) ids.add(key.slice(basePrefix.length))
    }
    return ids
  }

  async function pending(id: string) {
    const here = await local(id)
    const base = baseFor(id)
    if (!base.progressHash && base.revision && here.hash === base.hash) {
      remember(id, { ...base, progressHash: here.progressHash })
    }
    return Boolean(!matchesProgress(base, here) || base.pending)
  }

  async function pendingIds() {
    const ids = new Set<string>()
    for (const id of await puzzleIds()) {
      if (await pending(id).catch(error => {
        if (error instanceof SyncError && error.status === 422) return true
        throw error
      })) ids.add(id)
    }
    return ids
  }

  async function run({ uploads, includeElapsed = false, settings: includeSettings = true, priority, onPuzzlesLoaded }: SyncOptions = {}) {
    const copies = new Map<string, string>()
    const failures = new Map<string, SyncError>()
    const retry = new Set<string>()
    if (priority) {
      try {
        await pull(priority, copies)
      } catch (error) {
        if (!(error instanceof SyncError) || error.status !== 404) throw error
      }
    }
    let cursor = Number(storage.getItem(cursorKey)) || 0
    type Changes = { id: string; revision: number; sequence: number }[]
    let settings: SettingsValues | undefined
    for (;;) {
      const page = await request<Changes | { changes: Changes; settings: SettingsValues }>(
        'changes?after=' + cursor + (includeSettings && !settings ? '&settings=1' : ''))
      const changes = Array.isArray(page) ? page : page.changes
      if (!Array.isArray(page)) settings = page.settings
      for (const change of changes) {
        if (baseFor(change.id).revision < change.revision) await pull(change.id, copies)
        cursor = change.sequence
        storage.setItem(cursorKey, String(cursor))
      }
      if (changes.length < 100) break
    }
    onPuzzlesLoaded?.()
    for (const id of uploads ?? await puzzleIds()) {
      const base = baseFor(id)
      const here = await local(id).catch(error => {
        if (!(error instanceof SyncError) || error.status !== 422) throw error
        failures.set(id, error)
        return undefined
      })
      if (!here) continue
      const elapsed = here.game?.elapsed ?? 0
      if (matchesProgress(base, here) && !(includeElapsed && elapsed > base.elapsed) && !base.pending) continue
      if (!here.game && !base.revision && !base.pending) continue
      const played = here.game ? here.played ?? lastPlayed(here.game, storage) : Date.now()
      const game = here.game && { ...here.game, pendingSave: undefined }
      remember(id, { ...base, pending: here.hash })
      try {
        const result = await request<{ revision: number }>('puzzles/' + encodeURIComponent(id), 'PUT',
          { revision: base.revision, hash: here.hash, played, game })
        remember(id, { revision: result.revision, hash: here.hash, elapsed, progressHash: here.progressHash })
      } catch (error) {
        if (!(error instanceof SyncError)) throw error
        if (error.status === 409 && await pull(id, copies)) {
          retry.add(id)
        } else if ([400, 404, 409, 413, 422].includes(error.status)) {
          remember(id, base)
          failures.set(id, error)
        } else throw error
      }
    }
    if (settings) await syncSettings(storage, prefix + 'settings', request, settings)
    return { copies, failures, retry }
  }

  return { run, pending, pendingIds }
}
