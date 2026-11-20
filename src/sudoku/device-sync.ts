import { settingsEditedEvent } from './settings-events.ts'
import { createSyncEngine, syncRequest, SyncError, type Credentials } from './sync-engine.ts'
import { createSyncSocket, type LiveConnection } from './sync-socket.ts'
import { createSyncConnectivity } from './sync-connectivity.ts'
import { roomStore } from './storage.ts'

const credentialsKey = 'sudoku-app:sync:device'
export const recoveryStorage = 'sudoku-app:sync:unsaved-recovery:'
const devicesStorage = 'sudoku-app:sync:devices:'
type LinkedDevice = { id: string; name: string; created: number }
function cachedDevices(id: string): LinkedDevice[] | undefined {
  try {
    const items = JSON.parse(localStorage.getItem(devicesStorage + id) ?? 'null')
    if (Array.isArray(items) && items.every(item => item && typeof item.id === 'string' &&
      typeof item.name === 'string' && typeof item.created === 'number')) return items
  } catch { /* Continue when the device list is unavailable. */ }
}
function rememberDevices(id: string, devices: LinkedDevice[]) {
  if (credentials()?.id !== id) return
  try { localStorage.setItem(devicesStorage + id, JSON.stringify(devices)) }
  catch { /* The linked device list remains available in this session. */ }
}
function forgetDevice(id: string) {
  try { localStorage.removeItem(devicesStorage + id) } catch { /* Clear the credentials even if the cache is unavailable. */ }
  localStorage.removeItem(recoveryStorage + id)
  localStorage.removeItem(credentialsKey)
}
type State = {
  linked: boolean
  ready: boolean
  loadingAccount: boolean
  loadingPuzzles: boolean
  message: string
}
const initial: State = { linked: false, ready: false, loadingAccount: false, loadingPuzzles: false, message: '' }
let state = initial

export type SyncConnection = {
  mode: 'unlinked' | 'offline' | Exclude<LiveConnection, 'inactive'>
  checkFailed: boolean
}
const initialConnection: SyncConnection = { mode: 'unlinked', checkFailed: false }
let connection = initialConnection
const connectionListeners = new Set<() => void>()
const noPeers: readonly string[] = []
let peerPuzzles = noPeers
let viewedPuzzle: string | null = null
let missingPuzzle: string | undefined
const presenceListeners = new Set<() => void>()

function publishPresence(puzzles: readonly string[]) {
  if (puzzles.length === peerPuzzles.length && puzzles.every((id, index) => peerPuzzles[index] === id)) return
  peerPuzzles = puzzles
  presenceListeners.forEach(fn => fn())
}

function publishConnection(update: Partial<SyncConnection>) {
  const next = { ...connection, ...update }
  if (next.mode === connection.mode && next.checkFailed === connection.checkFailed) return
  connection = next
  connectionListeners.forEach(fn => fn())
}

const listeners = new Set<() => void>()
const deviceListeners = new Set<() => void>()
const devicesChanged = () => deviceListeners.forEach(listener => listener())
function publish(update: Partial<State>) {
  const next = { ...state, ...update }
  if (state.linked === next.linked && state.ready === next.ready && state.message === next.message &&
      state.loadingAccount === next.loadingAccount && state.loadingPuzzles === next.loadingPuzzles) return
  state = next
  listeners.forEach(fn => fn())
  puzzlesChanged()
}

function credentials(): Credentials | null {
  try { return JSON.parse(localStorage.getItem(credentialsKey) ?? 'null') }
  catch { return null }
}

type PuzzleStatus = 'none' | 'checking' | 'pending' | 'saving' | 'saved' | 'offline' | 'offline-clean' | 'failed' | 'check-failed' | 'conflict'
type PendingEdit = { due: number; deadline: number }
const editDebounce = 2_000
const batchLimit = 60_000
const checkDelay = 250
const puzzleListeners = new Set<() => void>()
const pending = new Map<string, PendingEdit>()
let uploading = new Map<string, PendingEdit | undefined>()
const failures = new Set<string>()
const checkFailures = new Set<string>()
const conflicts = new Set<string>()
const manual = new Set<string>()
let active: { device: Credentials; engine: ReturnType<typeof createSyncEngine> } | undefined
let connected = false
let live: ReturnType<typeof createSyncSocket> | undefined
let running: Promise<unknown> | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let pullAt = Infinity
let recoverPending = false
let lastPull = 0
let retryAt = 0
let retryDelay = 0
let onConnectivityChange: ((online: boolean) => void) | undefined
const connectivity = createSyncConnectivity({
  // A successful probe also confirms that the sync service is ready again.
  probe: async () => (await fetch('/api/v1/health', {
    cache: 'no-store', signal: AbortSignal.timeout(8_000),
  })).ok,
  onChange: online => onConnectivityChange?.(online),
})
function isTransportFailure(error: unknown) {
  return !navigator.onLine || error instanceof TypeError ||
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

function puzzlesChanged() {
  puzzleListeners.forEach(listener => listener())
}

function currentDevice() {
  const device = credentials()
  if (active && device?.id === active.device.id && device.token === active.device.token) return active
  if (!active && !device && state.ready) return
  active = undefined
  pending.clear()
  failures.clear()
  checkFailures.clear()
  conflicts.clear()
  manual.clear()
  retryAt = retryDelay = lastPull = 0
  pullAt = Infinity
  if (device) {
    const engine = createSyncEngine(localStorage, device.id, syncRequest(device.token), (id, copiedFrom) => {
      roomStore.refreshPuzzle(id)
      if (copiedFrom && active?.engine === engine) {
        conflicts.add(copiedFrom)
        queueEdit(id, Date.now())
        puzzlesChanged()
      }
    })
    active = { device, engine }
    publishConnection({ ...initialConnection, mode: connectivity.available() ? 'connecting' : 'offline' })
    recoverPending = true
    publish({ ...initial, linked: true })
  } else {
    recoverPending = false
    publishConnection(initialConnection)
    publish({ ...initial, ready: true })
  }
  puzzlesChanged()
  return active
}

function queueEdit(id: string, at: number, { debounce = false } = {}) {
  const previous = pending.get(id)
  const edit = { due: at + (debounce ? editDebounce : 0), deadline: at + (debounce ? batchLimit : 0) }
  // Edits during an upload start a new batch and keep their own deadline.
  if (previous && previous !== uploading.get(id)) {
    edit.deadline = Math.min(edit.deadline, previous.deadline)
    if (!debounce) edit.due = Math.min(edit.due, previous.due)
  }
  edit.due = Math.min(edit.due, edit.deadline)
  pending.set(id, edit)
}

function expediteEdit(edit: PendingEdit, due: number) {
  edit.deadline = Math.min(edit.deadline, due)
  edit.due = Math.min(edit.due, due)
}

function expedite() {
  const due = Date.now()
  for (const edit of pending.values()) expediteEdit(edit, due)
  arm()
}

function requestPull(delay = checkDelay) {
  if (!active) return
  pullAt = Math.min(pullAt, Date.now() + delay)
  arm()
}

function arm() {
  clearTimeout(timer)
  if (!connected || !active || running || !connectivity.available()) return
  let due = pullAt
  for (const edit of pending.values()) due = Math.min(due, edit.due)
  if (Number.isFinite(due)) timer = setTimeout(() => { void flush() }, Math.max(0, Math.max(due, retryAt) - Date.now()))
}

async function exclusively<T>(task: () => Promise<T>) {
  const prior = running
  const next = (async () => {
    await prior?.catch(() => {})
    return navigator.locks ? navigator.locks.request('sudoku-library-sync', task) : task()
  })()
  running = next
  try { return await next }
  finally {
    if (running === next) running = undefined
    arm()
  }
}

type ActiveDevice = NonNullable<typeof active>
type SyncResult = Awaited<ReturnType<ActiveDevice['engine']['run']>>

function stillLinked(target: ActiveDevice) {
  const device = credentials()
  return device?.id === target.device.id && device.token === target.device.token
}

async function applyResult(target: ActiveDevice, result: SyncResult, edits: Map<string, PendingEdit | undefined>) {
  for (const [id, edit] of edits) {
    const current = pending.get(id)
    if (current !== edit) {
      if (current && !result.failures.has(id) && !result.retry.has(id) &&
          !await target.engine.pending(id) && stillLinked(target) && pending.get(id) === current) pending.delete(id)
      continue
    }
    if (result.failures.has(id)) failures.add(id)
    else failures.delete(id)
    if (result.retry.has(id)) queueEdit(id, Date.now())
    else pending.delete(id)
  }
  puzzlesChanged()
}

function backOff() {
  retryDelay = Math.min(retryDelay ? retryDelay * 2 : 15_000, 5 * 60_000)
  retryAt = Date.now() + retryDelay
  pullAt = Math.min(pullAt, retryAt)
}

function reportError(target: ActiveDevice, error: unknown) {
  if (!stillLinked(target)) return
  if (error instanceof SyncError && error.status === 401) {
    forgetDevice(target.device.id)
    live?.stop()
    currentDevice()
    publish({ linked: false, ready: true, message: 'This device was unlinked. Local puzzles are still available.' })
    return
  }
  if (isTransportFailure(error)) {
    // Stop sync requests and WebSocket reconnects until the health endpoint recovers.
    connectivity.suspend()
    publishConnection({ mode: 'offline', checkFailed: false })
    publish({ ready: true, loadingAccount: false, loadingPuzzles: false,
      message: 'Offline. Changes are saved on this device.' })
    puzzlesChanged()
    return
  }
  publishConnection({ checkFailed: true })
  const message = error instanceof SyncError || error instanceof Error && error.name === 'Error'
    ? error.message : 'Sync is unavailable. Your changes are saved here and will retry.'
  publish({ ready: true, loadingAccount: false, loadingPuzzles: false, message })
  puzzlesChanged()
}

function recordCloudCheck(ready: boolean) {
  publishConnection({ checkFailed: false })
  publish({ linked: true, ready, message: failures.size
    ? 'Some puzzle changes are saved on this device and could not sync.' : '' })
}

async function flush() {
  const target = active
  if (!target || running || !connectivity.available() || Date.now() < retryAt) { arm(); return }
  await exclusively(async () => {
    if (!stillLinked(target) || !connectivity.available()) return
    const now = Date.now()
    const checkDue = pullAt <= now
    if (!checkDue && ![...pending.values()].some(edit => edit.due <= now)) return
    if (checkDue) pullAt = Infinity
    let edits = new Map<string, PendingEdit>()
    try {
      if (recoverPending) {
        for (const id of await target.engine.pendingIds()) {
          if (!pending.has(id)) queueEdit(id, now)
        }
      }
      edits = new Map([...pending].filter(([, edit]) => edit.due <= now))
      for (const [id, edit] of edits) {
        if (!await target.engine.pending(id).catch(() => true)) {
          if (!stillLinked(target)) return
          if (pending.get(id) === edit) pending.delete(id)
          edits.delete(id)
        }
      }
      if (!stillLinked(target) || !connectivity.available()) return
      if (!checkDue && !edits.size) { puzzlesChanged(); return }
      uploading = edits
      lastPull = Date.now()
      const priority = !state.ready && missingPuzzle && /^[a-zA-Z0-9_-]{1,128}$/.test(missingPuzzle) ? missingPuzzle : undefined
      publish({ loadingAccount: true, loadingPuzzles: true })
      const result = await target.engine.run({
        uploads: new Set(edits.keys()), priority,
        onPuzzlesLoaded: () => {
          if (stillLinked(target)) publish({ ready: true, loadingPuzzles: false })
        },
      })
      if (!stillLinked(target)) return
      recoverPending = false
      retryAt = retryDelay = 0
      checkFailures.clear()
      await applyResult(target, result, edits)
      if (!stillLinked(target)) return
      recordCloudCheck(true)
    } catch (error) {
      if (stillLinked(target)) {
        backOff()
        // An edit made during a failed request can start a fresh batch. Retry
        // that puzzle with the latest save at backoff, alongside its old batch.
        for (const id of edits.keys()) {
          const edit = pending.get(id)
          if (edit) expediteEdit(edit, retryAt)
        }
      }
      reportError(target, error)
    } finally {
      uploading = new Map()
      if (stillLinked(target)) publish({ loadingAccount: false, loadingPuzzles: false })
    }
  })
}

function puzzleStatus(id: string): PuzzleStatus {
  if (!state.linked) return 'none'
  if (manual.has(id)) return 'saving'
  const hasPending = pending.has(id) || failures.has(id)
  if (!connectivity.available()) return hasPending ? 'offline' : 'offline-clean'
  if (failures.has(id) || (retryAt && hasPending)) return 'failed'
  if (conflicts.has(id)) return 'conflict'
  if (checkFailures.has(id)) return 'check-failed'
  if (hasPending) return 'pending'
  return state.ready && !recoverPending ? 'saved' : 'checking'
}

async function syncPuzzle(id: string) {
  const target = currentDevice()
  if (!target || manual.has(id)) return
  if (!connectivity.available()) { puzzlesChanged(); return }
  checkFailures.delete(id)
  manual.add(id)
  puzzlesChanged()
  try {
    await exclusively(async () => {
      if (!stillLinked(target) || !connectivity.available()) return
      const edits = new Map([[id, pending.get(id)]])
      uploading = edits
      const options = { uploads: new Set([id]), includeElapsed: true, settings: false }
      try {
        let result = await target.engine.run(options)
        if (!stillLinked(target)) return
        if (result.retry.has(id) && !result.copies.has(id)) result = await target.engine.run(options)
        if (!stillLinked(target)) return
        await applyResult(target, result, edits)
        if (!stillLinked(target)) return
        recordCloudCheck(state.ready)
        if (!result.failures.has(id) && !result.copies.has(id) && await target.engine.pending(id)) {
          if (!pending.has(id)) queueEdit(id, Date.now(), { debounce: true })
        }
      } catch (error) {
        if (!stillLinked(target)) return
        if (!(error instanceof SyncError && error.status === 401)) {
          const unsent = await target.engine.pending(id).catch(() => true)
          if (!stillLinked(target)) return
          if (unsent) {
            backOff()
            queueEdit(id, retryAt)
            failures.add(id)
          } else checkFailures.add(id)
        }
        reportError(target, error)
      } finally {
        uploading = new Map()
      }
    })
  } finally {
    manual.delete(id)
    puzzlesChanged()
  }
}

export const deviceSync = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  onDevicesChanged(fn: () => void) {
    deviceListeners.add(fn)
    return () => { deviceListeners.delete(fn) }
  },
  subscribePuzzle(fn: () => void) {
    puzzleListeners.add(fn)
    return () => { puzzleListeners.delete(fn) }
  },
  puzzleStatus,
  syncPuzzle,
  async refreshPuzzles() {
    const target = currentDevice()
    if (!target || !connectivity.available() || Date.now() < retryAt) return
    await exclusively(async () => {
      if (!stillLinked(target) || !connectivity.available()) return
      try {
        await target.engine.run({ uploads: new Set(), settings: false })
      } catch (error) {
        reportError(target, error)
      }
    })
  },
  getSnapshot: () => state,
  getServerSnapshot: () => initial,
  subscribeConnection(fn: () => void) {
    connectionListeners.add(fn)
    return () => { connectionListeners.delete(fn) }
  },
  getConnection: () => connection,
  getServerConnection: () => initialConnection,
  subscribePresence(fn: () => void) {
    presenceListeners.add(fn)
    return () => { presenceListeners.delete(fn) }
  },
  getPeerPuzzles: () => peerPuzzles,
  getServerPeerPuzzles: () => noPeers,
  showPuzzle(id: string | null, missing?: string) {
    viewedPuzzle = id
    missingPuzzle = missing
    live?.showPuzzle(id)
  },
  connect() {
    connected = true
    const unsubscribe = roomStore.onEdit((id, handoff) => {
      if (!currentDevice()) return
      failures.delete(id)
      checkFailures.delete(id)
      conflicts.delete(id)
      const now = Date.now()
      if (handoff) queueEdit(id, now + checkDelay)
      else queueEdit(id, now, { debounce: true })
      puzzlesChanged()
      arm()
    })
    let selected = roomStore.getSnapshot().active
    const unsubscribeSelection = roomStore.subscribe(() => {
      const next = roomStore.getSnapshot().active
      if (selected && next !== selected && pending.has(selected)) {
        const edit = pending.get(selected)!
        expediteEdit(edit, Date.now() + checkDelay)
        arm()
      }
      selected = next
    })
    const settingChanged = () => requestPull()
    const socket = createSyncSocket({
      opened: () => { if (!document.hidden) { requestPull(); devicesChanged() } },
      status: mode => {
        if (!active) return
        publishConnection({ mode: !connectivity.available() ? 'offline' : mode === 'inactive' ? 'connecting' : mode })
        if (mode === 'fallback' && connectivity.available()) void connectivity.verify()
      },
      changes: () => requestPull(),
      devices: devicesChanged,
      presence: publishPresence,
      revoked: () => { retryAt = 0; requestPull(0) },
    })
    live = socket
    function wake() {
      const target = currentDevice()
      socket.showPuzzle(viewedPuzzle)
      socket.update(target?.device ?? null)
      if (target && !document.hidden && connectivity.available()) socket.check(Date.now())
      if (target && !connectivity.available()) {
        publishConnection({ mode: 'offline', checkFailed: false })
        publish({ ready: true, loadingAccount: false, loadingPuzzles: false, message: 'Offline. Changes are saved on this device.' })
        if (recoverPending) {
          void target.engine.pendingIds().then(ids => {
            if (!stillLinked(target) || !recoverPending || connectivity.available()) return
            for (const id of ids) if (!pending.has(id)) queueEdit(id, Date.now())
            recoverPending = false
            puzzlesChanged()
          }).catch(() => {})
        }
      } else if (target) requestPull()
      puzzlesChanged()
      arm()
    }
    function online() {
      retryAt = retryDelay = 0
      if (active) recoverPending = true
      expedite()
      wake()
      if (!document.hidden) devicesChanged()
    }
    function flushHandoff() {
      if (!active || !pending.size || !connectivity.available()) return
      expedite()
      void flush()
    }
    function visible() {
      if (!document.hidden) void connectivity.wake()
      socket.showPuzzle(viewedPuzzle)
      if (document.hidden) flushHandoff()
      else { wake(); devicesChanged() }
    }
    function pageHidden() {
      socket.stop()
      flushHandoff()
    }
    const storageChanged = (event: StorageEvent) => { if (event.key === credentialsKey) wake() }
    onConnectivityChange = available => available ? online() : wake()
    connectivity.start()
    wake()
    let lastCheck = Date.now()
    const interval = window.setInterval(() => {
      const device = active?.device
      if (!device || !connectivity.available() || document.hidden) return
      const now = Date.now()
      socket.update(device)
      socket.check(now)
      if (now - lastCheck >= (socket.isOpen() ? 5 * 60_000 : 30_000)) {
        lastCheck = now
        devicesChanged()
        if (!retryDelay && now - lastPull >= 30_000) requestPull()
      }
    }, 15_000)
    window.addEventListener(settingsEditedEvent, settingChanged)
    window.addEventListener('focus', wake)
    window.addEventListener('pagehide', pageHidden)
    window.addEventListener('pageshow', wake)
    window.addEventListener('storage', storageChanged)
    document.addEventListener('visibilitychange', visible)
    return () => {
      connected = false
      unsubscribe()
      unsubscribeSelection()
      socket.stop()
      live = undefined
      clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener(settingsEditedEvent, settingChanged)
      connectivity.stop()
      onConnectivityChange = undefined
      window.removeEventListener('focus', wake)
      window.removeEventListener('pagehide', pageHidden)
      window.removeEventListener('pageshow', wake)
      window.removeEventListener('storage', storageChanged)
      document.removeEventListener('visibilitychange', visible)
    }
  },
  async enroll(mode: 'libraries' | 'join' | 'recover', secret?: string) {
    if (credentials()) throw new Error('This device is already linked.')
    const result = await syncRequest()<Credentials & { recovery?: string }>(mode, 'POST', { secret })
    if (result.recovery) localStorage.setItem(recoveryStorage + result.id, result.recovery)
    localStorage.setItem(credentialsKey, JSON.stringify({ id: result.id, token: result.token }))
    currentDevice()
    live?.update(result)
    requestPull(0)
    await flush()
    return result.recovery
  },
  async invite() {
    return syncRequest(credentials()?.token)<{ ticket: string; expires: number }>('invitations', 'POST')
  },
  cachedDevices,
  rememberDevices,
  async devices() {
    return syncRequest(credentials()?.token)<LinkedDevice[]>('devices')
  },
  async rename(id: string, name: string) {
    return syncRequest(credentials()?.token)<{ name: string }>('devices/' + encodeURIComponent(id), 'PATCH', { name })
  },
  async revoke(id: string) {
    await syncRequest(credentials()?.token)('devices/' + encodeURIComponent(id), 'DELETE')
    if (credentials()?.id === id) {
      forgetDevice(id)
      live?.stop()
      currentDevice()
    }
  },
  credentials,
}
