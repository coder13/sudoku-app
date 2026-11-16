import { isDifficulty } from './difficulty.ts'
import type { Game, Position } from './game.ts'

const PREFIX = 'sudoku-app:v1:'
const LEGACY_PREFIX = 'gridroom:v1:'
const GAME_PREFIX = PREFIX + 'game:'
const ACTIVE = PREFIX + 'active'
const READY = PREFIX + 'initialized'
const BUILT_IN_STARTER_ID = 'warmup'
const sources = ['starter', 'generated', 'imported', 'custom', 'draft']

type Room = { games: Game[]; active: string | null; storageAvailable: boolean }
const initial: Room = { games: [], active: null, storageAvailable: true }
const listeners = new Set<() => void>()
let room = initial

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

function validPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false
  const { entries, center, corner, colors, eliminations } = value as Position
  const validDigits = (items: unknown, max: number) => Array.isArray(items) && items.length === 81 &&
    items.every((item) => Number.isInteger(item) && item >= 0 && item <= max)
  return typeof entries === 'string' && /^[0-9]{81}$/.test(entries) &&
    validDigits(center, 511) && validDigits(corner, 511) && validDigits(colors, 6) &&
    (eliminations === undefined || validDigits(eliminations, 511))
}

function readGame(id: string, data: string | null): Game | undefined {
  if (!data) return
  try {
    const value = JSON.parse(data) as Game
    if (
      value.id === id && typeof value.title === 'string' && value.title.length <= 72 &&
      sources.includes(value.source) && typeof value.givens === 'string' && /^[0-9]{81}$/.test(value.givens) &&
      validPosition(value.position) && Array.isArray(value.past) && value.past.every(validPosition) &&
      Array.isArray(value.future) && value.future.every(validPosition) &&
      Number.isSafeInteger(value.elapsed) && value.elapsed >= 0 && Number.isSafeInteger(value.created) &&
      typeof value.started === 'boolean' && typeof value.paused === 'boolean' &&
      (value.saved === undefined || typeof value.saved === 'boolean') &&
      (value.archived === undefined || typeof value.archived === 'boolean') &&
      (value.editingId === undefined || (typeof value.editingId === 'string' && value.editingId.length <= 100)) &&
      (value.returnId === undefined || (typeof value.returnId === 'string' && value.returnId.length <= 100))
    ) {
      if (value.difficulty != null && !isDifficulty(value.difficulty)) delete value.difficulty
      if (value.score != null && (!Number.isSafeInteger(value.score) || value.score < 0)) delete value.score
      return value
    }
  } catch {
    // Skip isolated corrupt records so the rest of the library still opens.
  }
}

function persist(write: () => void): boolean {
  try {
    write()
    return true
  } catch {
    return false
  }
}

function orderGames(games: Game[]) {
  return [...games].sort((a, b) => b.created - a.created)
}

function storageKey(key: string) {
  return key.startsWith(LEGACY_PREFIX) ? PREFIX + key.slice(LEGACY_PREFIX.length) : key
}

function legacyKey(key: string) {
  return LEGACY_PREFIX + key.slice(PREFIX.length)
}

function readSaved(storage: Storage, key: string) {
  return storage.getItem(key) ?? storage.getItem(legacyKey(key))
}

function migrateStorage(storage: Storage) {
  return persist(() => {
    for (const key of Object.keys(storage).filter((key) => key.startsWith(LEGACY_PREFIX))) {
      const value = storage.getItem(key)
      if (value === null) continue
      const next = storageKey(key)
      if (storage.getItem(next) === null) storage.setItem(next, value)
      storage.removeItem(key)
    }
  })
}

function hydrate() {
  try {
    const migrated = migrateStorage(localStorage)
    const keys = Array.from(new Set(Object.keys(localStorage).map(storageKey)))
    const storedGames = keys
      .filter((key) => key.startsWith(GAME_PREFIX))
      .map((key) => readGame(key.slice(GAME_PREFIX.length), readSaved(localStorage, key)))
      .filter((game): game is Game => Boolean(game))
    const removedStarter = persist(() => {
      for (const game of storedGames) {
        if (game.source !== 'starter' && game.id !== BUILT_IN_STARTER_ID) continue
        const key = GAME_PREFIX + game.id
        localStorage.removeItem(legacyKey(key))
        localStorage.removeItem(key)
      }
    })
    const games = storedGames.filter((game) => game.source !== 'starter' && game.id !== BUILT_IN_STARTER_ID)

    if (!readSaved(localStorage, READY)) {
      localStorage.setItem(READY, '1')
    }
    let last = readSaved(localStorage, ACTIVE)
    try {
      migrateStorage(sessionStorage)
      last = readSaved(sessionStorage, ACTIVE) ?? last
    } catch { /* local fallback */ }
    const sorted = orderGames(games)
    publish({
      games: sorted,
      active: sorted.find((game) => game.id === last)?.id ?? sorted[0]?.id ?? null,
      storageAvailable: migrated && removedStarter,
    })
  } catch {
    publish({ ...room, storageAvailable: false })
  }
}

function onStorage(event: StorageEvent) {
  if (event.storageArea !== localStorage) return
  if (event.key === null) {
    hydrate()
    return
  }
  const key = storageKey(event.key)
  if (!key.startsWith(GAME_PREFIX)) return
  const id = key.slice(GAME_PREFIX.length)
  const incoming = readGame(id, readSaved(localStorage, key))
  const games = room.games.filter((game) => game.id !== id)
  if (incoming) games.push(incoming)
  const sorted = orderGames(games)
  const active = sorted.some((game) => game.id === room.active) ? room.active : sorted[0]?.id ?? null
  publish({ ...room, games: sorted, active })
}

function remember(id: string | null) {
  return persist(() => {
    rememberActive(localStorage, id)
    try { rememberActive(sessionStorage, id) } catch { /* local storage still holds the last active game */ }
  })
}

function rememberActive(storage: Storage, id: string | null) {
  if (id) storage.setItem(ACTIVE, id)
  else {
    storage.removeItem(legacyKey(ACTIVE))
    storage.removeItem(ACTIVE)
  }
}

// Hydrate before React reads the store. This also keeps Vite hot replacement
// from exposing the starter puzzle while a newly evaluated module waits for an
// effect to reconnect it.
if (typeof window !== 'undefined') hydrate()

export const roomStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => room,
  getServerSnapshot: () => initial,
  connect() {
    hydrate()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  },
  select(id: string) {
    if (!room.games.some((game) => game.id === id)) return
    const saved = remember(id)
    publish({ ...room, active: id, storageAvailable: room.storageAvailable && saved })
  },
  add(game: Game) {
    const saved = persist(() => localStorage.setItem(GAME_PREFIX + game.id, JSON.stringify(game)))
    const remembered = remember(game.id)
    publish({ games: orderGames([game, ...room.games]), active: game.id, storageAvailable: room.storageAvailable && saved && remembered })
  },
  update(id: string, update: (game: Game) => Game) {
    const current = room.games.find((game) => game.id === id)
    if (!current) return
    const next = update(current)
    if (current === next) return
    const saved = persist(() => localStorage.setItem(GAME_PREFIX + id, JSON.stringify(next)))
    publish({ ...room, games: room.games.map((game) => game.id === id ? next : game), storageAvailable: room.storageAvailable && saved })
  },
  remove(id: string) {
    const games = room.games.filter((game) => game.id !== id)
    const active = room.active === id ? games[0]?.id ?? null : room.active
    const saved = persist(() => {
      const key = GAME_PREFIX + id
      localStorage.removeItem(legacyKey(key))
      localStorage.removeItem(key)
    })
    const remembered = remember(active)
    publish({ games, active, storageAvailable: room.storageAvailable && saved && remembered })
  },
}
