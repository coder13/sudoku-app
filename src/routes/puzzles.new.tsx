import { createFileRoute, redirect } from '@tanstack/react-router'
import { isVariantId, type VariantId } from '../sudoku/variants'

type NewPuzzleSearch = { step?: 'difficulty'; variant?: VariantId }

export const Route = createFileRoute('/puzzles/new')({
  validateSearch: (search): NewPuzzleSearch => {
    if (!isVariantId(search.variant)) return {}
    return search.step === 'difficulty' ? { step: 'difficulty', variant: search.variant } : { variant: search.variant }
  },
  beforeLoad: ({ search, location }) => {
    if (search.step === 'difficulty' && !location.pathname.endsWith('/difficulty')) {
      throw redirect({ to: '/puzzles/new/difficulty', search: { variant: search.variant }, replace: true })
    }
  },
})
