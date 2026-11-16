import { validVariantSave } from './variants.ts'
import { isDifficulty } from './difficulty.ts'
import { COLORS, createGameId, isSolved, type Game, type Position } from './game.ts'
import {
  calculatePlayerRating, initialPlayerRating, isRatingAttempt, isRatingEvent,
  type PlayerRating, type RatingEvent, type RatingFinish,
} from './player-rating.ts'

const PREFIX = 'sudoku-app:v1:'
const LEGACY_PREFIX = 'gridroom:v1:'
const GAME_PREFIX = PREFIX + 'game:'
const RATING_PREFIX = PREFIX + 'rating-result:'
const SEEN_PREFIX = PREFIX + 'seen-puzzle:'
const ACTIVE = PREFIX + 'active'
const READY = PREFIX + 'initialized'
const BUILT_IN_STARTER_ID = 'warmup'
const sources = ['starter', 'generated', 'imported', 'custom', 'draft']

type Room = { games: Game[]; active: string | null; storageAvailable: boolean; playerRating: PlayerRating }
const initial: Room = { games: [], active: null, storageAvailable: true, playerRating: initialPlayerRating }
const listeners = new Set<() => void>()
const ratingEvents = new Map<string, RatingEvent>()
const unsavedRatingEvents = new Set<string>()
let room = initial

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

function validCandidateColors(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, colors]) => {
    const index = Number(key)
    return Number.isInteger(index) && index >= 0 && index < 81 && String(index) === key &&
      colors && typeof colors === 'object' && !Array.isArray(colors) &&
      Object.entries(colors).every(([digit, color]) => /^[1-9]$/.test(digit) &&
        typeof color === 'number' && Number.isInteger(color) && color >= 1 && color <= COLORS.length)
  })
}

function validPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false
  const { entries, center, corner, colors, candidateColors, eliminations } = value as Position
  const validDigits = (items: unknown, max: number) => Array.isArray(items) && items.length === 81 &&
    items.every((item) => Number.isInteger(item) && item >= 0 && item <= max)
  return typeof entries === 'string' && /^[0-9]{81}$/.test(entries) &&
    validDigits(center, 511) && validDigits(corner, 511) && validDigits(colors, COLORS.length) &&
    (candidateColors === undefined || validCandidateColors(candidateColors)) &&
    (eliminations === undefined || validDigits(eliminations, 511))
}

function readGame(id: string, data: string | null): Game | undefined {
  if (!data) return
  try {
    const value = JSON.parse(data) as Game
    if (
      value.id === id && typeof value.title === 'string' && value.title.length <= 72 &&
      sources.includes(value.source) && typeof value.givens === 'string' && /^[0-9]{81}$/.test(value.givens) &&
      (value.variant === undefined || validVariantSave(value.variant, value.givens)) &&
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
      if (value.candidatesInitialized !== true) delete value.candidatesInitialized
      if (value.source !== 'generated' || value.generatedWithAuto !== true) delete value.generatedWithAuto
      const attempt = value.ratingAttempt
      if (attempt !== undefined && (value.source !== 'generated' || value.variant || !isRatingAttempt(attempt) ||
        (attempt.outcome && (attempt.outcome.gameId !== id || attempt.outcome.givens !== value.givens ||
          attempt.outcome.difficulty !== attempt.grade.difficulty)))) delete value.ratingAttempt
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

function readRatingEvent(id: string) {
  try {
    const event: unknown = JSON.parse(localStorage.getItem(RATING_PREFIX + id) ?? 'null')
    if (isRatingEvent(event) && event.id === id) return event
  } catch { /* Ignore a malformed result. */ }
}

function rememberOutcome(event: RatingEvent | undefined) {
  if (event === undefined || (ratingEvents.has(event.id) && !unsavedRatingEvents.has(event.id))) return true
  ratingEvents.set(event.id, event)
  const saved = persist(() => localStorage.setItem(RATING_PREFIX + event.id, JSON.stringify(event)))
  if (saved) unsavedRatingEvents.delete(event.id)
  else unsavedRatingEvents.add(event.id)
  return saved
}

function finishAttempt(game: Game, finish: RatingFinish): Game {
  const attempt = game.ratingAttempt
  if (!attempt || attempt.outcome) return game
  let at = Date.now()
  for (const event of ratingEvents.values()) at = Math.max(at, event.at + 1)
  const outcome: RatingEvent = {
    id: createGameId(), gameId: game.id, givens: game.givens, difficulty: attempt.grade.difficulty,
    at,
    finish, viewed: attempt.viewed.length, applied: attempt.applied.length, elapsed: attempt.priorElapsed + game.elapsed,
  }
  return { ...game, ratingAttempt: { ...attempt, outcome } }
}

function mergeRatingAttempt(game: Game): Game {
  const attempt = game.ratingAttempt
  if (!attempt) return game
  try {
    const current = JSON.parse(localStorage.getItem(GAME_PREFIX + game.id) ?? 'null') as Game | null
    const saved = current?.givens === game.givens ? current.ratingAttempt : undefined
    if (!isRatingAttempt(saved)) return game
    const outcome = attempt.outcome ?? saved.outcome
    const viewed = [...new Set([...attempt.viewed, ...saved.viewed])]
    const applied = [...new Set([...attempt.applied, ...saved.applied])]
    const priorElapsed = Math.max(attempt.priorElapsed, saved.priorElapsed)
    if (outcome !== attempt.outcome || priorElapsed !== attempt.priorElapsed ||
      viewed.length !== attempt.viewed.length || applied.length !== attempt.applied.length) {
      return { ...game, ratingAttempt: { ...attempt, viewed, applied, outcome, priorElapsed } }
    }
  } catch { /* The in-memory attempt still has this tab’s assistance. */ }
  return game
}

function rememberPuzzle(game: Game) {
  return persist(() => {
    if (game.source === 'draft' || game.variant) return
    const key = SEEN_PREFIX + game.givens
    if (localStorage.getItem(key) === null) localStorage.setItem(key, game.id)
  })
}

function seenPuzzle(game: Game) {
  if (room.games.some((item) => !item.variant && item.source !== 'draft' && item.id !== game.id && item.givens === game.givens)) return true
  try {
    const previous = localStorage.getItem(SEEN_PREFIX + game.givens)
    return previous !== null && previous !== game.id
  } catch { return false }
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
    ratingEvents.clear()
    unsavedRatingEvents.clear()
    for (const key of keys) {
      if (!key.startsWith(RATING_PREFIX)) continue
      const event = readRatingEvent(key.slice(RATING_PREFIX.length))
      if (event) ratingEvents.set(event.id, event)
    }
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
    let outcomesSaved = true
    for (const game of games) {
      outcomesSaved = rememberOutcome(game.ratingAttempt?.outcome) && outcomesSaved
    }
    publish({
      games: sorted,
      active: sorted.find((game) => game.id === last)?.id ?? sorted[0]?.id ?? null,
      storageAvailable: migrated && removedStarter && outcomesSaved,
      playerRating: calculatePlayerRating(ratingEvents.values()),
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
  if (key.startsWith(RATING_PREFIX)) {
    const id = key.slice(RATING_PREFIX.length)
    const outcome = readRatingEvent(id)
    if (outcome) ratingEvents.set(id, outcome)
    else ratingEvents.delete(id)
    publish({ ...room, playerRating: calculatePlayerRating(ratingEvents.values()) })
    return
  }
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
    if (game.ratingAttempt && seenPuzzle(game)) game = { ...game, ratingAttempt: undefined }
    const seenSaved = rememberPuzzle(game)
    const saved = persist(() => localStorage.setItem(GAME_PREFIX + game.id, JSON.stringify(game)))
    const remembered = remember(game.id)
    publish({ ...room, games: orderGames([game, ...room.games]), active: game.id,
      storageAvailable: room.storageAvailable && saved && remembered && seenSaved })
  },
  update(id: string, update: (game: Game) => Game) {
    const current = room.games.find((game) => game.id === id)
    if (!current) return
    const merged = mergeRatingAttempt(current)
    let next = update(merged)
    if (current === next) return
    if (next.ratingAttempt && !next.ratingAttempt.outcome && next.position.entries !== current.position.entries && isSolved(next)) {
      next = finishAttempt(next, 'solved')
    }
    const saved = persist(() => localStorage.setItem(GAME_PREFIX + id, JSON.stringify(next)))
    const seenSaved = current.givens === next.givens && current.source === next.source || rememberPuzzle(next)
    const outcome = next.ratingAttempt?.outcome
    const newOutcome = outcome && !ratingEvents.has(outcome.id)
    const outcomeSaved = rememberOutcome(outcome)
    publish({ ...room, games: room.games.map((game) => game.id === id ? next : game),
      storageAvailable: room.storageAvailable && saved && outcomeSaved && seenSaved,
      playerRating: newOutcome ? calculatePlayerRating(ratingEvents.values()) : room.playerRating })
  },
  finishRatingAttempt(id: string, finish: Exclude<RatingFinish, 'solved'>) {
    roomStore.update(id, (game) => isSolved(game) ? game : finishAttempt(game, finish))
  },
  remove(id: string) {
    const removed = room.games.find((game) => game.id === id)
    const seenSaved = !removed || rememberPuzzle(removed)
    const games = room.games.filter((game) => game.id !== id)
    const active = room.active === id ? games[0]?.id ?? null : room.active
    const saved = persist(() => {
      const key = GAME_PREFIX + id
      localStorage.removeItem(legacyKey(key))
      localStorage.removeItem(key)
    })
    const outcomeSaved = rememberOutcome(removed?.ratingAttempt?.outcome)
    const remembered = remember(active)
    publish({ ...room, games, active, storageAvailable: room.storageAvailable && saved && remembered && seenSaved && outcomeSaved })
  },
}
