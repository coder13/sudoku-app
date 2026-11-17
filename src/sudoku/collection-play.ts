import { findCollectionGame, getCollectionPuzzle, getGameCollection, nextCollectionPuzzle } from './collections.ts'
import { createGameId, makeGame } from './game.ts'
import { roomStore } from './storage.ts'
import { collectionDownloads, fetchCollectionGrid, validCollectionGrid } from './collection-downloads.ts'

type CollectionPlayOptions = { online: boolean; signal?: AbortSignal }

// Reuse an existing game, including a prior import, without replacing its progress.
export async function openCollectionPuzzle(collectionId: string, puzzleId: string,
  { online, signal, play = true, preview }: CollectionPlayOptions & { play?: boolean; preview?: string }) {
  const entry = getCollectionPuzzle(collectionId, puzzleId)
  if (!entry) throw new Error('This puzzle is not in the collection.')
  const { puzzle } = entry
  const findExisting = () => findCollectionGame(puzzle, roomStore.getSnapshot().games)
  let existing = findExisting()
  let givens = existing?.givens ?? collectionDownloads.getSnapshot()[collectionId]?.[puzzleId]
  if (!givens) {
    if (!online) throw new Error('This puzzle is not available offline.')
    givens = validCollectionGrid(puzzle, preview) ? preview : await fetchCollectionGrid(entry.collection, puzzle, signal)
    existing = findExisting()
  }
  signal?.throwIfAborted()
  const collection = { collectionId, puzzleId }
  if (existing) {
    roomStore.update(existing.id, game => ({ ...game, collection }))
    if (play) roomStore.select(existing.id)
    return { id: existing.id, added: false }
  }
  const game = { ...makeGame(createGameId(), puzzle.title, givens, 'collection'), collection }
  // The play view rates the game with the current engine, just like an import.
  roomStore.add(play ? game : { ...game, savedForLater: true })
  return { id: game.id, added: true }
}

export async function openNextCollectionPuzzle(gameId: string, options: CollectionPlayOptions) {
  const { games } = roomStore.getSnapshot()
  const game = games.find(game => game.id === gameId)
  const entry = game && getGameCollection(game)
  if (!entry) throw new Error('This puzzle is not in the collection.')
  if (!entry.puzzle.difficulty) return undefined
  const available = options.online ? undefined : new Set(Object.keys(collectionDownloads.grids(entry.collection, games)))
  const next = nextCollectionPuzzle(entry.collection, games, entry.puzzle.difficulty, entry.puzzle.id, available)
  return next ? openCollectionPuzzle(entry.collection.id, next.id, options) : undefined
}
