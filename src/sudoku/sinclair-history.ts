import type { Difficulty } from './engine.ts'
import type { VariantId } from './variants.ts'
import { libraryFamily } from './sinclair-catalog.ts'

// Keep a local deal history even if a player deletes a game. Explicit replays through
// Collections stay available after a difficulty is exhausted.
const memory = new Map<string, string[]>()
export function historyKey(family: VariantId, tier: Difficulty) { return 'sudoku-app:v1:sinclair-dealt:' + family + '/' + tier }
export function history(key: string): string[] {
  let stored: unknown
  try { stored = JSON.parse(localStorage.getItem(key) ?? '[]') } catch { /* Use the session history. */ }
  const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  return [...new Set([...ids, ...(memory.get(key) ?? [])])]
}
export function rememberSinclair(collectionId: string, puzzleId: string, tier: Difficulty) {
  const family = libraryFamily(collectionId)
  if (!family) return
  const key = historyKey(family, tier), ids = history(key).filter(id => id !== puzzleId)
  ids.push(puzzleId)
  memory.set(key, ids)
  try { localStorage.setItem(key, JSON.stringify(ids)) } catch { /* The game remains in session history. */ }
}
