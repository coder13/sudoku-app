import { createFileRoute } from '@tanstack/react-router'
import { isDifficulty } from '../sudoku/difficulty'
import type { SolvedPuzzleFilters } from '../sudoku/puzzle-activity'
import { isGameVariantId } from '../sudoku/new-puzzle'

function dateParam(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return
  const date = new Date(value + 'T00:00:00Z')
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value
}

export const Route = createFileRoute('/puzzles/solved')({
  validateSearch: (search): SolvedPuzzleFilters => ({
    variant: isGameVariantId(search.variant) ? search.variant : undefined,
    difficulty: isDifficulty(search.difficulty) || search.difficulty === 'unrated' ? search.difficulty : undefined,
    from: dateParam(search.from),
    to: dateParam(search.to),
  }),
  component: () => null,
})
