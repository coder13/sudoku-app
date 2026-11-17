import nikoli from './collections/nikoli-100.json' with { type: 'json' }
import exchange from './collections/sudoku-exchange.json' with { type: 'json' }
import type { Difficulty } from './engine.ts'
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
  puzzles: readonly CollectionPuzzle[]
}

export const COLLECTIONS: readonly PuzzleCollection[] = [
  {
    id: 'nikoli-classics', title: 'Nikoli Classics', creator: 'Nikoli',
    description: '100 handmade classic puzzles, selected by Nikoli for Sudoku-Bench.',
    sourceUrl: 'https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli',
    sourceRevision: '9034906b4ec06ab1e08daf110c6b562ef72859fd',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    changes: 'Original givens and titles retained. Difficulty ratings added by this app.',
    puzzles: nikoli as CollectionPuzzle[],
  },
  {
    id: 'sudoku-exchange', title: 'Sudoku Exchange Selection', creator: 'Grant McLean / Sudoku Exchange',
    description: 'A selection of generated classic puzzles across our difficulty levels.',
    sourceUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank',
    sourceRevision: 'd8c8ebaee0c08c412cfba96af1923dfa61c83317',
    license: 'Public domain', licenseUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/LICENSE.txt',
    changes: 'Original givens retained. Selection, titles, and difficulty ratings added by this app.',
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

export function collectionProgress(collection: PuzzleCollection, games: readonly Game[]) {
  return collection.puzzles.reduce((counts, puzzle) => {
    counts[collectionPuzzleStatus(puzzle, games)]++
    return counts
  }, { unplayed: 0, 'in-progress': 0, solved: 0 })
}
