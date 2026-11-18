import { findCollectionGame, getCollectionPuzzle, getGameCollection, nextCollectionPuzzle } from './collections.ts'
import { createGameId, makeGame } from './game.ts'
import { roomStore } from './storage.ts'
import { collectionDownloads, fetchCollectionGrid, validCollectionGrid } from './collection-downloads.ts'
import { collectionGameData, decodeCollectionData } from './collection-data.ts'
import { runEngine } from './engine.ts'
import { variantIdForPuzzle } from './variants.ts'
import { rememberSinclair } from './sinclair-history.ts'

type CollectionPlayOptions = { online: boolean; signal?: AbortSignal }

// Reuse an existing game, including a prior import, without replacing its progress.
export async function openCollectionPuzzle(collectionId: string, puzzleId: string,
  { online, signal, play = true, preview }: CollectionPlayOptions & { play?: boolean; preview?: string }) {
  const entry = getCollectionPuzzle(collectionId, puzzleId)
  if (!entry) throw new Error('This puzzle is not in the collection.')
  const { puzzle } = entry
  const remember = () => {
    if (play && puzzle.difficulty) rememberSinclair(collectionId, puzzleId, puzzle.difficulty)
  }
  const findExisting = () => findCollectionGame(puzzle, roomStore.getSnapshot().games)
  let existing = findExisting()
  let data = existing ? collectionGameData(existing) : collectionDownloads.getSnapshot()[collectionId]?.[puzzleId]
  if (!data) {
    if (!online && !collectionDownloads.available(entry.collection).has(puzzleId)) throw new Error('This puzzle is not available offline.')
    data = validCollectionGrid(puzzle, preview) ? preview : await fetchCollectionGrid(entry.collection, puzzle, signal)
    existing = findExisting()
  }
  signal?.throwIfAborted()
  const collection = { collectionId, puzzleId }
  if (existing) {
    roomStore.update(existing.id, game => ({ ...game, collection }))
    if (play) roomStore.select(existing.id)
    remember()
    return { id: existing.id, added: false }
  }
  const decoded = decodeCollectionData(puzzle, data)
  if (!decoded) throw new Error('This puzzle download is invalid. Download it again.')
  const game = { ...makeGame(createGameId(), puzzle.title, decoded.givens, 'collection'), collection }
  if (decoded.puzzle) {
    const definition = decoded.puzzle
    const solution = await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: definition } })
    signal?.throwIfAborted()
    // A second request may have opened this puzzle while its solution was prepared.
    existing = findExisting()
    if (existing) {
      roomStore.update(existing.id, game => ({ ...game, collection }))
      if (play) roomStore.select(existing.id)
      remember()
      return { id: existing.id, added: false }
    }
    const id = variantIdForPuzzle(definition)
    game.variant = { id: id === 'classic' ? 'mixed' : id, puzzle: definition, solution }
  }
  // The play view rates the game with the current engine, just like an import.
  roomStore.add(play ? game : { ...game, savedForLater: true })
  remember()
  return { id: game.id, added: true }
}

export async function openNextCollectionPuzzle(gameId: string, options: CollectionPlayOptions) {
  const { games } = roomStore.getSnapshot()
  const game = games.find(game => game.id === gameId)
  const entry = game && getGameCollection(game)
  if (!entry) throw new Error('This puzzle is not in the collection.')
  if (!entry.puzzle.difficulty) return undefined
  const available = options.online ? undefined : collectionDownloads.available(entry.collection, games)
  const next = nextCollectionPuzzle(entry.collection, games, entry.puzzle.difficulty, entry.puzzle.id, available)
  return next ? openCollectionPuzzle(entry.collection.id, next.id, options) : undefined
}
