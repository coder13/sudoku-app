import index from './generated/collection-index.json' with { type: 'json' }
import type { Difficulty } from './engine.ts'
import { DIFFICULTY_LABELS } from './difficulty.ts'
import { isSolved, type Game } from './game.ts'
import { BUNDLED_COLLECTIONS } from './collection-files.ts'
import { collectionGridHash } from './collection-integrity.ts'

export type CollectionPuzzle = {
  id: string
  title: string
  givens: string
  difficulty: Difficulty | null
  points: number
  hardestTechnique: string | null
  scoringVersion: number
  sourceRating?: number
}

export type CollectionPuzzleInfo = Omit<CollectionPuzzle, 'givens'> & { givensHash: string; bytes: number }

export type PuzzleCollection = {
  id: string
  title: string
  description: string
  creator: string
  sourceUrl: string
  sourceRevision: string
  license: string
  licenseUrl: string
  changes: string
  kind: 'handmade' | 'generated'
  puzzles: readonly CollectionPuzzleInfo[]
}

export const COLLECTIONS: readonly PuzzleCollection[] = BUNDLED_COLLECTIONS.map(({ header }) => ({
  ...header,
  puzzles: (index as Record<string, CollectionPuzzleInfo[]>)[header.id] ?? [],
}))
const collectionsById = new Map(COLLECTIONS.map(collection => [collection.id, collection]))

export function getCollection(id: string | undefined) {
  return id === undefined ? undefined : collectionsById.get(id)
}

export function getCollectionPuzzle(collectionId: string | undefined, puzzleId: string | undefined) {
  const collection = getCollection(collectionId)
  const puzzle = collection?.puzzles.find(puzzle => puzzle.id === puzzleId)
  return collection && puzzle ? { collection, puzzle } : undefined
}

export function getGameCollection(game: Game) {
  const entry = getCollectionPuzzle(game.collection?.collectionId, game.collection?.puzzleId)
  return entry && matchesCollectionPuzzle(entry.puzzle, game) ? entry : undefined
}

function collectionGameHash(game: Game) {
  if (game.source === 'draft' || game.variant) return
  return collectionGridHash(game.givens)
}

export function matchesCollectionPuzzle(puzzle: CollectionPuzzleInfo, game: Game) {
  return collectionGameHash(game) === puzzle.givensHash
}

// Bulk operations reuse one lookup for the saved games that match each puzzle.
export function indexCollectionGames(games: readonly Game[]) {
  const matches = new Map<string, Game[]>()
  for (const game of games) {
    const hash = collectionGameHash(game)
    if (hash === undefined) continue
    const matching = matches.get(hash)
    if (matching) matching.push(game)
    else matches.set(hash, [game])
  }
  const empty: readonly Game[] = []
  const matching = (puzzle: CollectionPuzzleInfo) => matches.get(puzzle.givensHash) ?? empty
  return {
    find: (puzzle: CollectionPuzzleInfo) => preferredCollectionGame(matching(puzzle)),
    status: (puzzle: CollectionPuzzleInfo) => matchingGamesStatus(matching(puzzle)),
  }
}

export function findCollectionGame(puzzle: CollectionPuzzleInfo, games: readonly Game[]) {
  return preferredCollectionGame(games.filter(game => matchesCollectionPuzzle(puzzle, game)))
}

function preferredCollectionGame(matching: readonly Game[]) {
  return matching.find(game => game.started && !isSolved(game)) ?? matching.find(isSolved) ?? matching[0]
}

export type CollectionPuzzleStatus = 'unplayed' | 'in-progress' | 'solved'

export function collectionPuzzleStatus(puzzle: CollectionPuzzleInfo, games: readonly Game[]): CollectionPuzzleStatus {
  return matchingGamesStatus(games.filter(game => matchesCollectionPuzzle(puzzle, game)))
}

function matchingGamesStatus(matching: readonly Game[]): CollectionPuzzleStatus {
  if (matching.some(isSolved)) return 'solved'
  return matching.some(game => game.started) ? 'in-progress' : 'unplayed'
}

export function collectionDifficulties(collection: PuzzleCollection, available?: ReadonlySet<string>) {
  return (Object.keys(DIFFICULTY_LABELS) as Difficulty[]).filter(difficulty =>
    collection.puzzles.some(puzzle => puzzle.difficulty === difficulty && (!available || available.has(puzzle.id))))
}

export function collectionPuzzles(collection: PuzzleCollection, difficulty: Difficulty, available?: ReadonlySet<string>) {
  return collection.puzzles.filter(puzzle => puzzle.difficulty === difficulty && (!available || available.has(puzzle.id)))
}

export function collectionProgress(collection: PuzzleCollection, games: readonly Game[], difficulty?: Difficulty) {
  const puzzles = difficulty ? collectionPuzzles(collection, difficulty) : collection.puzzles
  const { status } = indexCollectionGames(games)
  return puzzles.reduce((counts, puzzle) => {
    counts[status(puzzle)]++
    return counts
  }, { unplayed: 0, 'in-progress': 0, solved: 0 })
}

// Wrap to earlier unfinished puzzles without switching difficulty or replaying a solve.
export function nextCollectionPuzzle(collection: PuzzleCollection, games: readonly Game[], difficulty: Difficulty, afterId?: string, available?: ReadonlySet<string>) {
  const puzzles = collectionPuzzles(collection, difficulty, available)
  const { status } = indexCollectionGames(games)
  if (!afterId) {
    return puzzles.find(puzzle => status(puzzle) === 'in-progress')
      ?? puzzles.find(puzzle => status(puzzle) === 'unplayed')
  }
  const index = puzzles.findIndex(puzzle => puzzle.id === afterId)
  const remaining = index < 0 ? puzzles : [...puzzles.slice(index + 1), ...puzzles.slice(0, index)]
  return remaining.find(puzzle => status(puzzle) !== 'solved')
}
