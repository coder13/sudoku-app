import { notifySettingsEdit } from './settings-events.ts'
type PuzzleTiming = {
  showTimer: boolean
  showPause: boolean
  trackTime: boolean
}

export const TIMING_KEY = 'sudoku-app:v1:puzzle-timing'
const defaults: PuzzleTiming = { showTimer: true, showPause: true, trackTime: true }
const listeners = new Set<() => void>()

export function readTiming(storage?: Pick<Storage, 'getItem'>): PuzzleTiming {
  if (!storage && typeof window === 'undefined') return defaults
  try {
    const saved = JSON.parse((storage ?? localStorage).getItem(TIMING_KEY) ?? 'null') as Partial<PuzzleTiming> | null
    return {
      showTimer: saved?.showTimer !== false,
      showPause: saved?.showPause !== false,
      trackTime: saved?.trackTime !== false,
    }
  } catch { return defaults }
}

let current = readTiming()

function publish(next: PuzzleTiming) {
  current = next
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', (event) => {
    if (event.storageArea === localStorage && (event.key === TIMING_KEY || event.key === null)) publish(readTiming())
  })
}

export const puzzleTiming = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => current,
  getServerSnapshot: () => defaults,
  set(key: keyof PuzzleTiming, enabled: boolean) {
    if (current[key] === enabled) return
    const next = { ...current, [key]: enabled }
    try { localStorage.setItem(TIMING_KEY, JSON.stringify(next)); notifySettingsEdit() }
    catch { /* Keep the preference for this session. */ }
    publish(next)
  },
}
