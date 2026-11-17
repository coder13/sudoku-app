import nikoli from './collections/nikoli-100.json' with { type: 'json' }
import exchange from './collections/sudoku-exchange.json' with { type: 'json' }
import type { Difficulty } from './engine.ts'
import { DIFFICULTY_LABELS } from './difficulty.ts'
import { isSolved, type Game } from './game.ts'

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
  starterPuzzleIds?: readonly string[]
  puzzles: readonly CollectionPuzzle[]
}

export type CollectionSelection = 'starter' | 'all'

export const COLLECTIONS: readonly PuzzleCollection[] = [
  {
    id: 'nikoli-classics', title: 'Nikoli Classics', creator: 'Nikoli',
    description: 'Handmade classics by Nikoli. Start with a short set at your difficulty.',
    sourceUrl: 'https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli',
    sourceRevision: '9034906b4ec06ab1e08daf110c6b562ef72859fd',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    changes: 'Original givens and titles retained. Difficulty ratings added by this app.',
    kind: 'handmade',
    starterPuzzleIds: [
      '170714_sd_easy', 'nhk2209e', 'nhk2107m', 'nhk2304e', 'nhk2209m', 'nhk2108m',
      'nhk1810h', 'nhk2309h2', 'nhk2303h1', 'nhk2311h1', 'nhk2304h1', 'nhk1911h2',
      'nhk2202h2', 'nhk2007h2', 'nhk1903h', 'nhk2403h3', 'nhk2302h3', 'nhk2209h2',
    ],
    puzzles: nikoli as CollectionPuzzle[],
  },
  {
    id: 'sudoku-exchange', title: 'Sudoku Exchange Selection', creator: 'Grant McLean / Sudoku Exchange',
    description: 'A selection of generated classic puzzles across our difficulty levels.',
    sourceUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank',
    sourceRevision: 'd8c8ebaee0c08c412cfba96af1923dfa61c83317',
    license: 'Public domain', licenseUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/LICENSE.txt',
    changes: 'Original givens retained. Selection, titles, and difficulty ratings added by this app.',
    kind: 'generated',
    puzzles: exchange as CollectionPuzzle[],
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
  return entry?.puzzle.givens === game.givens && !game.variant && game.source !== 'draft' ? entry : undefined
}

export function findCollectionGame(puzzle: CollectionPuzzle, games: readonly Game[]) {
  const matching = games.filter(game => game.source !== 'draft' && !game.variant && game.givens === puzzle.givens)
  return matching.find(game => game.started && !isSolved(game)) ?? matching.find(isSolved) ?? matching[0]
}

export type CollectionPuzzleStatus = 'unplayed' | 'in-progress' | 'solved'

export function collectionPuzzleStatus(puzzle: CollectionPuzzle, games: readonly Game[]): CollectionPuzzleStatus {
  const matching = games.filter(game => game.source !== 'draft' && !game.variant && game.givens === puzzle.givens)
  if (matching.some(isSolved)) return 'solved'
  return matching.some(game => game.started) ? 'in-progress' : 'unplayed'
}

export function collectionDifficulties(collection: PuzzleCollection) {
  return (Object.keys(DIFFICULTY_LABELS) as Difficulty[]).filter(difficulty =>
    collection.puzzles.some(puzzle => puzzle.difficulty === difficulty))
}

// Show handmade collections first. Keep a previously played generated collection
// visible so an app update never hides a player's ongoing collection.
export function discoverCollections(games: readonly Game[], all = false) {
  return COLLECTIONS.filter(collection => all || collection.kind === 'handmade' ||
    games.some(game => getGameCollection(game)?.collection.id === collection.id))
}

export function collectionSelection(collection: PuzzleCollection, selection: CollectionSelection = 'all') {
  const ids = collection.starterPuzzleIds ?? []
  const starters = ids.flatMap(id => collection.puzzles.find(puzzle => puzzle.id === id) ?? [])
  if (selection === 'starter' && ids.length) return starters
  return [...starters, ...collection.puzzles.filter(puzzle => !ids.includes(puzzle.id))]
}

export function collectionPuzzles(collection: PuzzleCollection, difficulty: Difficulty, selection: CollectionSelection = 'all') {
  return collectionSelection(collection, selection).filter(puzzle => puzzle.difficulty === difficulty)
}

export function collectionProgress(collection: PuzzleCollection, games: readonly Game[], difficulty?: Difficulty, selection: CollectionSelection = 'all') {
  const puzzles = difficulty ? collectionPuzzles(collection, difficulty, selection) : collectionSelection(collection, selection)
  return puzzles.reduce((counts, puzzle) => {
    counts[collectionPuzzleStatus(puzzle, games)]++
    return counts
  }, { unplayed: 0, 'in-progress': 0, solved: 0 })
}

// Play the starter selection first, then the remaining puzzles in source order.
// Wrap to earlier unfinished puzzles without switching difficulty or replaying a solve.
export function nextCollectionPuzzle(collection: PuzzleCollection, games: readonly Game[], difficulty: Difficulty, afterId?: string) {
  const puzzles = collectionPuzzles(collection, difficulty)
  if (!afterId) {
    return puzzles.find(puzzle => collectionPuzzleStatus(puzzle, games) === 'in-progress')
      ?? puzzles.find(puzzle => collectionPuzzleStatus(puzzle, games) === 'unplayed')
  }
  const index = puzzles.findIndex(puzzle => puzzle.id === afterId)
  const remaining = index < 0 ? puzzles : [...puzzles.slice(index + 1), ...puzzles.slice(0, index)]
  return remaining.find(puzzle => collectionPuzzleStatus(puzzle, games) !== 'solved')
}
