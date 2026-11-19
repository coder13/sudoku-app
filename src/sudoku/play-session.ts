export type MobileInputTool = 'colors' | 'chains'
export type MobileInputTab = 'digits' | MobileInputTool
type MobileInput = { open: MobileInputTool[]; active: MobileInputTab }
export const defaultMobileInput: MobileInput = { open: [], active: 'digits' }

type PlaySession = {
  puzzleId: string | null
  launchPaused: boolean
  mobileInput: MobileInput
  drawingIntent: boolean | null
}
const initial: PlaySession = { puzzleId: null, launchPaused: false, mobileInput: defaultMobileInput, drawingIntent: null }
const key = 'sudoku-app:v1:play-session'
type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>

function readSession(storage: SessionStorage): PlaySession {
  const value = JSON.parse(storage.getItem(key) ?? 'null')
  if (typeof value?.puzzleId !== 'string') return initial
  const input = value.mobileInput
  const open = Array.isArray(input?.open)
    ? [...new Set<MobileInputTool>(input.open.filter((tool: unknown) => tool === 'colors' || tool === 'chains'))]
    : []
  return {
    puzzleId: value.puzzleId,
    launchPaused: value.launchPaused === true,
    mobileInput: { open, active: open.includes(input?.active) ? input.active : 'digits' },
    drawingIntent: typeof value.drawingIntent === 'boolean' ? value.drawingIntent : null,
  }
}

export function createPlaySession(storage?: SessionStorage) {
  let current = initial
  try { current = readSession(storage ?? sessionStorage) }
  catch { /* The tab can still play when session storage is unavailable. */ }
  const listeners = new Set<() => void>()

  function commit(next: PlaySession) {
    current = next
    try { (storage ?? sessionStorage).setItem(key, JSON.stringify(next)) }
    catch { /* Keep changes in memory when session storage is unavailable. */ }
    listeners.forEach(listener => listener())
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    activate(puzzleId: string | null) {
      if (current.puzzleId !== puzzleId) commit({ ...initial, puzzleId })
    },
    set<K extends keyof Omit<PlaySession, 'puzzleId'>>(puzzleId: string, field: K,
      value: PlaySession[K] | ((previous: PlaySession[K]) => PlaySession[K])) {
      const session = current.puzzleId === puzzleId ? current : { ...initial, puzzleId }
      const next = typeof value === 'function' ? value(session[field]) : value
      if (current === session && Object.is(next, session[field])) return
      commit({ ...session, [field]: next })
    },
  }
}

export const playSession = createPlaySession()
