import packedIndex from './generated/collection-index.json' with { type: 'json' }
import { unpackPuzzleInfo, type PackedPuzzleInfo } from './collection-index.ts'
import type { Difficulty, VariantPuzzle } from './engine.ts'
import { DIFFICULTY_LABELS } from './difficulty.ts'
import { isSolved, type Game } from './game.ts'
import { collectionGridHash } from './collection-integrity.ts'
import { collectionVariantHash } from './collection-data.ts'
import { libraryCollections } from './sinclair-catalog.ts'

export const COLLECTION_VARIANTS = {
  classic: 'Classic', 'killer-cages': 'Killer', diagonal: 'X Sudoku', jigsaw: 'Jigsaw', kropki: 'Kropki',
  windoku: 'Windoku',
  thermometer: 'Thermometer', arrow: 'Arrow', 'anti-knight': 'Anti-Knight',
} as const
export type CollectionVariant = keyof typeof COLLECTION_VARIANTS
export function isCollectionVariant(value: unknown): value is CollectionVariant {
  return typeof value === 'string' && Object.hasOwn(COLLECTION_VARIANTS, value)
}

export type CollectionPuzzle = {
  id: string
  title: string
  givens: string
  puzzle?: VariantPuzzle
  difficulty: Difficulty | null
  points: number
  hardestTechnique: string | null
  scoringVersion: number
  sourceRating?: number
}

export type CollectionPuzzleInfo = Omit<CollectionPuzzle, 'givens' | 'puzzle'> & { givensHash: string; variantHash?: string; bytes: number }

const index: Record<string, CollectionPuzzleInfo[]> = Object.fromEntries(
  Object.entries(packedIndex as unknown as Record<string, PackedPuzzleInfo[]>)
    .map(([id, puzzles]) => [id, puzzles.map(unpackPuzzleInfo)]),
)

export type PuzzleCollection = {
  id: string
  variant: CollectionVariant
  title: string
  description: string
  creator: string
  sourceUrl: string
  sourceRevision: string
  license?: string
  licenseUrl?: string
  changes: string
  kind: 'handmade' | 'generated' | 'curated'
  puzzleSourceUrl?: string
  puzzles: readonly CollectionPuzzleInfo[]
}

export const COLLECTIONS: readonly PuzzleCollection[] = [
  {
    id: 'nikoli-classics', variant: 'classic', title: 'Nikoli Classics', creator: 'Nikoli',
    description: 'Handmade classics by Nikoli.',
    sourceUrl: 'https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli',
    sourceRevision: '9034906b4ec06ab1e08daf110c6b562ef72859fd',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    changes: 'Original givens and titles retained. Difficulty ratings added by this app.',
    kind: 'handmade',
    puzzles: index['nikoli-classics'],
  },
  {
    id: 'sudoku-exchange', variant: 'classic', title: 'Sudoku Exchange Selection', creator: 'Grant McLean / Sudoku Exchange',
    description: 'A selection of generated classic puzzles across our difficulty levels.',
    sourceUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank',
    sourceRevision: 'd8c8ebaee0c08c412cfba96af1923dfa61c83317',
    license: 'Public domain', licenseUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/LICENSE.txt',
    changes: 'Original givens retained. Selection, titles, and difficulty ratings added by this app.',
    kind: 'generated',
    puzzles: index['sudoku-exchange'],
  },
  ...([
    ['classic', 'classic', 'Classic puzzles selected for the deductions along the way.'],
    ['killer', 'killer-cages', 'Start with an empty grid and use the cage totals to find the digits.'],
    ['x', 'diagonal', 'Place each digit once on both long diagonals.'],
  ] as const).map(([name, variant, description]): PuzzleCollection => ({
    id: `sinclair-${name}`, variant, title: `Sinclair ${COLLECTION_VARIANTS[variant]}`, creator: 'Sinclair',
    description, sourceUrl: '/sinclair-credits.txt', sourceRevision: '2026-11-17', kind: 'generated',
    changes: 'First playtest edition. Use the puzzle code when sharing feedback.',
    puzzles: index[`sinclair-${name}`] ?? [],
  })),
  ...libraryCollections,
]

export function collectionPuzzleSource(collection: PuzzleCollection, puzzle: CollectionPuzzleInfo) {
  return collection.puzzleSourceUrl?.replace('{id}', puzzle.id) ?? collection.sourceUrl
}

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

const gameHashes = new WeakMap<Game, { givensHash: string; variantHash?: string }>()
export function matchesCollectionPuzzle(puzzle: CollectionPuzzleInfo, game: Game) {
  if (game.source === 'draft') return false
  let hashes = gameHashes.get(game)
  if (!hashes) {
    hashes = { givensHash: collectionGridHash(game.givens), variantHash: game.variant && collectionVariantHash(game.variant.puzzle) }
    gameHashes.set(game, hashes)
  }
  return hashes.givensHash === puzzle.givensHash && hashes.variantHash === puzzle.variantHash
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

export function collectionDifficulties(collection: PuzzleCollection, available?: ReadonlySet<string>) {
  return (Object.keys(DIFFICULTY_LABELS) as Difficulty[]).filter(difficulty =>
    collection.puzzles.some(puzzle => puzzle.difficulty === difficulty && (!available || available.has(puzzle.id))))
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
