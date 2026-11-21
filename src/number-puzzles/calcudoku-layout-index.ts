import { calcudokuRecipeKeys } from '../calcudoku/generator.ts'
import type { NumberPuzzleDifficulty } from './catalog.ts'
import {
  decodeGeneratedNumberPayload, encodeGeneratedNumberPuzzle, generatedNumberPayload, RECENT_GENERATED_PUZZLE_LIMIT,
} from './generated.ts'
import { readGeneratedSessions, readRequest, type GeneratedIdentity } from './generated-storage.ts'
import {
  findFreshCalcudoku, olderCalcudoku, selectCalcudokuPlay, selectCalcudokuReplay, type GenerationOptions,
} from './generation.ts'
import { layoutsStore, openLayoutIndex, readLayoutCheckpoint, readRecentLayouts, saveLayouts, type PuzzleLayout } from './layout-index.ts'

type Layout = PuzzleLayout & { orientations: string[] }

function summarizeLayouts(sessions: readonly GeneratedIdentity[]): Layout[] {
  const layouts = new Map<string, { difficulty: NumberPuzzleDifficulty; latest: number; orientations: Set<string> }>()
  // Exact replays share a payload. Decode and compare the clues once each.
  const payloads = new Map<string, { difficulty: NumberPuzzleDifficulty; signature: string; key: string } | null>()
  for (const { id, number } of sessions) {
    const payload = generatedNumberPayload(id)
    if (!payload) continue
    try {
      let layout = payloads.get(payload)
      if (layout === undefined) {
        const stored = decodeGeneratedNumberPayload(payload, 'calcudoku')
        layout = stored ? { difficulty: stored.difficulty, ...calcudokuRecipeKeys(stored.recipe) } : null
        payloads.set(payload, layout)
      }
      if (!layout) continue
      let summary = layouts.get(layout.signature)
      if (!summary) {
        summary = { difficulty: layout.difficulty, latest: number, orientations: new Set() }
        layouts.set(layout.signature, summary)
      }
      summary.latest = number
      summary.orientations.add(layout.key)
    } catch {
      // Skip every replay of invalid saved cages.
      payloads.set(payload, null)
    }
  }
  return Array.from(layouts, ([signature, { difficulty, latest, orientations }]) =>
    ({ difficulty, signature, latest, orientations: [...orientations] }))
}

function mergeOrientations(previous: Layout, addition: Layout): Layout {
  return { ...addition, orientations: [...new Set([...previous.orientations, ...addition.orientations])] }
}

async function selectIndexedCalcudoku(db: IDBDatabase, request: GenerationOptions) {
  const { difficulty } = request
  const transaction = db.transaction(layoutsStore)
  const layouts = transaction.objectStore(layoutsStore)
  const search = findFreshCalcudoku(request)
  const matches = new Map<string, Layout>()
  let candidate = search.next()
  while (!candidate.done) {
    const batch = await Promise.all(candidate.value.map(signature =>
      readRequest<Layout | undefined>(layouts.get([difficulty, signature]))))
    for (const layout of batch) if (layout) matches.set(layout.signature, layout)
    candidate = search.next(matches)
  }
  if (candidate.value) return candidate.value

  const recentLayouts = await readRecentLayouts<Layout>(layouts, difficulty, RECENT_GENERATED_PUZZLE_LIMIT)
  const recent = new Map(recentLayouts.map(({ signature, latest }) => [signature, latest]))
  const selection = selectCalcudokuReplay(request, recent, selectionHistory([...matches.values()]))
  if (selection.recipe) return selection.recipe
  const { sessions } = await readGeneratedSessions('calcudoku')
  return olderCalcudoku(difficulty, sessions.map(({ id }) => id), selection.excluded) ?? selection.catalogRecipe()
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
  const db = await openLayoutIndex('calcudoku')
  try {
    const { difficulty } = request
    for (let attempt = 0; attempt < 3; attempt++) {
      const checkpoint = await readLayoutCheckpoint(db)
      const { reset, sessions } = await readGeneratedSessions('calcudoku', checkpoint)
      const additions = summarizeLayouts(sessions)
      const last = sessions.at(-1)
      const rebuild = !checkpoint || reset
      if (rebuild) {
        const group = additions.filter(layout => layout.difficulty === difficulty).sort((a, b) => b.latest - a.latest)
        const recent = new Map(group.slice(0, RECENT_GENERATED_PUZZLE_LIMIT).map(({ signature, latest }) => [signature, latest]))
        const recipe = selectCalcudokuPlay(request, recent, selectionHistory(group), sessions.map(({ id }) => id))
        // Let the board open before the index writes compete with the session save.
        await publish(encodeGeneratedNumberPuzzle({ game: 'calcudoku', difficulty, recipe }, crypto.randomUUID()), Boolean(last || reset))
        if (last || reset) await saveLayouts(db, checkpoint, last, additions, true).catch(() => {})
        return
      }
      if (last && !await saveLayouts(db, checkpoint, last, additions, false, mergeOrientations)) continue
      const recipe = await selectIndexedCalcudoku(db, request)
      await publish(encodeGeneratedNumberPuzzle({ game: 'calcudoku', difficulty, recipe }, crypto.randomUUID()))
      return
    }
    throw new Error('Calcudoku layout history changed during indexing.')
  } finally {
    db.close()
  }
}
