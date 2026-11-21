import {
  calcudokuCandidateSignatures, calcudokuRecipeKey, calcudokuRecipeSignature,
} from '../calcudoku/generator.ts'
import type { NumberPuzzleDifficulty } from './catalog.ts'
import {
  decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, generatedNumberToken, RECENT_GENERATED_PUZZLE_LIMIT,
} from './generated.ts'
import { readGeneratedSessions, readRequest, transactionDone, type GeneratedIdentity } from './generated-storage.ts'
import { olderCalcudoku, retrySeed, selectCalcudokuPlay, type GenerationOptions } from './generation.ts'

type Layout = {
  difficulty: NumberPuzzleDifficulty
  signature: string
  latest: number
  orientations: string[]
}

const layoutsStore = 'layouts'
const checkpointStore = 'checkpoints'
const recentIndex = 'recent'
const checkpointKey = 'latest'

function openLayoutIndex(): Promise<IDBDatabase> {
  const open = indexedDB.open('sudoku-calcudoku-layouts', 1)
  open.onupgradeneeded = () => {
    const layouts = open.result.createObjectStore(layoutsStore, { keyPath: ['difficulty', 'signature'] })
    layouts.createIndex(recentIndex, ['difficulty', 'latest'])
    open.result.createObjectStore(checkpointStore)
  }
  return readRequest(open)
}

function summarizeLayouts(sessions: readonly GeneratedIdentity[]): Layout[] {
  const layouts = new Map<string, { difficulty: NumberPuzzleDifficulty; latest: number; orientations: Set<string> }>()
  // Exact replays share a payload. Decode and compare the clues once each.
  const payloads = new Map<string, { difficulty: NumberPuzzleDifficulty; signature: string; key: string }>()
  for (const { id, number } of sessions) {
    try {
      const [, payload] = id.split('.', 2)
      let layout = payloads.get(payload)
      if (layout && !generatedNumberToken(id)) continue
      if (!layout) {
        const stored = decodeGeneratedNumberPuzzle(id, 'calcudoku')
        if (!stored) continue
        layout = {
          difficulty: stored.difficulty,
          signature: calcudokuRecipeSignature(stored.recipe),
          key: calcudokuRecipeKey(stored.recipe),
        }
        payloads.set(payload, layout)
      }
      let summary = layouts.get(layout.signature)
      if (!summary) {
        summary = { difficulty: layout.difficulty, latest: number, orientations: new Set() }
        layouts.set(layout.signature, summary)
      }
      summary.latest = number
      summary.orientations.add(layout.key)
    } catch { /* Ignore invalid saved cages. */ }
  }
  return Array.from(layouts, ([signature, { difficulty, latest, orientations }]) =>
    ({ difficulty, signature, latest, orientations: [...orientations] }))
}

async function saveLayouts(
  db: IDBDatabase,
  checkpoint: GeneratedIdentity | undefined,
  last: GeneratedIdentity | undefined,
  additions: Layout[],
  rebuild: boolean,
) {
  const write = db.transaction([layoutsStore, checkpointStore], 'readwrite', { durability: 'relaxed' })
  const finish = transactionDone(write)
  const apply = async () => {
    try {
      const markers = write.objectStore(checkpointStore)
      const current: GeneratedIdentity | undefined = await readRequest(markers.get(checkpointKey))
      // A second worker can finish while this worker reads the saved sessions.
      if (current?.number !== checkpoint?.number || current?.id !== checkpoint?.id) return false
      const layouts = write.objectStore(layoutsStore)
      if (rebuild) layouts.clear()
      await Promise.all(additions.map(async entry => {
        const previous: Layout | undefined = !rebuild
          ? await readRequest(layouts.get([entry.difficulty, entry.signature])) : undefined
        if (previous) entry.orientations = [...new Set([...previous.orientations, ...entry.orientations])]
        layouts.put(entry)
      }))
      if (last) markers.put(last, checkpointKey)
      else markers.delete(checkpointKey)
      return true
    } catch (error) {
      try { write.abort() } catch { /* IndexedDB may have already aborted the write. */ }
      throw error
    }
  }
  const [updated] = await Promise.all([apply(), finish])
  return updated
}

function readRecent(store: IDBObjectStore, difficulty: NumberPuzzleDifficulty): Promise<Map<string, number>> {
  const range = IDBKeyRange.bound([difficulty, 1], [difficulty, Infinity])
  const request = store.index(recentIndex).openCursor(range, 'prev')
  return new Promise((resolve, reject) => {
    const recent = new Map<string, number>()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(recent)
        return
      }
      const { signature, latest }: Layout = cursor.value
      recent.set(signature, latest)
      if (recent.size === RECENT_GENERATED_PUZZLE_LIMIT) resolve(recent)
      else cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

async function readCandidateHistory(db: IDBDatabase, { difficulty, seed }: GenerationOptions) {
  const candidates = new Set([
    ...calcudokuCandidateSignatures(difficulty, seed),
    ...calcudokuCandidateSignatures(difficulty, retrySeed(seed)),
  ])
  const transaction = db.transaction(layoutsStore)
  const layouts = transaction.objectStore(layoutsStore)
  const [recent, matches] = await Promise.all([
    readRecent(layouts, difficulty),
    Promise.all(Array.from(candidates, signature =>
      readRequest<Layout | undefined>(layouts.get([difficulty, signature])))),
  ])
  return { recent, history: selectionHistory(matches) }
}

function selectionHistory(layouts: readonly (Layout | undefined)[]) {
  const signatures = new Set<string>()
  const recipes = new Set<string>()
  for (const layout of layouts) {
    if (!layout) continue
    signatures.add(layout.signature)
    for (const key of layout.orientations) recipes.add(key)
  }
  return { signatures, recipes }
}

export async function generateIndexedCalcudoku(
  request: GenerationOptions,
  publish: (token: string, indexPending?: boolean) => Promise<void>,
) {
  const db = await openLayoutIndex()
  try {
    const { difficulty } = request
    for (let attempt = 0; attempt < 3; attempt++) {
      const read = db.transaction(checkpointStore)
      const checkpoint: GeneratedIdentity | undefined = await readRequest(read.objectStore(checkpointStore).get(checkpointKey))
      const { reset, sessions } = await readGeneratedSessions('calcudoku', checkpoint)
      const additions = summarizeLayouts(sessions)
      const last = sessions.at(-1)
      const rebuild = !checkpoint || reset
      if (rebuild) {
        const group = additions.filter(layout => layout.difficulty === difficulty).sort((a, b) => b.latest - a.latest)
        const recent = new Map(group.slice(0, RECENT_GENERATED_PUZZLE_LIMIT).map(({ signature, latest }) => [signature, latest]))
        const selection = selectCalcudokuPlay(request, recent, selectionHistory(group))
        const recipe = selection.recipe ??
          olderCalcudoku(difficulty, sessions.map(({ id }) => id), selection.excluded) ?? selection.catalogRecipe()
        // Let the board open before the index writes compete with the session save.
        await publish(encodeGeneratedNumberPuzzle({ game: 'calcudoku', difficulty, recipe }, crypto.randomUUID()), Boolean(last || reset))
        if (last || reset) await saveLayouts(db, checkpoint, last, additions, true).catch(() => {})
        return
      }
      if (last && !await saveLayouts(db, checkpoint, last, additions, false)) continue
      const { recent, history } = await readCandidateHistory(db, request)
      const selection = selectCalcudokuPlay(request, recent, history)
      let recipe = selection.recipe
      if (!recipe) {
        const { sessions: history } = await readGeneratedSessions('calcudoku')
        recipe = olderCalcudoku(difficulty, history.map(({ id }) => id), selection.excluded) ?? selection.catalogRecipe()
      }
      await publish(encodeGeneratedNumberPuzzle({ game: 'calcudoku', difficulty, recipe }, crypto.randomUUID()))
      return
    }
    throw new Error('Calcudoku layout history changed during indexing.')
  } finally {
    db.close()
  }
}
