import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'
import { DigitSelector, type DigitSelectorProps } from '../../src/components/DigitSelector'
import { defaultDigitHighlight, previewPinnedDigit, togglePinnedDigit } from '../../src/sudoku/highlighting'
import { DEFAULT_ADVANCED_MODES } from '../../src/sudoku/preferences'
import { starter } from '../support/fixtures'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Digit selector',
  component: DigitSelector,
  args: {
    digits: { mode: 'value', pencil: false, candidateKind: 'corner', setCandidateKind: fn(), selectedDigit: null, hasCellSelection: false, values: starter.givens, input: fn() },
    tools: { chainDrawing: false, eraseMode: false },
    layout: { advancedModes: DEFAULT_ADVANCED_MODES, disabled: false, draft: false },
  },
  render: (args) => <Width width={320}><DigitSelector {...args} /></Width>,
  parameters: { docs: { description: { component: 'The digit keypad stays in place in Color mode. Select a color in the Colors panel, then click a digit to paint its candidates.' } } },
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
export const PinnedDigits: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: function PinnedKeypad(args) {
    const [highlight, setHighlight] = useState(() => togglePinnedDigit(defaultDigitHighlight, 2))
    return <Width width={320}><DigitSelector {...args} digits={{ ...args.digits,
      highlightedDigitMask: highlight.mask,
      pinnedDigitMask: highlight.pinnedMask,
      onTogglePinnedDigit: (digit, match) => setHighlight(current => togglePinnedDigit(current, digit, null, match)),
      input: digit => setHighlight(current => previewPinnedDigit(current, digit)),
    }} /></Width>
  },
  play: async ({ canvas, userEvent }) => {
    const pin = canvas.getByRole('button', { name: 'Select 2, pinned' })
    const five = canvas.getByRole('button', { name: 'Select 5' })
    const seven = canvas.getByRole('button', { name: 'Select 7' })
    await userEvent.click(five)
    await expect(five).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(seven)
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    await expect(five).toHaveAttribute('aria-pressed', 'false')
    await expect(seven).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Shift>}')
    await userEvent.click(seven)
    await userEvent.keyboard('{/Shift}')
    await expect(canvas.getByRole('button', { name: 'Select 7, pinned' })).toHaveAttribute('data-pinned-digit', 'true')
  },
}
export const PaintingCandidates: Story = {
  args: { digits: {
    mode: 'value', digitPaintColor: 4, onPaintDigit: fn(),
    candidateDigitColors: Array.from({ length: 9 }, (_, index) => (index === 1 ? { candidateCount: 5, colors: [{ color: 4, count: 5 }] } : { candidateCount: 0, colors: [] })),
    selectedDigit: 2,
  } },
}
export const MixedCandidateColors: Story = {
  args: { digits: {
    mode: 'value',
    candidateDigitColors: Array.from({ length: 9 }, (_, index) => index === 2
      ? { candidateCount: 5, colors: [{ color: 1, count: 2 }, { color: 5, count: 1 }] }
      : { candidateCount: 0, colors: [] }),
  } },
}
export const ColorModePainting: Story = {
  args: { digits: {
    mode: 'color', highlightedDigitMask: (1 << 4) | (1 << 7), onToggleDigitHighlight: fn(),
    digitHighlightMatch: 'all', digitPaintColor: 3, onPaintDigit: fn(), onSelectDigit: fn(),
  } },
}
export const ColorModeWithoutPaintColor: Story = {
  args: { digits: { mode: 'color', onSelectDigit: fn() } },
}
