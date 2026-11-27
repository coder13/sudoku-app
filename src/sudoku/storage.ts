import { readCustomModeDefinition } from './custom-modes.ts'
import { CLASSIC_GRID, MINI_GRID, isGridText, isSizedGrid, isJigsawGrid, sizedGridIdentity, type JigsawGrid, type PlayGrid, type SizedGrid } from './grid.ts'
import { activityPrefix, rememberPuzzleActivity } from './puzzle-activity.ts'
import { GAME_PREFIX, indexedPuzzleSaves, type PuzzleSave, type PuzzleVersion } from './puzzle-saves.ts'
import { validVariantSave } from './variants.ts'
import { validActionHistory } from './action-history.ts'
import { pruneChainsAfterMove, validChainSketchState } from './chain-sketch.ts'
import { readSubsetWorkspace } from './subsets.ts'
import { validBranchWorkspace } from './branches.ts'
import { isDifficulty } from './difficulty.ts'
import { isCollectionReference } from './collection-reference.ts'
import { BOOKMARK_NAME_LIMIT, COLORS, createGameId, hasUniquenessProof, isSolved, makeGame, markSolveUntimed, normalizePuzzleIdentity, puzzleIdentity, shouldOfferPuzzleSave, type Game, type HistoryPosition, type Position } from './game.ts'
import { isSizedRuleList, restoreSizedRuleGame } from './sized-rule-game.ts'
import { algebraicPosition, restoreAlgebraicGame } from './algebraic-game.ts'
import { algebraicLabel, isAlgebraicCageList, type AlgebraicCage } from './algebraic-cages.ts'
import { isSharedPuzzleId } from './puzzle-sharing.ts'
import { puzzleSelectionKey } from './selection-preferences.ts'
import { puzzleTabsKey } from './play-session.ts'
import {
  calculatePlayerRating, initialPlayerRating, isRatingAttempt, isRatingEvent, PLAYER_RATING_VERSION,
  type PlayerRating, type RatingAttempt, type RatingEvent, type RatingFinish,
} from './player-rating.ts'
import { puzzleTiming } from './puzzle-timing.ts'
import { isImportedColor, validGivenCellColors, validImportedCellColors } from './imported-colors.ts'
import { validImportedDrawings } from './imported-drawings.ts'
import { validAuthoredArtwork } from './authored-artwork.ts'
import { hasPracticePuzzles, hasVariantPracticePuzzles } from './practice-play.ts'

export { GAME_PREFIX } from './puzzle-saves.ts'

const PREFIX = 'sudoku-app:v1:'
const LEGACY_PREFIX = 'gridroom:v1:'
const RATING_PREFIX = PREFIX + 'rating-result:'
const SEEN_PREFIX = PREFIX + 'seen-puzzle:'
const ACTIVE = PREFIX + 'active'
const READY = PREFIX + 'initialized'
const BUILT_IN_STARTER_ID = 'warmup'
const FIRST_PUZZLE = '000204009930600000105000000367400000040005607059060042003080920090007008000900000'
const sources = ['starter', 'generated', 'imported', 'collection', 'custom', 'draft']

type Room = { games: Game[]; active: string | null; stoppedPlaying: boolean; storageAvailable: boolean; playerRating: PlayerRating }
const initial: Room = { games: [], active: null, stoppedPlaying: false, storageAvailable: true, playerRating: initialPlayerRating }
const listeners = new Set<() => void>()
const storedSnapshots = new WeakMap<Game, string>()
const pendingElapsed = new Map<string, { raw: string | undefined; base: Game }>()
const CLOCK_CHECKPOINT_MS = 5000
let clockCheckpoint: ReturnType<typeof setTimeout> | undefined
const playListeners = new Set<(id: string | null) => void>()
const editListeners = new Set<(id: string, handoff: boolean) => void>()
const announceEdit = (id: string, handoff = false) => editListeners.forEach(listener => listener(id, handoff))
const ratingEvents = new Map<string, RatingEvent>()
const unsavedRatingEvents = new Set<string>()
let room = initial
let firstVisit: boolean | undefined

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

function validCandidateColors(value: unknown, grid: PlayGrid, validShade: (shade: unknown) => boolean): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, colors]) => {
    const index = Number(key)
    return Number.isInteger(index) && index >= 0 && index < grid.size ** 2 && String(index) === key &&
      colors && typeof colors === 'object' && !Array.isArray(colors) &&
      Object.entries(colors).every(([digit, color]) => /^[1-9]$/.test(digit) && Number(digit) <= grid.size &&
        validShade(color))
  })
}

function validPosition(value: unknown, grid: PlayGrid, draft: boolean, cageDraft: boolean): value is Position {
  if (!value || typeof value !== 'object') return false
  const position = value as HistoryPosition & { draftSixRules?: Position['draftSizedRules'] }
  if (position.draftSixRules !== undefined) {
    if (grid.size !== 6 || position.draftSizedRules !== undefined) return false
    position.draftSizedRules = position.draftSixRules
    delete position.draftSixRules
  }
  const { entries, shades, center, corner, colors, cellColors, importedCellColors, candidateColors, importedCandidateColors, importedDrawings, eliminations, draftCages, draftSizedRules, draftRegions, chainSketch } = position
  if (draft && 'regions' in grid) {
    if (!draftRegions) return false
    const layout: JigsawGrid = { size: grid.size, regions: draftRegions, ...(grid.wrapAround && { wrapAround: true }) }
    if (!isJigsawGrid(layout)) return false
    grid = layout
  } else if (draftRegions !== undefined) return false
  const validDigits = (items: unknown, max: number) => Array.isArray(items) && items.length === grid.size ** 2 &&
    items.every((item) => Number.isInteger(item) && item >= 0 && item <= max)
  const validCellColors = (value: unknown) => value === undefined || Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, shades]) => {
      const cell = Number(key)
      return Number.isInteger(cell) && cell >= 0 && cell < grid.size ** 2 && String(cell) === key &&
        Array.isArray(shades) && shades.length >= 2 && shades.length <= COLORS.length &&
        shades.every(shade => Number.isInteger(shade) && shade >= 1 && shade <= COLORS.length) &&
        new Set(shades).size === shades.length && colors[cell] === shades[0]
    }))
  const mask = (1 << grid.size) - 1
  return isGridText(entries, grid) &&
    (shades === undefined || typeof shades === 'string' && shades.length === entries.length && /^[012]+$/.test(shades)) &&
    validDigits(center, mask) && validDigits(corner, mask) && validDigits(colors, COLORS.length) && validCellColors(cellColors) &&
    (draftSizedRules === undefined ? !(draft && grid.size !== 4 && grid.size !== 9) :
      draft && grid.size !== 9 && draftCages === undefined && isSizedRuleList(draftSizedRules, grid)) &&
    (cageDraft ? isAlgebraicCageList(draftCages, { draft: true }) : draftCages === undefined) &&
    (importedCellColors === undefined || !draft && grid.size === 9 && validImportedCellColors(importedCellColors)) &&
    (candidateColors === undefined || validCandidateColors(candidateColors, grid, shade =>
      typeof shade === 'number' && Number.isInteger(shade) && shade >= 1 && shade <= COLORS.length)) &&
    (importedCandidateColors === undefined || !draft && grid.size === 9 && validCandidateColors(importedCandidateColors, grid, isImportedColor)) &&
    (importedDrawings === undefined || !draft && grid.size === 9 && validImportedDrawings(importedDrawings)) &&
    (eliminations === undefined || validDigits(eliminations, mask)) &&
    (chainSketch == null || validChainSketchState(chainSketch))
}

export function readGame(id: string, data: string | Game | null): Game | undefined {
  if (!data) return
  try {
    const value = (typeof data === 'string' ? JSON.parse(data) : data) as Game & { six?: Game['sized'] }
    if (!value || typeof value !== 'object') return
    if (value.grid !== undefined && (!isSizedGrid(value.grid) || value.variant !== undefined)) return
    const grid = value.grid ?? CLASSIC_GRID
    const draft = value.source === 'draft'
    const cageDraft = draft && grid.size === 4 && value.position?.draftCages !== undefined
    if (value.six !== undefined) {
      if (grid.size !== 6 || value.sized !== undefined) return
      value.sized = value.six
      delete value.six
    }
    if (
      value.id === id && typeof value.title === 'string' && value.title.length <= 72 &&
      sources.includes(value.source) && isGridText(value.givens, grid) &&
      (value.variant === undefined || validVariantSave(value.variant, value.givens)) &&
      (value.whispersGuide === undefined || value.whispersGuide === true && value.variant?.id === 'whispers') &&
      (value.givenCellColors === undefined || !draft && !value.variant?.fog &&
        validGivenCellColors(value.givenCellColors, value.variant, value.grid)) &&
      (value.authoredArtwork === undefined || !draft && !value.grid && value.variant && !value.variant.fog && validAuthoredArtwork(value.authoredArtwork)) &&
      validPosition(value.position, grid, draft, cageDraft) &&
      Array.isArray(value.past) && value.past.every(position => validPosition(position, grid, draft, cageDraft)) &&
      Array.isArray(value.future) && value.future.every(position => validPosition(position, grid, draft, cageDraft)) &&
      Number.isSafeInteger(value.elapsed) && value.elapsed >= 0 && Number.isSafeInteger(value.created) &&
      typeof value.started === 'boolean' && typeof value.paused === 'boolean' &&
      (value.saved === undefined || typeof value.saved === 'boolean') &&
      (value.archived === undefined || typeof value.archived === 'boolean') &&
      (value.editingId === undefined || (typeof value.editingId === 'string' && value.editingId.length <= 100)) &&
      (value.returnId === undefined || (typeof value.returnId === 'string' && value.returnId.length <= 100))
    ) {
      if (draft && 'regions' in grid) {
        if (JSON.stringify(value.position.draftRegions) !== JSON.stringify(grid.regions)) return
        value.position.draftRegions = grid.regions
      }
      if (value.algebraic !== undefined) {
        if (grid.size !== 4 || value.source === 'draft' || !value.algebraic) return
        const algebraic = restoreAlgebraicGame(value.algebraic, value.givens)
        if (!algebraic) return
        value.algebraic = algebraic
      }
      if (value.sized !== undefined) {
        if (grid.size === 9 || draft || value.algebraic || !value.sized) return
        const sized = restoreSizedRuleGame(value.sized, grid, value.givens)
        if (!sized) return
        value.sized = sized
      } else if (value.grid && grid.size !== 4 && !draft) return
      if (value.difficulty != null && !isDifficulty(value.difficulty)) delete value.difficulty
      if (value.uniquenessProof !== undefined && !hasUniquenessProof(value)) delete value.uniquenessProof
      if (value.nonUnique !== true) delete value.nonUnique
      if (value.score != null && (!Number.isSafeInteger(value.score) || value.score < 0)) delete value.score
      if (value.variantRatingVersion !== undefined && (!value.variant || !Number.isSafeInteger(value.variantRatingVersion) ||
        value.variantRatingVersion < 1)) delete value.variantRatingVersion
      if (value.candidatesInitialized !== true) delete value.candidatesInitialized
      if (value.collection !== undefined && !isCollectionReference(value.collection)) delete value.collection
      if (value.sharedPuzzleId !== undefined && !isSharedPuzzleId(value.sharedPuzzleId)) delete value.sharedPuzzleId
      if (value.analysisUsed !== true) delete value.analysisUsed
      if (value.chainSketch !== undefined && !validChainSketchState(value.chainSketch)) delete value.chainSketch
      if (value.branchWorkspace !== undefined && (draft || value.grid || value.variant?.fog ||
        !validBranchWorkspace(value.branchWorkspace, value.givens))) delete value.branchWorkspace
      if (value.subsetWorkspace !== undefined) {
        const workspace = !draft && readSubsetWorkspace(value.subsetWorkspace, grid)
        if (workspace) value.subsetWorkspace = workspace
        else delete value.subsetWorkspace
      }
      if (value.bookmarks !== undefined) {
        const ids = new Set<string>()
        const bookmarks = !draft && Array.isArray(value.bookmarks) ? value.bookmarks.filter(bookmark => {
          if (!bookmark || typeof bookmark.id !== 'string' || !bookmark.id || bookmark.id.length > 100 || ids.has(bookmark.id) ||
            typeof bookmark.name !== 'string' || !bookmark.name.trim() || bookmark.name.length > BOOKMARK_NAME_LIMIT ||
            !validPosition(bookmark.position, grid, false, false) ||
            (bookmark.chainSketch !== undefined && !validChainSketchState(bookmark.chainSketch))) return false
          ids.add(bookmark.id)
          return true
        }) : []
        if (bookmarks.length) value.bookmarks = bookmarks
        else delete value.bookmarks
      }
      if (value.actionHistory !== undefined && !validActionHistory(value.actionHistory, grid)) delete value.actionHistory
      if (value.timeUntracked !== true) delete value.timeUntracked
      if (value.savedForLater !== true) delete value.savedForLater
      if (value.pendingSave !== true || !shouldOfferPuzzleSave(value)) delete value.pendingSave
      if (value.customMode !== undefined) {
        const definition = value.source === 'generated' && value.variant ? readCustomModeDefinition(value.customMode) : undefined
        if (definition) value.customMode = definition
        else delete value.customMode
      }
      if (value.source !== 'generated' || value.generatedWithAuto !== true) delete value.generatedWithAuto
      if (value.practiceTechnique !== undefined &&
        (value.source !== 'generated' || value.grid || !hasPracticePuzzles(value.practiceTechnique) ||
          Boolean(value.variant) !== hasVariantPracticePuzzles(value.practiceTechnique))) {
        delete value.practiceTechnique
      }
      const attempt = value.ratingAttempt
      if (attempt !== undefined && (value.source === 'draft' || !isRatingAttempt(attempt) ||
        (attempt.outcome && (attempt.outcome.gameId !== id || attempt.outcome.givens !== value.givens ||
          attempt.outcome.difficulty !== attempt.grade.difficulty ||
          normalizePuzzleIdentity(attempt.outcome.puzzleKey ?? attempt.outcome.givens) !== puzzleIdentity(value))))) delete value.ratingAttempt
      if (typeof data === 'string') storedSnapshots.set(value, data)
      return value
    }
  } catch {
    // Skip isolated corrupt records so the rest of the library still opens.
  }
}

function writeGame(game: Game) {
  const raw = JSON.stringify(game)
  localStorage.setItem(GAME_PREFIX + game.id, raw)
  storedSnapshots.set(game, raw)
  clearPendingElapsed(game.id)
}

function clearPendingElapsed(id: string) {
  pendingElapsed.delete(id)
  if (!pendingElapsed.size && clockCheckpoint !== undefined) {
    clearTimeout(clockCheckpoint)
    clockCheckpoint = undefined
  }
}

function retainStoredSnapshot(previous: Game, next: Game) {
  const raw = storedSnapshots.get(previous)
  if (raw !== undefined && !storedSnapshots.has(next)) storedSnapshots.set(next, raw)
}

function scheduleClockCheckpoint() {
  if (clockCheckpoint !== undefined || !pendingElapsed.size) return
  clockCheckpoint = setTimeout(() => {
    clockCheckpoint = undefined
    flushElapsed()
  }, CLOCK_CHECKPOINT_MS)
  // Node storage tests do not need an outstanding browser checkpoint to keep the process open.
  clockCheckpoint.unref?.()
}

function flushElapsed(id?: string) {
  for (const key of id === undefined ? [...pendingElapsed.keys()] : [id]) {
    const pending = pendingElapsed.get(key)
    if (!pending) continue
    const game = room.games.find(item => item.id === key)
    if (!game) { clearPendingElapsed(key); continue }
    if (indexedPuzzleSaves) {
      clearPendingElapsed(key)
      queueSave(key, { before: pending.base, after: game, rebase: latest => latest })
      continue
    }
    let raw: string | null
    try { raw = readSaved(localStorage, GAME_PREFIX + key) }
    catch {
      if (room.storageAvailable) publish({ ...room, storageAvailable: false })
      continue
    }
    if (pending.raw === undefined ? raw !== null : raw !== pending.raw) {
      // A remote move, reset, or deletion is authoritative. Never write a stale board or clock over it.
      clearPendingElapsed(key)
      onStorage({ storageArea: localStorage, key: GAME_PREFIX + key } as StorageEvent)
      continue
    }
    const saved = persist(() => writeGame(game))
    if (!saved && room.storageAvailable) publish({ ...room, storageAvailable: false })
  }
  scheduleClockCheckpoint()
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
    if (isRatingEvent(event) && event.id === id) return normalizedRatingEvent(event)
  } catch { /* Ignore a malformed result. */ }
}

function rememberOutcome(event: RatingEvent | undefined) {
  if (event === undefined || (ratingEvents.has(event.id) && !unsavedRatingEvents.has(event.id))) return true
  ratingEvents.set(event.id, normalizedRatingEvent(event))
  const saved = persist(() => localStorage.setItem(RATING_PREFIX + event.id, JSON.stringify(event)))
  if (saved) unsavedRatingEvents.delete(event.id)
  else unsavedRatingEvents.add(event.id)
  return saved
}

function normalizedRatingEvent(event: RatingEvent): RatingEvent {
  const puzzleKey = event.puzzleKey && normalizePuzzleIdentity(event.puzzleKey)
  return puzzleKey && puzzleKey !== event.puzzleKey ? { ...event, puzzleKey } : event
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

function mergeStoredMetadata(game: Game): Game {
  try {
    const current = JSON.parse(localStorage.getItem(GAME_PREFIX + game.id) ?? 'null') as Game | null
    if (current?.id !== game.id) return game
    const savedForLater = current.savedForLater === true ? true : undefined
    if (room.storageAvailable && savedForLater !== game.savedForLater) game = { ...game, savedForLater }
    const attempt = game.ratingAttempt
    if (!attempt) return game
    const saved = puzzleIdentity(current) === puzzleIdentity(game) ? current.ratingAttempt : undefined
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
  } catch { /* Keep the session's metadata when storage is unavailable. */ }
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
    if (previous !== null && previous !== game.id) return true
    // Read historical insertion-order keys without rewriting stored evidence.
    return Object.keys(localStorage).some((key) => key.startsWith(SEEN_PREFIX) &&
      normalizePuzzleIdentity(key.slice(SEEN_PREFIX.length)) === identity && localStorage.getItem(key) !== game.id)
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

function migrateStorage(storage: Storage, skipGames = false) {
  return persist(() => {
    for (const key of Object.keys(storage).filter((key) => key.startsWith(LEGACY_PREFIX))) {
      const value = storage.getItem(key)
      if (value === null) continue
      const next = storageKey(key)
      if (skipGames && (next.startsWith(GAME_PREFIX) || next.startsWith(activityPrefix))) continue
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

    const initialized = Boolean(readSaved(localStorage, READY))
    // Keep the original result when connect() hydrates again.
    firstVisit ??= !initialized && !storedGames.length && !keys.some(key => key.startsWith(SEEN_PREFIX) || key.startsWith(RATING_PREFIX))
    const initializedStorage = initialized || persist(() => localStorage.setItem(READY, '1'))
    let tabActive: string | null = null
    try {
      migrateStorage(sessionStorage)
      tabActive = readSaved(sessionStorage, ACTIVE)
    } catch { /* local fallback */ }
    const last = tabActive ?? readSaved(localStorage, ACTIVE)
    const sorted = orderGames(games)
    let outcomesSaved = true
    for (const game of games) {
      outcomesSaved = rememberOutcome(game.ratingAttempt?.outcome) && outcomesSaved
    }
    publish({
      games: sorted,
      active: last === '' ? null : sorted.find((game) => game.id === last && (game.id === tabActive || !game.savedForLater))?.id ??
        sorted.find((game) => !game.savedForLater)?.id ?? null,
      stoppedPlaying: last === '',
      storageAvailable: migrated && removedStarter && initializedStorage && outcomesSaved,
      playerRating: playerRatingFor(sorted),
    })
  } catch {
    publish({ ...room, storageAvailable: false })
  }
}

function onStorage(event: StorageEvent) {
  if (event.storageArea !== localStorage) return
  if (event.key === null) {
    for (const id of pendingElapsed.keys()) clearPendingElapsed(id)
    if (!indexedPuzzleSaves) hydrate()
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
  if (indexedPuzzleSaves || !key.startsWith(GAME_PREFIX)) return
  const id = key.slice(GAME_PREFIX.length)
  const raw = readSaved(localStorage, key)
  const pending = pendingElapsed.get(id)
  const current = room.games.find(game => game.id === id)
  const incoming = pending && pending.raw === raw && current ? current : readGame(id, raw)
  if (pending && pending.raw !== raw) clearPendingElapsed(id)
  const outcomeSaved = rememberOutcome(incoming?.ratingAttempt?.outcome)
  const games = room.games.filter((game) => game.id !== id)
  if (incoming) games.push(incoming)
  const sorted = orderGames(games)
  // Filing a puzzle in another tab can leave it open in this one.
  const active = room.stoppedPlaying || sorted.some((game) => game.id === room.active)
    ? room.active : sorted.find((game) => !game.savedForLater)?.id ?? null
  publish({ ...room, games: sorted, active, storageAvailable: room.storageAvailable && outcomeSaved,
    playerRating: playerRatingFor(sorted) })
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

function withSavedForLater(state: Room, game: Game, savedForLater: true | undefined, onlyUnstarted = false): Room {
  if (indexedPuzzleSaves) {
    const filePuzzle = (current?: Game) => {
      if (!current || (onlyUnstarted && !shouldOfferPuzzleSave(current)) ||
          (savedForLater && (current.source === 'draft' || isSolved(current)))) return current
      const next = { ...current, savedForLater }
      if (savedForLater) delete next.pendingSave
      return next
    }
    const updated = filePuzzle(game)
    if (!updated || updated === game) return state
    const clock = pendingElapsed.get(game.id)
    clearPendingElapsed(game.id)
    queueSave(game.id, { before: clock?.base ?? game, after: updated, rebase: filePuzzle })
    return { ...state, games: state.games.map(item => item.id === game.id ? updated : item) }
  }
  const key = GAME_PREFIX + game.id
  let current = game
  if (state.storageAvailable || pendingElapsed.has(game.id)) {
    // A move from another tab may have reached storage before its storage event.
    try {
      const stored = readSaved(localStorage, key)
      const pending = pendingElapsed.get(game.id)
      if (pending && (pending.raw === undefined ? stored !== null : pending.raw !== stored)) clearPendingElapsed(game.id)
      if (stored === null && (state.storageAvailable || storedSnapshots.has(game))) return state
      if (stored !== null) current = storedSnapshots.get(game) === stored ? game : readGame(game.id, stored) ?? game
    } catch { /* Keep the session's progress when storage is unavailable. */ }
  }
  if (savedForLater && (current.source === 'draft' || isSolved(current))) return state
  const updated = { ...current, savedForLater }
  if (savedForLater) delete updated.pendingSave
  const saved = persist(() => writeGame(updated))
  if (!saved) retainStoredSnapshot(current, updated)
  return { ...state, games: state.games.map(item => item.id === game.id ? updated : item),
    storageAvailable: state.storageAvailable && saved }
}

function publishSelection(state: Room, active: string | null) {
  // An empty ID records an explicit stop. A missing key allows the default selection.
  const saved = remember(active ?? '')
  publish({ ...state, active, stoppedPlaying: active === null, storageAvailable: state.storageAvailable && saved })
}

function playPuzzle(state: Room, game: Game) {
  if (game.savedForLater) state = withSavedForLater(state, game, undefined)
  publishSelection(state, game.id)
  playListeners.forEach(listener => listener(game.id))
}

type CommittedSave = { version: PuzzleVersion; game?: Game; played?: number }
type PuzzleEdit = {
  before?: Game
  after?: Game
  rebase: (latest?: Game) => Game | undefined
  played?: number
  onSaved?: (before: Game | undefined, after: Game | undefined) => void
}
type SaveQueue = { edits: (PuzzleEdit & { sequence: number })[]; task?: Promise<void> }
let saveWriter: string | undefined
let saveSequence = 0
const refreshAfterSave = new Set<string>()

const committed = new Map<string, CommittedSave>()
const saveQueues = new Map<string, SaveQueue>()
let startup: { active: Promise<void>; library: Promise<void> } | undefined

function readCommitted(record: PuzzleSave): CommittedSave {
  const value = readGame(record.id, record.value)
  const game = value?.source === 'starter' || record.id === BUILT_IN_STARTER_ID ? undefined : value
  return { version: record.version, game, played: record.played }
}

function acceptSave(record: PuzzleSave) {
  const previous = committed.get(record.id)
  if (previous && Number(previous.version) >= Number(record.version)) return false
  const save = readCommitted(record)
  committed.set(record.id, save)
  rememberPuzzleActivity(record.id, save.played)
  return true
}

function publishCommitted(id: string) {
  const save = committed.get(id)
  const current = room.games.find(game => game.id === id)
  const clock = pendingElapsed.get(id)
  if (clock && clock.base === save?.game) return
  if (clock) clearPendingElapsed(id)
  rememberPuzzleActivity(id, save?.played)
  if (current === save?.game) return
  const games = room.games.filter(game => game.id !== id)
  if (save?.game) games.push(save.game)
  const sorted = orderGames(games)
  const active = room.stoppedPlaying || sorted.some(game => game.id === room.active)
    ? room.active : sorted.find(game => !game.savedForLater)?.id ?? null
  const outcomeSaved = rememberOutcome(save?.game?.ratingAttempt?.outcome)
  publish({ ...room, games: sorted, active, storageAvailable: room.storageAvailable && outcomeSaved,
    playerRating: playerRatingFor(sorted) })
}

async function refreshIndexedPuzzle(id: string) {
  if (!indexedPuzzleSaves) return
  if (saveQueues.has(id)) {
    refreshAfterSave.add(id)
    return
  }
  try {
    const record = await indexedPuzzleSaves.read(id)
    if (saveQueues.has(id)) refreshAfterSave.add(id)
    else if (record && acceptSave(record)) publishCommitted(id)
  } catch {
    if (room.storageAvailable) publish({ ...room, storageAvailable: false })
  }
}

async function drainSaves(id: string, queue: SaveQueue) {
  if (!indexedPuzzleSaves || !saveWriter) return
  const writer = saveWriter
  try {
    while (queue.edits.length) {
      let game: Game | undefined
      let count = 0
      const notifications: (() => void)[] = []
      const result = await indexedPuzzleSaves.edit(id, record => {
        const current = committed.get(id)
        const base = current?.version === record?.version ? current : record && readCommitted(record)
        game = base?.game
        let played = base?.played
        // Collect all edits that arrived before the transaction read completed.
        // A rapid input sequence can commit in a single write.
        count = queue.edits.length
        for (let index = 0; index < count; index++) {
          const edit = queue.edits[index]
          if (record?.stamp?.writer === writer && record.stamp.sequence >= edit.sequence) continue
          const before = game
          game = edit.before === before ? edit.after : edit.rebase(before)
          if (before === game) continue
          played = edit.played ?? played
          const after = game
          if (edit.onSaved) notifications.push(() => edit.onSaved?.(before, after))
        }
        if (game !== base?.game) return { game: game ?? null, played,
          stamp: { writer, sequence: queue.edits[count - 1].sequence } }
      })
      if (result.record) committed.set(id, { version: result.record.version, game, played: result.record.played })
      else committed.delete(id)
      queue.edits.splice(0, count)
      if (result.saved) notifications.forEach(notify => notify())
    }
    saveQueues.delete(id)
    publishCommitted(id)
    if (refreshAfterSave.delete(id)) void refreshIndexedPuzzle(id)
  } catch {
    if (room.storageAvailable) publish({ ...room, storageAvailable: false })
  }
}

function startSave(id: string, queue: SaveQueue) {
  queue.task ??= drainSaves(id, queue).finally(() => { queue.task = undefined })
  return queue.task
}

function queueSave(id: string, edit: PuzzleEdit) {
  let queue = saveQueues.get(id)
  if (!queue) {
    queue = { edits: [] }
    saveQueues.set(id, queue)
  }
  saveWriter ??= createGameId()
  queue.edits.push({ ...edit, sequence: ++saveSequence })
  void startSave(id, queue)
}

function retrySaves() {
  for (const [id, queue] of saveQueues) void startSave(id, queue)
}

function checkpointSaves() {
  if (!indexedPuzzleSaves || !saveWriter) return
  for (const [id, queue] of saveQueues) {
    const last = queue.edits.at(-1)
    if (!last) continue
    const game = room.games.find(item => item.id === id)
    let played = committed.get(id)?.played
    for (const edit of queue.edits) played = edit.played ?? played
    indexedPuzzleSaves.checkpoint(id, { writer: saveWriter, sequence: last.sequence, version: committed.get(id)?.version,
      game: game ?? null, played })
  }
}

function launchSelection() {
  let tab: string | null = null
  let last: string | null = null
  try { tab = readSaved(sessionStorage, ACTIVE) } catch { /* Use the last puzzle on this device. */ }
  try { last = tab ?? readSaved(localStorage, ACTIVE) } catch { /* Use the puzzle library. */ }
  return { tab, last }
}

function publishLibrary(games: Game[], storageAvailable: boolean) {
  const { tab, last } = launchSelection()
  const sorted = orderGames(games)
  let outcomesSaved = true
  for (const game of sorted) outcomesSaved = rememberOutcome(game.ratingAttempt?.outcome) && outcomesSaved
  publish({
    games: sorted,
    active: last === '' ? null : sorted.find(game => game.id === last && (game.id === tab || !game.savedForLater))?.id ??
      sorted.find(game => !game.savedForLater)?.id ?? null,
    stoppedPlaying: last === '',
    storageAvailable: storageAvailable && outcomesSaved,
    playerRating: playerRatingFor(sorted),
  })
}

function prepareIndexedRoom(requested?: string) {
  if (!indexedPuzzleSaves) return
  if (startup) return startup
  const saves = indexedPuzzleSaves
  const active = (async () => {
    const { last } = launchSelection()
    const id = requested ?? last
    const record = id ? await saves.read(id) : undefined
    if (record && !saveQueues.has(record.id)) acceptSave(record)
    const game = id ? committed.get(id)?.game : undefined
    publishLibrary(game ? [game] : [], room.storageAvailable)
  })().catch(() => {
    // A failed migration leaves the original save available on this device.
    const id = requested ?? launchSelection().last
    let game: Game | undefined
    try { if (id) game = readGame(id, readSaved(localStorage, GAME_PREFIX + id)) }
    catch { /* Browser storage is unavailable. */ }
    publishLibrary(game ? [game] : [], false)
  })
  const library = active.then(async () => {
    const records = await saves.all()
    const migrated = migrateStorage(localStorage, true)
    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (!key.startsWith(RATING_PREFIX)) continue
      const event = readRatingEvent(key.slice(RATING_PREFIX.length))
      if (event && !unsavedRatingEvents.has(event.id)) ratingEvents.set(event.id, event)
    }
    for (const record of records) if (!saveQueues.has(record.id)) acceptSave(record)
    const games = new Map(room.games.map(game => [game.id, game]))
    for (const [id, save] of committed) {
      if (saveQueues.has(id) || pendingElapsed.has(id)) continue
      if (save.game) games.set(id, save.game)
      else games.delete(id)
    }
    const initialized = Boolean(readSaved(localStorage, READY))
    firstVisit ??= !initialized && !records.length && !keys.some(key => key.startsWith(SEEN_PREFIX) || key.startsWith(RATING_PREFIX))
    const initializedStorage = initialized || persist(() => localStorage.setItem(READY, '1'))
    publishLibrary([...games.values()], room.storageAvailable && migrated && initializedStorage)
  }).catch(() => {
    firstVisit = false
    // Keep the open board and any legacy saves if IndexedDB cannot open or migrate.
    const games = new Map(room.games.map(game => [game.id, game]))
    try {
      for (const key of Object.keys(localStorage).map(storageKey)) {
        if (!key.startsWith(GAME_PREFIX)) continue
        const id = key.slice(GAME_PREFIX.length)
        if (games.has(id) || committed.has(id) || saveQueues.has(id)) continue
        const game = readGame(id, readSaved(localStorage, key))
        if (game && game.source !== 'starter' && id !== BUILT_IN_STARTER_ID) games.set(id, game)
      }
    } catch { /* The open board remains available. */ }
    publishLibrary([...games.values()], false)
  })
  return startup = { active, library }
}

// Hydrate before React reads the store. This also keeps Vite hot replacement
// from exposing the starter puzzle while a newly evaluated module waits for an
// effect to reconnect it.
if (typeof window !== 'undefined' && !indexedPuzzleSaves) hydrate()

export const roomStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  onPlay(listener: (id: string | null) => void) {
    playListeners.add(listener)
    return () => { playListeners.delete(listener) }
  },
  onEdit(listener: (id: string, handoff: boolean) => void) {
    editListeners.add(listener)
    return () => { editListeners.delete(listener) }
  },
  view(id: string) {
    if (room.active !== id) flushElapsed()
    const game = room.games.find(item => item.id === id)
    if (game && (room.active !== id || game.savedForLater)) {
      publishSelection(game.savedForLater ? withSavedForLater(room, game, undefined) : room, id)
    }
  },
  refreshPuzzle(id: string): void | Promise<void> {
    if (indexedPuzzleSaves) return refreshIndexedPuzzle(id)
    onStorage({ storageArea: localStorage, key: GAME_PREFIX + id } as StorageEvent)
  },
  playedMiniGivens() {
    const result = new Set(room.games.filter(game =>
      game.grid?.size === 4 && !game.algebraic && !game.sized && game.source !== 'draft').map(game => game.givens))
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(SEEN_PREFIX)) continue
        const givens = key.slice(SEEN_PREFIX.length)
        if (isGridText(givens, MINI_GRID)) result.add(givens)
      }
    } catch { /* Saved puzzles remain available if browser storage is unavailable. */ }
    return [...result]
  },
  playedSizedGivens(grid: Exclude<SizedGrid, typeof MINI_GRID>) {
    const layout = sizedGridIdentity(grid)
    const result = new Set(room.games.filter(game => game.grid?.size === grid.size && sizedGridIdentity(game.grid) === layout &&
      game.sized?.rules.length === 0 && game.source !== 'draft').map(game => game.givens))
    const prefix = `${SEEN_PREFIX}${layout}:`
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix) || !key.endsWith(':')) continue
        const givens = key.slice(prefix.length, -1)
        if (isGridText(givens, grid)) result.add(givens)
      }
    } catch { /* Saved puzzles remain available if browser storage is unavailable. */ }
    return [...result]
  },
  playedAlgebraicPuzzles() {
    const puzzles = new Map(room.games.flatMap(game => game.algebraic
      ? [[puzzleIdentity(game), algebraicPosition(game.algebraic, game.givens)] as const] : []))
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(`${SEEN_PREFIX}algebraic:`)) continue
        const identity = key.slice(SEEN_PREFIX.length)
        if (puzzles.has(identity)) continue
        const start = 'algebraic:'.length
        const separator = identity.indexOf(':', start)
        const givens = identity.slice(start, separator)
        if (separator < 0 || !isGridText(givens, MINI_GRID)) continue
        const json = identity.slice(separator + 1)
        try {
          const definitions = JSON.parse(`[${json}]`) as Pick<AlgebraicCage, 'cells' | 'total'>[]
          const rules = definitions.map(({ cells, total }) => ({ type: 'algebraic-cage', cells, total, label: algebraicLabel(total) }))
          if (isAlgebraicCageList(rules)) puzzles.set(identity, algebraicPosition({ rules }, givens))
        } catch { /* Skip a single invalid seen-puzzle record. */ }
      }
    } catch { /* Saved puzzles remain available when browser storage is unavailable. */ }
    return [...puzzles.values()]
  },
  getSnapshot: () => room,
  getServerSnapshot: () => initial,
  prepare: prepareIndexedRoom,
  connect() {
    flushElapsed()
    if (!indexedPuzzleSaves && !pendingElapsed.size) hydrate()
    const unsubscribe = indexedPuzzleSaves?.subscribe(id => { void refreshIndexedPuzzle(id) })
    const checkpoint = () => {
      flushElapsed()
      checkpointSaves()
      retrySaves()
    }
    const visibilityChanged = () => { if (document.hidden) checkpoint() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('pagehide', checkpoint)
    if (indexedPuzzleSaves) {
      document.addEventListener('visibilitychange', visibilityChanged)
      window.addEventListener('focus', retrySaves)
    }
    return () => {
      checkpoint()
      unsubscribe?.()
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pagehide', checkpoint)
      if (indexedPuzzleSaves) {
        document.removeEventListener('visibilitychange', visibilityChanged)
        window.removeEventListener('focus', retrySaves)
      }
    }
  },
  select(id: string) {
    flushElapsed()
    const game = room.games.find((game) => game.id === id)
    if (game) playPuzzle(room, game)
  },
  saveForLater(id: string, { notify = true, onlyUnstarted = false } = {}) {
    const game = room.games.find(item => item.id === id)
    if (!game) return
    const next = withSavedForLater(room, game, true, onlyUnstarted)
    if (next === room) return
    if (room.active === id) {
      publishSelection(next, null)
      if (notify) playListeners.forEach(listener => listener(null))
    } else publish(next)
  },
  resolvePendingSave(id: string, save: boolean) {
    let game = room.games.find(item => item.id === id)
    if (!indexedPuzzleSaves && room.storageAvailable) {
      // Check for a move or a save from another tab before discarding anything.
      try {
        const raw = readSaved(localStorage, GAME_PREFIX + id)
        game = raw === null ? undefined : readGame(id, raw)
      } catch { /* Use the in-memory game when browser storage is unavailable. */ }
    }
    if (!shouldOfferPuzzleSave(game)) return
    if (save) roomStore.saveForLater(id, { notify: false, onlyUnstarted: true })
    else roomStore.remove(id, { notify: false, onlyUnstarted: true })
  },
  stopPlaying(id: string) {
    if (room.active === id) flushElapsed(id)
    if (room.active === id) { publishSelection(room, null); playListeners.forEach(listener => listener(null)) }
  },
  startFirstPuzzle() {
    if (firstVisit === false || room.games.length || room.stoppedPlaying) return
    roomStore.add({ ...makeGame(createGameId(), 'Puzzle 1', FIRST_PUZZLE, 'generated'),
      difficulty: 'medium', score: 888, paused: puzzleTiming.getSnapshot().pauseOnOpen })
  },
  add(game: Game) {
    flushElapsed()
    firstVisit = false
    if (game.ratingAttempt && seenPuzzle(game)) game = { ...game, ratingAttempt: undefined }
    const seenSaved = rememberPuzzle(game)
    const handoff = !game.savedForLater && game.source !== 'draft'
    if (indexedPuzzleSaves) queueSave(game.id, { after: game, rebase: latest => latest ?? game,
      onSaved: () => announceEdit(game.id, handoff) })
    const saved = indexedPuzzleSaves ? true : persist(() => writeGame(game))
    const games = orderGames([game, ...room.games])
    const next = { ...room, games, playerRating: playerRatingFor(games), storageAvailable: room.storageAvailable && saved && seenSaved }
    if (game.savedForLater) publish(next)
    else playPuzzle(next, game)
    // Keep the just-added puzzle recoverable while its IndexedDB write is pending.
    if (indexedPuzzleSaves) checkpointSaves()
    if (!indexedPuzzleSaves && saved) announceEdit(game.id, handoff)
  },
  update(id: string, update: (game: Game) => Game, { derived = false, chainCandidates }: {
    derived?: boolean
    chainCandidates?: (game: Game) => readonly number[] | null
  } = {}) {
    const current = room.games.find((game) => game.id === id)
    if (!current) return
    let merged = current
    if (!indexedPuzzleSaves && (room.storageAvailable || pendingElapsed.has(id))) {
      // Another tab may have just installed a remote save or tombstone. Use
      // the latest persisted board even before its storage event is delivered.
      try {
        const raw = readSaved(localStorage, GAME_PREFIX + id)
        const pending = pendingElapsed.get(id)
        if (pending && (pending.raw === undefined ? raw !== null : pending.raw !== raw)) clearPendingElapsed(id)
        if (raw === null && (room.storageAvailable || storedSnapshots.has(current))) { roomStore.refreshPuzzle(id); return }
        if (raw !== null && storedSnapshots.get(current) !== raw) merged = readGame(id, raw) ?? current
      } catch { /* Continue in memory if browser storage changes availability. */ }
    } else if (!indexedPuzzleSaves) {
      merged = mergeStoredMetadata(current)
    }
    const apply = (before: Game) => {
      let next = pruneChainsAfterMove(before, update(before), chainCandidates)
      if (next === before) return next
      if (!puzzleTiming.getSnapshot().trackTime && next.source !== 'draft' && next.started &&
        (next.position !== before.position || !before.started) && !isSolved(before)) next = markSolveUntimed(next)
      if (!before.ratingAttempt && next.ratingAttempt && seenPuzzle(next)) next = { ...next, ratingAttempt: undefined }
      if (next.ratingAttempt && !next.ratingAttempt.outcome && next.position.entries !== before.position.entries && isSolved(next)) {
        next = finishAttempt(next, 'solved')
      }
      if (next.pendingSave && !shouldOfferPuzzleSave(next)) next = { ...next, pendingSave: undefined }
      return next
    }
    const next = apply(merged)
    if (merged === next) {
      if (merged !== current) roomStore.refreshPuzzle(id)
      return
    }
    const wasPlayed = (before: Game, after: Game) => after.position !== before.position || after.started !== before.started
    const played = wasPlayed(merged, next)
    const playedAt = played ? Date.now() : undefined
    function notifyEdit(before?: Game, after?: Game) {
      if (!before || !after || derived) return
      const pauseChanged = after.paused !== before.paused
      if (wasPlayed(before, after) || pauseChanged || after.elapsed === before.elapsed) {
        const finished = after.position.entries !== before.position.entries && isSolved(after) && !isSolved(before)
        announceEdit(id, pauseChanged || finished)
      }
    }
    if (indexedPuzzleSaves) {
      const clock = pendingElapsed.get(id)
      clearPendingElapsed(id)
      if (playedAt !== undefined) rememberPuzzleActivity(id, playedAt)
      queueSave(id, { before: clock?.base ?? merged, after: next, rebase: latest => latest && apply(latest),
        played: playedAt, onSaved: notifyEdit })
    }
    const saved = indexedPuzzleSaves ? true : persist(() => {
      writeGame(next)
      if (playedAt !== undefined) localStorage.setItem(activityPrefix + id, String(playedAt))
    })
    if (!saved) retainStoredSnapshot(merged, next)
    if (!indexedPuzzleSaves && saved) notifyEdit(merged, next)
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
  /** Update the displayed clock without serializing its board and undo history on every tick. */
  advanceElapsed(id: string, seconds: number) {
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || !puzzleTiming.getSnapshot().trackTime) return
    const current = room.games.find(game => game.id === id)
    if (!current || !current.started || current.paused || current.timeUntracked || isSolved(current) ||
      !Number.isSafeInteger(current.elapsed + seconds)) return
    if (!pendingElapsed.has(id)) pendingElapsed.set(id, { raw: storedSnapshots.get(current), base: current })
    const next = { ...current, elapsed: current.elapsed + seconds }
    retainStoredSnapshot(current, next)
    publish({ ...room, games: room.games.map(game => game.id === id ? next : game) })
    scheduleClockCheckpoint()
  },
  flushElapsed,
  async flushPuzzle(id: string) {
    flushElapsed(id)
    const queue = saveQueues.get(id)
    if (queue) await startSave(id, queue)
    if (saveQueues.has(id)) throw new Error('The puzzle could not be saved on this device.')
  },
  finishRatingAttempt(id: string, finish: Exclude<RatingFinish, 'solved'>) {
    roomStore.update(id, (game) => isSolved(game) ? game : finishAttempt(game, finish))
  },
  remove(id: string, { notify = true, onlyUnstarted = false } = {}) {
    const clock = pendingElapsed.get(id)
    clearPendingElapsed(id)
    const wasActive = room.active === id
    const removed = room.games.find((game) => game.id === id)
    const seenSaved = !removed || rememberPuzzle(removed)
    const games = room.games.filter((game) => game.id !== id)
    const active = room.active === id ? games.find((game) => !game.savedForLater)?.id ?? null : room.active
    if (indexedPuzzleSaves) {
      queueSave(id, { before: clock?.base ?? removed, rebase: latest =>
        onlyUnstarted && !shouldOfferPuzzleSave(latest) ? latest : undefined,
        onSaved: () => announceEdit(id, true) })
    }
    const saved = persist(() => {
      if (!indexedPuzzleSaves) {
        const key = GAME_PREFIX + id
        localStorage.removeItem(legacyKey(key))
        localStorage.removeItem(key)
      }
      localStorage.removeItem(puzzleSelectionKey(id))
      localStorage.removeItem(puzzleTabsKey(id))
      localStorage.removeItem(activityPrefix + id)
    })
    const outcomeSaved = rememberOutcome(removed && (removed.ratingAttempt?.outcome ?? hintEvidence(removed)))
    const remembered = remember(room.stoppedPlaying ? '' : active)
    publish({ ...room, games, active, playerRating: playerRatingFor(games),
      storageAvailable: room.storageAvailable && saved && remembered && seenSaved && outcomeSaved })
    if (!indexedPuzzleSaves && saved) announceEdit(id, true)
    if (wasActive && notify) playListeners.forEach(listener => listener(null))
  },
}
