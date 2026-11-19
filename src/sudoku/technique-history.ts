import { runEngine, type DeductionAction } from './engine'
import { normalizePuzzleIdentity, puzzleIdentity, valuesOf, type Game } from './game'
import { getVariantPlayOrder, variantPosition } from './variant-play'
import type { VariantGame } from './variants'
import {
  rememberTechniqueAction, summarizeTechniques, techniqueActionKey,
  summarizePuzzleTechniques, type PuzzleTechniqueHistory, type PuzzleTechniqueUse, type TechniqueObservation, type TechniqueProgress,
} from './technique-progress'

const EMPTY_PROGRESS: readonly TechniqueProgress[] = []
const PUZZLES = 'puzzles'
let progress = EMPTY_PROGRESS
let database: Promise<IDBDatabase> | undefined
let channel: BroadcastChannel | undefined
let refreshId = 0
const listeners = new Set<() => void>()
const pending = new Set<Promise<void>>()

function openHistory() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sudoku-techniques', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(PUZZLES, { keyPath: 'givens' }) }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = undefined }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    database = undefined
    throw error
  })
  return database
}

async function refreshProgress() {
  if (listeners.size === 0) return
  const id = ++refreshId
  const next = await readProgress()
  if (id !== refreshId) return
  progress = next
  listeners.forEach((listener) => listener())
}

async function readProgress(): Promise<TechniqueProgress[]> {
  try {
    const db = await openHistory()
    return await new Promise((resolve, reject) => {
      const request = db.transaction(PUZZLES).objectStore(PUZZLES).getAll()
      request.onsuccess = () => resolve(summarizeTechniques(request.result as PuzzleTechniqueHistory[]))
      request.onerror = () => reject(request.error)
    })
  } catch { return [] }
}

async function readPuzzle(givens: string): Promise<PuzzleTechniqueHistory | undefined> {
  try {
    const db = await openHistory()
    return await new Promise((resolve, reject) => {
      findHistoryPuzzle(db.transaction(PUZZLES).objectStore(PUZZLES), givens, resolve, reject)
    })
  } catch { return undefined }
}

function findHistoryPuzzle(store: IDBObjectStore, identity: string,
  found: (puzzle: PuzzleTechniqueHistory | undefined) => void, failed: (error: unknown) => void) {
  const request = store.get(identity)
  request.onsuccess = () => {
    if (request.result || !identity.includes(':')) {
      found(request.result as PuzzleTechniqueHistory | undefined)
      return
    }
    // Only older variants with another JSON field order need the cursor fallback.
    const scan = store.openCursor()
    scan.onsuccess = () => {
      const cursor = scan.result
      if (!cursor) found(undefined)
      else if (typeof cursor.key === 'string' && normalizePuzzleIdentity(cursor.key) === identity) {
        found(cursor.value as PuzzleTechniqueHistory)
      } else cursor.continue()
    }
    scan.onerror = () => failed(scan.error)
  }
  request.onerror = () => failed(request.error)
}

function historyChannel() {
  if (typeof BroadcastChannel === 'undefined') return undefined
  channel ??= new BroadcastChannel('sudoku-technique-history')
  channel.onmessage = () => { void refreshProgress() }
  return channel
}

async function updateHistory(givens: string, update: (puzzle: PuzzleTechniqueHistory) => boolean) {
  try {
    const db = await openHistory()
    const changed = await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(PUZZLES, 'readwrite')
      const store = transaction.objectStore(PUZZLES)
      let changed = false
      findHistoryPuzzle(store, givens, (existing) => {
        const puzzle: PuzzleTechniqueHistory = existing ?? { givens, actions: {} }
        changed = update(puzzle)
        if (changed) store.put(puzzle)
      }, reject)
      transaction.oncomplete = () => resolve(changed)
      transaction.onabort = () => reject(transaction.error)
    })
    if (changed) {
      void refreshProgress()
      historyChannel()?.postMessage(null)
    }
  } catch { /* A failed history write does not affect the puzzle. */ }
}

export const techniqueHistory = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    historyChannel()
    void refreshProgress()
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => progress,
  getServerSnapshot: () => EMPTY_PROGRESS,
  async readProgress() {
    await Promise.allSettled(pending)
    return readProgress()
  },
  async readPuzzle(game: Pick<Game, 'givens' | 'variant'>): Promise<PuzzleTechniqueUse[]> {
    await Promise.allSettled(pending)
    return summarizePuzzleTechniques(await readPuzzle(puzzleIdentity(game)))
  },
}

export function observeTechniqueActions(game: Game, actions: readonly DeductionAction[], source: TechniqueObservation['source'],
  eliminations: readonly number[] | undefined = game.position.eliminations) {
  if (game.grid || game.source === 'draft' || actions.length === 0 || typeof indexedDB === 'undefined') return
  const task = recordActions(game, actions, source, eliminations)
  pending.add(task)
  void task.then(() => pending.delete(task), () => pending.delete(task))
}

async function classifyVariantActions(game: Game, variant: VariantGame, actions: readonly DeductionAction[], eliminations?: readonly number[]) {
  const hints = await runEngine({
    type: 'variant', operation: 'hints', position: { ...variantPosition(variant, game.position), eliminations },
    techniqueOrder: await getVariantPlayOrder(), limit: 64,
  }, { background: true })
  const byAction = new Map<string, string>()
  for (const hint of hints) {
    for (const action of hint.actions) {
      const key = techniqueActionKey(action)
      if (!byAction.has(key)) byAction.set(key, hint.technique)
    }
  }
  return actions.map((action) => byAction.get(techniqueActionKey(action)) ?? null)
}

async function recordActions(game: Game, actions: readonly DeductionAction[], source: TechniqueObservation['source'],
  eliminations: readonly number[] | undefined) {
  const at = performance.timeOrigin + performance.now()
  const techniques = source === 'automated' ? [] : await (game.variant
    ? classifyVariantActions(game, game.variant, actions, eliminations)
    : runEngine({ type: 'classify-actions', values: valuesOf(game), eliminations, actions })).catch(() => [])
  if (source === 'independent' && !techniques.some(Boolean)) return
  await updateHistory(puzzleIdentity(game), (puzzle) => {
    if (at >= (puzzle.solutionRevealedAt ?? Infinity)) return false
    let changed = false
    actions.forEach((action, index) => {
      changed = rememberTechniqueAction(puzzle, techniqueActionKey(action), { technique: techniques[index] ?? null, source, at }) || changed
    })
    return changed
  })
}

export function markTechniqueSolution(game: Pick<Game, 'givens' | 'variant'>) {
  const at = performance.timeOrigin + performance.now()
  void updateHistory(puzzleIdentity(game), (puzzle) => {
    if (at >= (puzzle.solutionRevealedAt ?? Infinity)) return false
    puzzle.solutionRevealedAt = at
    return true
  })
}
