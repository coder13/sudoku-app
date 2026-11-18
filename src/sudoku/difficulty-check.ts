import { DIFFICULTY_LEVELS, currentDifficulty, difficultyIndex, isDifficulty } from './difficulty.ts'
import type { Difficulty } from './engine.ts'
import { createGameId } from './game.ts'

export type DifficultyFeedback = 'too-easy' | 'about-right' | 'too-hard'
export type TechniquePreferences = { comfortable: string[]; practice: string[] }
export type DifficultyCheck = {
  id: string
  level: Difficulty
  lower: number
  upper: number
  attempts: number
  gameId?: string
  recommendation?: Difficulty
}
type CheckState = { techniques: TechniquePreferences; check?: DifficultyCheck }

const STORAGE_KEY = 'sudoku-app:v1:difficulty-check'
const empty: CheckState = { techniques: { comfortable: [], practice: [] } }
const listeners = new Set<() => void>()
let state = empty
let initialized = false

function readCheck(): CheckState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<CheckState> | null
    const validList = (value: unknown): value is string[] =>
      Array.isArray(value) && value.length <= 200 && value.every(id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id))
    if (!saved?.techniques || !validList(saved.techniques.comfortable) || !validList(saved.techniques.practice)) return empty
    const check = saved.check
    const validCheck = check && typeof check.id === 'string' && /^[a-f0-9-]{36}$/.test(check.id) && isDifficulty(check.level) &&
      (check.gameId === undefined || typeof check.gameId === 'string') &&
      (check.recommendation === undefined || isDifficulty(check.recommendation)) &&
      [check.lower, check.upper, check.attempts].every(Number.isSafeInteger) &&
      check.lower >= 0 && check.upper < DIFFICULTY_LEVELS.length && check.attempts >= 0 && check.attempts <= 4
    return { techniques: saved.techniques, check: validCheck ? check : undefined }
  } catch { return empty }
}

function publish(next: CheckState) {
  state = next
  listeners.forEach(listener => listener())
}

function sync(event: StorageEvent) {
  if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) publish(readCheck())
}

function getSnapshot() {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true
    state = readCheck()
    window.addEventListener('storage', sync)
  }
  return state
}

function save(next: CheckState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) }
  catch { /* Keep the session available when browser storage is disabled. */ }
  publish(next)
}

export function nextDifficultyCheck(check: DifficultyCheck, feedback: DifficultyFeedback): DifficultyCheck {
  const current = difficultyIndex(check.level)
  const attempts = check.attempts + 1
  const lower = feedback === 'too-easy' ? Math.max(check.lower, current + 1) : check.lower
  const upper = feedback === 'too-hard' ? Math.min(check.upper, current - 1) : check.upper
  const proposed = current + (feedback === 'too-easy' ? 1 : -1)
  const level = feedback === 'about-right' ? check.level
    : DIFFICULTY_LEVELS[Math.max(0, Math.min(proposed, DIFFICULTY_LEVELS.length - 1))]
  const recommendation = feedback === 'about-right' ? check.level
    : lower > upper ? DIFFICULTY_LEVELS[Math.max(0, Math.min(upper, DIFFICULTY_LEVELS.length - 1))]
    : attempts >= 4 ? feedback === 'too-easy' ? check.level : level : undefined
  return { ...check, lower, upper, attempts, level, recommendation, gameId: undefined }
}

export const difficultyCheckStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot,
  getServerSnapshot: () => empty,
  choose(level: Difficulty, techniques: TechniquePreferences): DifficultyCheck {
    const check = { id: createGameId(), level: currentDifficulty(level), lower: 0, upper: DIFFICULTY_LEVELS.length - 1, attempts: 0 }
    save({ techniques, check })
    return check
  },
  setTechniques(techniques: TechniquePreferences) {
    save({ ...getSnapshot(), techniques })
  },
  attach(check: DifficultyCheck, gameId: string) {
    const current = getSnapshot()
    if (current.check?.id !== check.id || current.check.attempts !== check.attempts || current.check.gameId || current.check.recommendation) return false
    save({ ...current, check: { ...current.check, gameId } })
    return true
  },
  detach(gameId: string) {
    const current = getSnapshot()
    if (current.check?.gameId === gameId) save({ ...current, check: { ...current.check, gameId: undefined } })
  },
  record(gameId: string, feedback: DifficultyFeedback) {
    const current = getSnapshot()
    if (current.check?.gameId !== gameId) return false
    save({ ...current, check: nextDifficultyCheck(current.check, feedback) })
    return true
  },
  close() {
    save({ techniques: getSnapshot().techniques })
  },
}
