import { validVariantSave } from './variants.ts'
import { validActionHistory } from './action-history.ts'
import { isDifficulty } from './difficulty.ts'
import { isCollectionReference } from './collection-reference.ts'
import { COLORS, createGameId, isSolved, markSolveUntimed, puzzleIdentity, type Game, type Position } from './game.ts'
import { puzzleSelectionKey } from './selection-preferences.ts'
import {
  calculatePlayerRating, initialPlayerRating, isRatingAttempt, isRatingEvent, PLAYER_RATING_VERSION,
  type PlayerRating, type RatingAttempt, type RatingEvent, type RatingFinish,
} from './player-rating.ts'
import { puzzleTiming } from './puzzle-timing.ts'

const PREFIX = 'sudoku-app:v1:'
const LEGACY_PREFIX = 'gridroom:v1:'
const GAME_PREFIX = PREFIX + 'game:'
const RATING_PREFIX = PREFIX + 'rating-result:'
const SEEN_PREFIX = PREFIX + 'seen-puzzle:'
const ACTIVE = PREFIX + 'active'
const READY = PREFIX + 'initialized'
const BUILT_IN_STARTER_ID = 'warmup'
const sources = ['starter', 'generated', 'imported', 'collection', 'custom', 'draft']

type Room = { games: Game[]; active: string | null; stoppedPlaying: boolean; storageAvailable: boolean; playerRating: PlayerRating }
const initial: Room = { games: [], active: null, stoppedPlaying: false, storageAvailable: true, playerRating: initialPlayerRating }
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
      if (value.collection !== undefined && !isCollectionReference(value.collection)) delete value.collection
      if (value.analysisUsed !== true) delete value.analysisUsed
      if (value.actionHistory !== undefined && !validActionHistory(value.actionHistory)) delete value.actionHistory
      if (value.timeUntracked !== true) delete value.timeUntracked
      if (value.savedForLater !== true) delete value.savedForLater
      if (value.source !== 'generated' || value.generatedWithAuto !== true) delete value.generatedWithAuto
      const attempt = value.ratingAttempt
      if (attempt !== undefined && (value.source === 'draft' || !isRatingAttempt(attempt) ||
        (attempt.outcome && (attempt.outcome.gameId !== id || attempt.outcome.givens !== value.givens ||
          attempt.outcome.difficulty !== attempt.grade.difficulty ||
          (attempt.outcome.puzzleKey ?? attempt.outcome.givens) !== puzzleIdentity(value))))) delete value.ratingAttempt
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

function ratingElapsed(game: Game, attempt: RatingAttempt) {
  return game.timeUntracked || attempt.timeUntracked ? 0 : attempt.priorElapsed + game.elapsed
}

function hintEvidence(game: Game): RatingEvent | undefined {
  const attempt = game.ratingAttempt
  if (!attempt || attempt.outcome || attempt.lastHintAt === undefined || (attempt.requested?.length ?? 0) < 2) return
  return {
    id: `hints:${game.id}`, gameId: game.id, givens: game.givens, puzzleKey: puzzleIdentity(game),
    ratingVersion: attempt.ratingVersion,
    difficulty: attempt.grade.difficulty, at: attempt.lastHintAt, finish: 'hints',
    viewed: attempt.viewed.length, applied: attempt.applied.length, hintsRequested: attempt.requested?.length,
    analysisUsed: attempt.analysisUsed, elapsed: ratingElapsed(game, attempt),
  }
}

function playerRatingFor(games: readonly Game[]) {
  const events = [...ratingEvents.values()]
  const known = new Set(events.map((event) => event.puzzleKey ?? event.givens))
  for (const game of games) {
    if (game.source === 'draft') continue
    const puzzleKey = puzzleIdentity(game)
    if (known.has(puzzleKey)) continue
    if (isSolved(game) && game.difficulty && !game.analysisUsed) {
      const elapsed = game.timeUntracked ? 0 : game.elapsed
      events.push({
        id: `saved:${game.id}`, gameId: game.id, givens: game.givens, puzzleKey, difficulty: game.difficulty,
        ratingVersion: game.ratingAttempt?.ratingVersion,
        at: game.created + elapsed * 1000, finish: 'solved', elapsed, viewed: 0, applied: 0, estimated: true,
      })
    } else {
      const evidence = hintEvidence(game)
      if (evidence) events.push(evidence)
    }
  }
  return calculatePlayerRating(events)
}

function finishAttempt(game: Game, finish: RatingFinish): Game {
  const attempt = game.ratingAttempt
  if (!attempt || attempt.outcome) return game
  let at = Date.now()
  for (const event of ratingEvents.values()) at = Math.max(at, event.at + 1)
  const outcome: RatingEvent = {
    id: createGameId(), gameId: game.id, givens: game.givens, puzzleKey: puzzleIdentity(game), difficulty: attempt.grade.difficulty,
    ratingVersion: PLAYER_RATING_VERSION,
    at,
    finish, viewed: attempt.viewed.length, applied: attempt.applied.length, elapsed: ratingElapsed(game, attempt),
  }
  if (attempt.requested || attempt.lastHintAt !== undefined) outcome.hintsRequested = attempt.requested?.length ?? 0
  if (attempt.singlesAssistance) outcome.singlesAssistance = attempt.singlesAssistance
  if (attempt.analysisUsed) outcome.analysisUsed = true
  if (attempt.mode) outcome.mode = attempt.mode
  return { ...game, ratingAttempt: { ...attempt, outcome } }
}

function mergeRatingAttempt(game: Game): Game {
  const attempt = game.ratingAttempt
  if (!attempt) return game
  try {
    const current = JSON.parse(localStorage.getItem(GAME_PREFIX + game.id) ?? 'null') as Game | null
    const saved = current && puzzleIdentity(current) === puzzleIdentity(game) ? current.ratingAttempt : undefined
    if (!isRatingAttempt(saved)) return game
    const outcome = attempt.outcome ?? saved.outcome
    const viewed = [...new Set([...attempt.viewed, ...saved.viewed])]
    const applied = [...new Set([...attempt.applied, ...saved.applied])]
    const requested = [...new Set([...(attempt.requested ?? []), ...(saved.requested ?? [])])]
    const singlesAssistance = saved.singlesAssistance === 'all' ? 'all' : attempt.singlesAssistance ?? saved.singlesAssistance
    const analysisUsed = attempt.analysisUsed || saved.analysisUsed ? true : undefined
    const lastHintAt = Math.max(attempt.lastHintAt ?? 0, saved.lastHintAt ?? 0) || undefined
    const ratingVersion = attempt.ratingVersion ?? saved.ratingVersion
    const priorElapsed = Math.max(attempt.priorElapsed, saved.priorElapsed)
    const timeUntracked = attempt.timeUntracked || saved.timeUntracked
    if (outcome !== attempt.outcome || priorElapsed !== attempt.priorElapsed ||
      timeUntracked !== attempt.timeUntracked ||
      viewed.length !== attempt.viewed.length || applied.length !== attempt.applied.length ||
      requested.length !== (attempt.requested?.length ?? 0) || lastHintAt !== attempt.lastHintAt ||
      singlesAssistance !== attempt.singlesAssistance || analysisUsed !== attempt.analysisUsed || ratingVersion !== attempt.ratingVersion) {
      return { ...game, ratingAttempt: { ...attempt, viewed, applied, requested, singlesAssistance, analysisUsed, outcome, priorElapsed, timeUntracked, lastHintAt, ratingVersion } }
    }
  } catch { /* The in-memory attempt still has this tab’s assistance. */ }
  return game
}

function rememberPuzzle(game: Game) {
  return persist(() => {
    if (game.source === 'draft') return
    const key = SEEN_PREFIX + puzzleIdentity(game)
    if (localStorage.getItem(key) === null) localStorage.setItem(key, game.id)
  })
}

function seenPuzzle(game: Game) {
  const identity = puzzleIdentity(game)
  if (room.games.some((item) => item.source !== 'draft' && item.id !== game.id && puzzleIdentity(item) === identity)) return true
  try {
    const previous = localStorage.getItem(SEEN_PREFIX + identity)
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
      active: last === '' ? null : sorted.find((game) => game.id === last && !game.savedForLater)?.id ??
        sorted.find((game) => !game.savedForLater)?.id ?? null,
      stoppedPlaying: last === '',
      storageAvailable: migrated && removedStarter && outcomesSaved,
      playerRating: playerRatingFor(sorted),
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
    publish({ ...room, playerRating: playerRatingFor(room.games) })
    return
  }
  if (!key.startsWith(GAME_PREFIX)) return
  const id = key.slice(GAME_PREFIX.length)
  const incoming = readGame(id, readSaved(localStorage, key))
  const games = room.games.filter((game) => game.id !== id)
  if (incoming) games.push(incoming)
  const sorted = orderGames(games)
  const active = room.stoppedPlaying || sorted.some((game) => game.id === room.active && !game.savedForLater)
    ? room.active : sorted.find((game) => !game.savedForLater)?.id ?? null
  publish({ ...room, games: sorted, active, playerRating: playerRatingFor(sorted) })
}

function remember(id: string | null) {
  return persist(() => {
    rememberActive(localStorage, id)
    try { rememberActive(sessionStorage, id) } catch { /* local storage still holds the last active game */ }
  })
}

function rememberActive(storage: Storage, id: string | null) {
  if (id !== null) storage.setItem(ACTIVE, id)
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
    const game = room.games.find((game) => game.id === id)
    if (!game) return
    if (game.savedForLater) roomStore.update(id, (saved) => ({ ...saved, savedForLater: undefined }))
    const saved = remember(id)
    publish({ ...room, active: id, stoppedPlaying: false, storageAvailable: room.storageAvailable && saved })
  },
  stopPlaying(id: string) {
    if (room.active !== id) return
    // An empty ID records that the player chose to leave. A missing key keeps the default selection behavior.
    const saved = remember('')
    publish({ ...room, active: null, stoppedPlaying: true, storageAvailable: room.storageAvailable && saved })
  },
  add(game: Game) {
    if (game.ratingAttempt && seenPuzzle(game)) game = { ...game, ratingAttempt: undefined }
    const seenSaved = rememberPuzzle(game)
    const saved = persist(() => localStorage.setItem(GAME_PREFIX + game.id, JSON.stringify(game)))
    const selection = game.savedForLater ? {} : { active: game.id, stoppedPlaying: false }
    const remembered = game.savedForLater || remember(game.id)
    const games = orderGames([game, ...room.games])
    publish({ ...room, ...selection, games, playerRating: playerRatingFor(games),
      storageAvailable: room.storageAvailable && saved && remembered && seenSaved })
  },
  update(id: string, update: (game: Game) => Game) {
    const current = room.games.find((game) => game.id === id)
    if (!current) return
    const merged = mergeRatingAttempt(current)
    let next = update(merged)
    if (current === next) return
    if (!puzzleTiming.getSnapshot().trackTime && next.source !== 'draft' && next.started &&
      (next.position !== current.position || !current.started) && !isSolved(current)) next = markSolveUntimed(next)
    if (!current.ratingAttempt && next.ratingAttempt && seenPuzzle(next)) next = { ...next, ratingAttempt: undefined }
    if (next.ratingAttempt && !next.ratingAttempt.outcome && next.position.entries !== current.position.entries && isSolved(next)) {
      next = finishAttempt(next, 'solved')
    }
    const saved = persist(() => localStorage.setItem(GAME_PREFIX + id, JSON.stringify(next)))
    const seenSaved = puzzleIdentity(current) === puzzleIdentity(next) && current.source === next.source || rememberPuzzle(next)
    const outcome = next.ratingAttempt?.outcome
    const newOutcome = outcome && !ratingEvents.has(outcome.id)
    const outcomeSaved = rememberOutcome(outcome)
    const games = room.games.map((game) => game.id === id ? next : game)
    const evidenceChanged = newOutcome || next.difficulty !== current.difficulty ||
      next.ratingAttempt?.lastHintAt !== current.ratingAttempt?.lastHintAt ||
      next.ratingAttempt?.ratingVersion !== current.ratingAttempt?.ratingVersion ||
      (!next.ratingAttempt?.outcome && next.position.entries !== current.position.entries && isSolved(next) !== isSolved(current))
    publish({ ...room, games,
      storageAvailable: room.storageAvailable && saved && outcomeSaved && seenSaved,
      playerRating: evidenceChanged ? playerRatingFor(games) : room.playerRating })
  },
  finishRatingAttempt(id: string, finish: Exclude<RatingFinish, 'solved'>) {
    roomStore.update(id, (game) => isSolved(game) ? game : finishAttempt(game, finish))
  },
  remove(id: string) {
    const removed = room.games.find((game) => game.id === id)
    const seenSaved = !removed || rememberPuzzle(removed)
    const games = room.games.filter((game) => game.id !== id)
    const active = room.active === id ? games.find((game) => !game.savedForLater)?.id ?? null : room.active
    const saved = persist(() => {
      const key = GAME_PREFIX + id
      localStorage.removeItem(legacyKey(key))
      localStorage.removeItem(key)
      localStorage.removeItem(puzzleSelectionKey(id))
    })
    const outcomeSaved = rememberOutcome(removed && (removed.ratingAttempt?.outcome ?? hintEvidence(removed)))
    const remembered = remember(room.stoppedPlaying ? '' : active)
    publish({ ...room, games, active, playerRating: playerRatingFor(games),
      storageAvailable: room.storageAvailable && saved && remembered && seenSaved && outcomeSaved })
  },
}
