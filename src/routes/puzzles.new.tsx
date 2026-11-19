import { createFileRoute, redirect } from '@tanstack/react-router'
import { isNewPuzzleId, type NewPuzzleId } from '../sudoku/new-puzzle'
import { isGenerationRulesetId, type GenerationRulesetId } from '../sudoku/variant-rulesets'

type NewPuzzleSearch = { step?: 'difficulty'; variant?: NewPuzzleId; ruleset?: GenerationRulesetId }

export const Route = createFileRoute('/puzzles/new')({
  validateSearch: (search): NewPuzzleSearch => {
    if (!isNewPuzzleId(search.variant)) return {}
    const choice = { variant: search.variant,
      ...(search.variant !== 'mini' && isGenerationRulesetId(search.variant, search.ruleset) ? { ruleset: search.ruleset } : {}) }
    return search.step === 'difficulty' ? { step: 'difficulty', ...choice } : choice
  },
  beforeLoad: ({ search, location }) => {
    if (search.step === 'difficulty' && !location.pathname.endsWith('/difficulty')) {
      throw redirect({ to: '/puzzles/new/difficulty', search: { variant: search.variant, ruleset: search.ruleset }, replace: true })
    }
  },
})
