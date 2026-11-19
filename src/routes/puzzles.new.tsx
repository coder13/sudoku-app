import { createFileRoute, redirect } from '@tanstack/react-router'
import { isVariantId, type VariantId } from '../sudoku/variants'
import { isGenerationRulesetId, type GenerationRulesetId } from '../sudoku/variant-rulesets'

type NewPuzzleSearch = { step?: 'difficulty'; variant?: VariantId; ruleset?: GenerationRulesetId }

export const Route = createFileRoute('/puzzles/new')({
  validateSearch: (search): NewPuzzleSearch => {
    if (!isVariantId(search.variant)) return {}
    const choice = { variant: search.variant,
      ...(isGenerationRulesetId(search.variant, search.ruleset) ? { ruleset: search.ruleset } : {}) }
    return search.step === 'difficulty' ? { step: 'difficulty', ...choice } : choice
  },
  beforeLoad: ({ search, location }) => {
    if (search.step === 'difficulty' && !location.pathname.endsWith('/difficulty')) {
      throw redirect({ to: '/puzzles/new/difficulty', search: { variant: search.variant, ruleset: search.ruleset }, replace: true })
    }
  },
})
