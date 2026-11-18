import { difficultyIndex } from './difficulty.ts'
import type { Difficulty, HintStages, LessonPosition } from './engine'
import topics from './generated/practice-topics.json' with { type: 'json' }
import type { TechniqueProgress } from './technique-progress'

export type PracticeTopic = keyof typeof topics
export const PRACTICE_TOPICS = topics as Record<PracticeTopic, { name: string; difficulty: Difficulty }>

export const PRACTICE_LEVELS = {
  singles: 'Singles',
  patterns: 'Patterns',
  advanced: 'Advanced',
}

export type PracticeLevel = keyof typeof PRACTICE_LEVELS
export type PracticePosition = LessonPosition & { hint: HintStages & { technique: PracticeTopic }; sourceGivens?: string }
export type PracticeOutcome = 'first-try' | 'retried' | 'hinted' | 'revealed' | 'skipped'
export type PracticeMode = 'mixed' | 'named'
type Attempt = { outcome: PracticeOutcome; review: boolean }
type PracticeRecord = { seenAt: number; mixed?: Attempt; named?: Attempt }

export const PRACTICE_SET_SIZE = 5
const storagePrefix = 'sudoku-app:v1:practice:'
const levelTopics: Record<PracticeLevel, readonly PracticeTopic[]> = {
  singles: ['naked-single', 'hidden-single'],
  patterns: ['naked-single', 'hidden-single', 'pointing', 'claiming', 'naked-pair'],
  advanced: ['pointing', 'claiming', 'naked-pair', 'x-wing'],
}

export function isPracticeTopic(value: unknown): value is PracticeTopic {
  return typeof value === 'string' && Object.hasOwn(PRACTICE_TOPICS, value)
}

export function autoPracticeLevel(difficulty: Difficulty): PracticeLevel {
  if (difficultyIndex(difficulty) <= difficultyIndex('easy')) return 'singles'
  if (difficulty === 'medium') return 'patterns'
  return 'advanced'
}

export function recommendedPractice(progress: readonly TechniqueProgress[]) {
  const supported = progress.filter((item): item is TechniqueProgress & { technique: PracticeTopic } =>
    item.hintedPuzzles >= 2 && item.withHints > item.withoutHints && isPracticeTopic(item.technique),
  )
  return supported.sort((a, b) => b.hintedPuzzles - a.hintedPuzzles || b.withHints - a.withHints)[0]
}

export function readPracticeRecord(givens: string): PracticeRecord | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(storagePrefix + givens) ?? 'null') as PracticeRecord | null
    if (typeof value?.seenAt === 'number' && Number.isFinite(value.seenAt)) return value
  } catch { /* The session can continue without storage. */ }
}

function savePracticeRecord(givens: string, record: PracticeRecord) {
  try { localStorage.setItem(storagePrefix + givens, JSON.stringify(record)) }
  catch { /* The session can continue without storage. */ }
}

export function markPracticeSeen(givens: string) {
  const previous = readPracticeRecord(givens)
  savePracticeRecord(givens, { ...previous, seenAt: Date.now() })
  return Boolean(previous)
}

export function recordPracticeOutcome(givens: string, mode: PracticeMode, attempt: Attempt) {
  const previous = readPracticeRecord(givens)
  // Preserve the first result in this mode. Replays still update review recency.
  savePracticeRecord(givens, { ...previous, seenAt: Date.now(), [mode]: previous?.[mode] ?? attempt })
}

export function practiceSource(position: PracticePosition) {
  return position.sourceGivens ?? position.givens
}

export function practiceSet(pool: readonly PracticePosition[], level: PracticeLevel, topic?: PracticeTopic, avoid: readonly string[] = []) {
  const allowed = topic ? [topic] : levelTopics[level]
  const recent = new Set(avoid)
  const distinct = new Map(pool.filter((position) => allowed.includes(position.hint.technique))
    .map((position) => [position.givens, position]))
  const remaining = [...distinct.values()].map((position) => ({
    position,
    source: practiceSource(position),
    seen: readPracticeRecord(practiceSource(position))?.seenAt ?? 0,
    previousSet: recent.has(position.givens),
    tie: Math.random(),
  }))
  const selected: PracticePosition[] = []
  const sources = new Set<string>()
  const counts = new Map<PracticeTopic, number>()
  const count = (technique: PracticeTopic) => counts.get(technique) ?? 0

  while (selected.length < PRACTICE_SET_SIZE && remaining.length) {
    remaining.sort((a, b) => Number(sources.has(a.source)) - Number(sources.has(b.source)) ||
      Number(a.previousSet) - Number(b.previousSet) ||
      Number(Boolean(a.seen)) - Number(Boolean(b.seen)) ||
      count(a.position.hint.technique) - count(b.position.hint.technique) ||
      a.seen - b.seen || a.tie - b.tie)
    const { position, source } = remaining.shift()!
    selected.push(position)
    sources.add(source)
    const { technique } = position.hint
    counts.set(technique, count(technique) + 1)
  }
  return selected
}
