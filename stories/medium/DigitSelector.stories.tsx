import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DigitSelector, type DigitSelectorProps } from '../../src/components/DigitSelector'
import { DEFAULT_ADVANCED_MODES } from '../../src/sudoku/preferences'
import { starter } from '../support/fixtures'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Digit selector',
  component: DigitSelector,
  args: {
    digits: { mode: 'value', pencil: false, candidateKind: 'corner', setCandidateKind: fn(), selectedDigit: null, hasCellSelection: false, values: starter.givens, input: fn() },
    tools: { colorTarget: 'cell', setColorTarget: fn(), onSwitchShade: fn(), eraseMode: false },
    layout: { advancedModes: DEFAULT_ADVANCED_MODES, disabled: false, draft: false },
  },
  render: (args) => (
    <Width width={320}>
      <DigitSelector {...args} />
    </Width>
  ),
} satisfies Meta<typeof DigitSelector>
export default meta
type StoryArgs = Omit<Partial<DigitSelectorProps>, 'digits' | 'tools' | 'layout'> & {
  digits?: Partial<DigitSelectorProps['digits']>
  tools?: Partial<DigitSelectorProps['tools']>
  layout?: Partial<DigitSelectorProps['layout']>
}
type Story = Omit<StoryObj<typeof meta>, 'args'> & { args?: StoryArgs }

export const Digits: Story = {}
export const MatchingDigits: Story = {
  args: { digits: { mode: 'candidate', pencil: true, highlightedDigitMask: 5, onToggleDigitHighlight: fn(), digitHighlightMatch: 'all', onDigitHighlightMatchChange: fn() } },
}
export const PaintingCandidates: Story = {
  args: {
    digits: {
      mode: 'value',
      digitPaintColor: 4,
      candidateDigitColors: Array.from({ length: 9 }, (_, index) => (index === 1 ? { candidateCount: 5, colors: [{ color: 4, count: 5 }] } : { candidateCount: 0, colors: [] })),
      selectedDigit: 2,
    },
  },
}
export const MixedCandidateColors: Story = {
  args: {
    digits: {
      mode: 'value',
      candidateDigitColors: Array.from({ length: 9 }, (_, index) =>
        index === 2
          ? {
              candidateCount: 5,
              colors: [
                { color: 1, count: 2 },
                { color: 5, count: 1 },
              ],
            }
          : { candidateCount: 0, colors: [] }
      ),
    },
  },
}
export const CellColors: Story = { args: { digits: { mode: 'color', selectedDigit: 3 } } }
export const CandidateColors: Story = { args: { digits: { mode: 'color', selectedDigit: 5 }, tools: { colorTarget: 'candidate' } } }
