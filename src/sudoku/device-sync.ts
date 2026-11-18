import { settingsEditedEvent } from './settings-events.ts'
import { createSyncEngine, syncRequest, SyncError, type Credentials } from './sync-engine.ts'
import { roomStore } from './storage.ts'

const credentialsKey = 'sudoku-app:sync:device'
export const recoveryStorage = 'sudoku-app:sync:unsaved-recovery:'
function forgetDevice(id: string) {
  localStorage.removeItem(recoveryStorage + id)
  localStorage.removeItem(credentialsKey)
}
type State = { linked: boolean; ready: boolean; message: string }
const initial: State = { linked: false, ready: false, message: '' }
let state = initial
const listeners = new Set<() => void>()
function publish(next: State) {
  if (state.linked === next.linked && state.ready === next.ready && state.message === next.message) return
  state = next
  listeners.forEach(fn => fn())
}

function credentials(): Credentials | null {
  try { return JSON.parse(localStorage.getItem(credentialsKey) ?? 'null') }
  catch { return null }
}

let engine: ReturnType<typeof createSyncEngine> | undefined
let deviceId: string | undefined
let running: Promise<void> | undefined
let queued = false
let queuedClock = false
let timer: ReturnType<typeof setTimeout> | undefined
function schedule(flushClock = false) {
  if (!credentials()) return
  queuedClock ||= flushClock
  clearTimeout(timer)
  timer = setTimeout(() => {
    const flush = queuedClock
    queuedClock = false
    void sync(flush)
  }, 250)
}

async function sync(flushClock = false) {
  if (running) { queued = true; queuedClock ||= flushClock; return running }
  const device = credentials()
  if (!device) { publish({ ...initial, ready: true }); return }
  if (deviceId !== device.id) {
    deviceId = device.id
    engine = createSyncEngine(localStorage, device.id, syncRequest(device.token), roomStore.refreshPuzzle)
    publish({ linked: true, ready: false, message: 'Loading your puzzles…' })
  }
  if (!navigator.onLine) {
    publish({ linked: true, ready: true, message: 'Offline. Changes are saved on this device.' })
    return
  }
  async function exchange() {
    try {
      await engine!.run(flushClock)
      if (credentials()?.id === device!.id) publish({ linked: true, ready: true, message: 'Up to date.' })
    } catch (error) {
      if (credentials()?.id !== device!.id) return
      if (error instanceof SyncError && error.status === 401) {
        forgetDevice(device!.id)
        publish({ linked: false, ready: true, message: 'This device was unlinked. Local puzzles are still available.' })
      } else {
        const message = error instanceof SyncError || error instanceof Error && error.name === 'Error'
          ? error.message : 'Sync is unavailable. Your changes are saved here and will retry.'
        publish({ linked: true, ready: true, message })
      }
    }
  }
  running = (async () => {
    if (navigator.locks) await navigator.locks.request('sudoku-library-sync', exchange)
    else await exchange()
  })()
  try { await running }
  finally { running = undefined; if (queued) { queued = false; schedule() } }
}

export const deviceSync = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  getSnapshot: () => state,
  getServerSnapshot: () => initial,
  connect() {
    const unsubscribe = roomStore.onEdit(() => {
      if (!credentials()) return
      if (navigator.onLine && state.ready) publish({ ...state, message: 'Saving changes…' })
      schedule()
    })
    const settingChanged = () => schedule()
    window.addEventListener(settingsEditedEvent, settingChanged)
    const wake = () => { void sync(true) }
    const storageChanged = (event: StorageEvent) => { if (event.key === credentialsKey) wake() }
    wake()
    const interval = window.setInterval(() => { if (!document.hidden && credentials()) void sync() }, 5000)
    window.addEventListener('online', wake)
    window.addEventListener('offline', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('storage', storageChanged)
    document.addEventListener('visibilitychange', wake)
    return () => {
      unsubscribe()
      clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener(settingsEditedEvent, settingChanged)
      window.removeEventListener('online', wake)
      window.removeEventListener('offline', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('storage', storageChanged)
      document.removeEventListener('visibilitychange', wake)
    }
  },
  async enroll(mode: 'libraries' | 'join' | 'recover', secret?: string) {
    if (credentials()) throw new Error('This device is already linked.')
    const result = await syncRequest()<Credentials & { recovery?: string }>(mode, 'POST', { secret })
    if (result.recovery) localStorage.setItem(recoveryStorage + result.id, result.recovery)
    localStorage.setItem(credentialsKey, JSON.stringify({ id: result.id, token: result.token }))
    await sync()
    return result.recovery
  },
  async invite() {
    return syncRequest(credentials()?.token)<{ ticket: string; expires: number }>('invitations', 'POST')
  },
  async devices() {
    return syncRequest(credentials()?.token)<{ id: string; name: string; created: number }[]>('devices')
  },
  async rename(id: string, name: string) {
    return syncRequest(credentials()?.token)<{ name: string }>('devices/' + encodeURIComponent(id), 'PATCH', { name })
  },
  async revoke(id: string) {
    await syncRequest(credentials()?.token)('devices/' + encodeURIComponent(id), 'DELETE')
    if (credentials()?.id === id) {
      forgetDevice(id)
      publish({ ...initial, ready: true })
    }
  },
  credentials, sync,
}
