import { createFileRoute } from '@tanstack/react-router'
import { isVariantId, type VariantId } from '../sudoku/variants'

type NewPuzzleSearch = { step?: 'variant' | 'difficulty'; variant?: VariantId }

export const Route = createFileRoute('/puzzles/new')({
  validateSearch: (search): NewPuzzleSearch => {
    if (search.step === 'difficulty' && isVariantId(search.variant)) return { step: 'difficulty', variant: search.variant }
    return search.step === 'variant' ? { step: 'variant' } : {}
  },
  component: () => null,
})
