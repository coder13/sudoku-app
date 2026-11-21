import { kakuroCandidates, kakuroClueCandidates, type KakuroRecipe } from '../kakuro/generator.ts'
import { numberPuzzleDifficulties } from './catalog.ts'
import { encodeGeneratedNumberPuzzle, RECENT_GENERATED_PUZZLE_LIMIT } from './generated.ts'
import { readGeneratedSessions, readRequest } from './generated-storage.ts'
import {
  kakuroCatalogSignatures, kakuroClueSources, KAKURO_CLUE_SOURCE_LIMIT, replayKakuro, retrySeed,
  selectKakuroFromHistory, summarizeKakuroLayouts,
  type GenerationOptions, type KakuroLayout,
} from './generation.ts'
import { layoutsStore, openLayoutIndex, readLayoutCheckpoint, readRecentLayouts, saveLayouts } from './layout-index.ts'

async function firstUnplayedKakuro(
  db: IDBDatabase, candidates: ReturnType<typeof kakuroCandidates>, played: Set<string>,
): Promise<KakuroRecipe | undefined> {
  const store = db.transaction(layoutsStore).objectStore(layoutsStore)
  for (const { signature, recipe } of candidates) {
    if (played.has(signature)) continue
    const keys = await Promise.all(numberPuzzleDifficulties.map(difficulty =>
      readRequest(store.getKey([difficulty, signature]))))
    if (keys.every(key => key === undefined)) return recipe
    played.add(signature)
  }
}

async function selectIndexedKakuro(db: IDBDatabase, request: GenerationOptions) {
  const { difficulty, seed } = request
  // Only fetch the keys for candidate puzzles. Remember hits across all three searches.
  const played = new Set(kakuroCatalogSignatures)
  const recipe = await firstUnplayedKakuro(db, kakuroCandidates(difficulty, seed, played), played)
  if (recipe) return recipe

  const recentStore = db.transaction(layoutsStore).objectStore(layoutsStore)
  const sources = await readRecentLayouts<KakuroLayout>(recentStore, difficulty, KAKURO_CLUE_SOURCE_LIMIT)
  const retry = await firstUnplayedKakuro(db,
    kakuroClueCandidates(difficulty, seed, played, kakuroClueSources(difficulty, sources)), played)
    ?? await firstUnplayedKakuro(db, kakuroCandidates(difficulty, retrySeed(seed), played), played)
  if (retry) return retry

  const replayStore = db.transaction(layoutsStore).objectStore(layoutsStore)
  const recent = await readRecentLayouts<KakuroLayout>(replayStore, difficulty, RECENT_GENERATED_PUZZLE_LIMIT)
  const { sessions } = await readGeneratedSessions('kakuro')
  return replayKakuro(difficulty, recent, sessions.map(({ id }) => id))
}

export async function generateIndexedKakuro(
  request: GenerationOptions,
  publish: (token: string, indexPending?: boolean) => Promise<void>,
) {
  const game = 'kakuro'
  const db = await openLayoutIndex(game)
  try {
    const { difficulty } = request
    for (let attempt = 0; attempt < 3; attempt++) {
      const checkpoint = await readLayoutCheckpoint(db)
      const { reset, sessions } = await readGeneratedSessions(game, checkpoint)
      const additions = summarizeKakuroLayouts(sessions)
      const last = sessions.at(-1)
      if (!checkpoint || reset) {
        const recipe = selectKakuroFromHistory(request, additions, sessions)
        // Let the board open before writing the rebuilt index.
        await publish(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }, crypto.randomUUID()), Boolean(last || reset))
        if (last || reset) await saveLayouts(db, checkpoint, last, additions, true).catch(() => {})
        return
      }
      if (last && !await saveLayouts(db, checkpoint, last, additions, false)) continue
      const recipe = await selectIndexedKakuro(db, request)
      await publish(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }, crypto.randomUUID()))
      return
    }
    throw new Error('Kakuro layout history changed during indexing.')
  } finally {
    db.close()
  }
}
