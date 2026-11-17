import { createFileRoute } from '@tanstack/react-router'
import { isDifficulty } from '../sudoku/difficulty'
import type { Difficulty } from '../sudoku/engine'
import type { CollectionPuzzleStatus } from '../sudoku/collections'

export type CollectionSearch = {
  collection?: string
  puzzle?: string
  difficulty?: Difficulty
  status?: CollectionPuzzleStatus
}

export const Route = createFileRoute('/puzzles/collections')({
  validateSearch: (search): CollectionSearch => ({
    collection: typeof search.collection === 'string' && /^[a-z0-9-]{1,64}$/.test(search.collection) ? search.collection : undefined,
    puzzle: typeof search.puzzle === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(search.puzzle) ? search.puzzle : undefined,
    difficulty: isDifficulty(search.difficulty) ? search.difficulty : undefined,
    status: search.status === 'unplayed' || search.status === 'in-progress' || search.status === 'solved' ? search.status : undefined,
  }),
  component: () => null,
})
