import index from './generated/collection-index.json' with { type: 'json' }
import type { Difficulty } from './engine.ts'
import { DIFFICULTY_LABELS } from './difficulty.ts'
import { isSolved, type Game } from './game.ts'
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

export const COLLECTIONS: readonly PuzzleCollection[] = [
  {
    id: 'nikoli-classics', title: 'Nikoli Classics', creator: 'Nikoli',
    description: 'Handmade classics by Nikoli.',
    sourceUrl: 'https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli',
    sourceRevision: '9034906b4ec06ab1e08daf110c6b562ef72859fd',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    changes: 'Original givens and titles retained. Difficulty ratings added by this app.',
    kind: 'handmade',
    puzzles: index['nikoli-classics'] as CollectionPuzzleInfo[],
  },
  {
    id: 'sudoku-exchange', title: 'Sudoku Exchange Selection', creator: 'Grant McLean / Sudoku Exchange',
    description: 'A selection of generated classic puzzles across our difficulty levels.',
    sourceUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank',
    sourceRevision: 'd8c8ebaee0c08c412cfba96af1923dfa61c83317',
    license: 'Public domain', licenseUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/LICENSE.txt',
    changes: 'Original givens retained. Selection, titles, and difficulty ratings added by this app.',
    kind: 'generated',
    puzzles: index['sudoku-exchange'] as CollectionPuzzleInfo[],
  },
]

export function getCollection(id: string | undefined) {
  return COLLECTIONS.find(collection => collection.id === id)
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

export function matchesCollectionPuzzle(puzzle: CollectionPuzzleInfo, game: Game) {
  return game.source !== 'draft' && !game.variant && collectionGridHash(game.givens) === puzzle.givensHash
}

export function findCollectionGame(puzzle: CollectionPuzzleInfo, games: readonly Game[]) {
  const matching = games.filter(game => matchesCollectionPuzzle(puzzle, game))
  return matching.find(game => game.started && !isSolved(game)) ?? matching.find(isSolved) ?? matching[0]
}

export type CollectionPuzzleStatus = 'unplayed' | 'in-progress' | 'solved'

export function collectionPuzzleStatus(puzzle: CollectionPuzzleInfo, games: readonly Game[]): CollectionPuzzleStatus {
  const matching = games.filter(game => matchesCollectionPuzzle(puzzle, game))
  if (matching.some(isSolved)) return 'solved'
  return matching.some(game => game.started) ? 'in-progress' : 'unplayed'
}

export function collectionDifficulties(collection: PuzzleCollection) {
  return (Object.keys(DIFFICULTY_LABELS) as Difficulty[]).filter(difficulty =>
    collection.puzzles.some(puzzle => puzzle.difficulty === difficulty))
}

// Show handmade collections first. Keep a previously played generated collection
// visible so an app update never hides a player's ongoing collection.
export function discoverCollections(games: readonly Game[], all = false, downloaded: ReadonlySet<string> = new Set()) {
  return COLLECTIONS.filter(collection => all || collection.kind === 'handmade' ||
    downloaded.has(collection.id) ||
    games.some(game => getGameCollection(game)?.collection.id === collection.id))
}

export function collectionPuzzles(collection: PuzzleCollection, difficulty: Difficulty, available?: ReadonlySet<string>) {
  return collection.puzzles.filter(puzzle => puzzle.difficulty === difficulty && (!available || available.has(puzzle.id)))
}

export function collectionProgress(collection: PuzzleCollection, games: readonly Game[], difficulty?: Difficulty) {
  const puzzles = difficulty ? collectionPuzzles(collection, difficulty) : collection.puzzles
  return puzzles.reduce((counts, puzzle) => {
    counts[collectionPuzzleStatus(puzzle, games)]++
    return counts
  }, { unplayed: 0, 'in-progress': 0, solved: 0 })
}

// Wrap to earlier unfinished puzzles without switching difficulty or replaying a solve.
export function nextCollectionPuzzle(collection: PuzzleCollection, games: readonly Game[], difficulty: Difficulty, afterId?: string, available?: ReadonlySet<string>) {
  const puzzles = collectionPuzzles(collection, difficulty, available)
  if (!afterId) {
    return puzzles.find(puzzle => collectionPuzzleStatus(puzzle, games) === 'in-progress')
      ?? puzzles.find(puzzle => collectionPuzzleStatus(puzzle, games) === 'unplayed')
  }
  const index = puzzles.findIndex(puzzle => puzzle.id === afterId)
  const remaining = index < 0 ? puzzles : [...puzzles.slice(index + 1), ...puzzles.slice(0, index)]
  return remaining.find(puzzle => collectionPuzzleStatus(puzzle, games) !== 'solved')
}
