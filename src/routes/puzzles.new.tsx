import { createFileRoute, redirect } from '@tanstack/react-router'
import { isSudokuModeId } from '../sudoku/custom-modes'
import { isCustomDifficultyId, type CustomDifficultyId } from '../sudoku/custom-difficulties'
import { isDifficultyPreference, type DifficultyPreference } from '../sudoku/difficulty'
import type { RectangularBoxRows } from '../sudoku/grid'
import { isNewPuzzleId, isSizedPuzzleId, rectangularBoxRows, type NewPuzzleId } from '../sudoku/new-puzzle'
import { isGenerationRulesetId, type GenerationRulesetId } from '../sudoku/variant-rulesets'

type NewPuzzleSearch = {
  step?: 'variant' | 'difficulty'
  mode?: string
  variant?: NewPuzzleId
  difficulty?: DifficultyPreference
  customDifficulty?: CustomDifficultyId
  ruleset?: GenerationRulesetId
  boxRows?: RectangularBoxRows
}

export const Route = createFileRoute('/puzzles/new')({
  validateSearch: (search): NewPuzzleSearch => {
    if (isSudokuModeId(search.mode)) return { mode: search.mode }
    const choice: NewPuzzleSearch = {}
    if (search.step === 'variant' || search.step === 'difficulty') choice.step = search.step
    if (isNewPuzzleId(search.variant)) {
      choice.variant = search.variant
      const boxRows = rectangularBoxRows(search.variant, search.boxRows)
      if (boxRows) choice.boxRows = boxRows
      if (!isSizedPuzzleId(search.variant) && isGenerationRulesetId(search.variant, search.ruleset)) choice.ruleset = search.ruleset
    }
    if (isDifficultyPreference(search.difficulty)) choice.difficulty = search.difficulty
    if (choice.variant === 'classic' && isCustomDifficultyId(search.customDifficulty)) choice.customDifficulty = search.customDifficulty
    return choice
  },
  beforeLoad: ({ search, location }) => {
    const { step, ...choice } = search
    if (step === 'difficulty' && !location.pathname.replace(/\/$/, '').endsWith('/difficulty')) {
      throw redirect({ to: '/puzzles/new/difficulty', search: choice, replace: true })
    }
  },
})
