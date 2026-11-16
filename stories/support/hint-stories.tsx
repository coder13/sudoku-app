import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { HintCard } from '../../src/components/HintCard'
import { describeHint, describeSingleHint, HINT_ERROR, NO_HINT, type CellReferenceStyle } from '../../src/sudoku/hints'
import { techniqueDifficulties } from '../../src/sudoku/technique-difficulties'
import { lessonExamples } from './fixtures'

export const hintMeta = {
  component: HintCard,
  parameters: { layout: 'centered' },
  args: { onClose: fn() },
} satisfies Meta<typeof HintCard>

export const techniqueStory = (id: string): StoryObj<typeof hintMeta> => ({
  args: { hint: describeHint(lessonExamples[id].deduction, { difficulty: techniqueDifficulties[id] }) },
})

export function fallbackHints(cellReferenceStyle?: CellReferenceStyle) {
  return [
    describeSingleHint([40, 5], cellReferenceStyle),
    NO_HINT,
    HINT_ERROR,
    describeHint({ ...lessonExamples['x-wing'].deduction, actions: [] }),
  ]
}
