import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DEFAULT_ADVANCED_MODES } from '../../src/sudoku/preferences'
import { ControlModeActions } from '../../src/components/ControlModeActions'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Play/ControlModeActions',
  component: ControlModeActions,
  args: {
    digits: { pencil: false, highlightedDigitMask: 0, digitHighlightMatch: 'all', onDigitHighlightMatchChange: fn() },
    tools: {
      togglePencil: fn(), colorMode: false, toggleColorMode: fn(), eraseMode: false, toggleEraseMode: fn(),
      highlightMode: false, toggleHighlightMode: fn(), chainDrawing: false, multi: false, toggleMulti: fn(),
    },
    layout: { advancedModes: DEFAULT_ADVANCED_MODES, compact: false, draft: false, disabled: false },
    mobile: false,
    showColorButton: true,
  },
  decorators: [(Story) => <Width><Story /></Width>],
  parameters: {
    docs: { description: { component: 'Keep core input modes in the primary action group. Conditional multi-digit, candidate painting, and color controls follow in the secondary group.' } },
  },
} satisfies Meta<typeof ControlModeActions>

export default meta
type Story = StoryObj<typeof meta>

export const CoreModes: Story = {}
export const MultipleDigits: Story = {
  args: {
    digits: { pencil: false, highlightedDigitMask: (1 << 4) | (1 << 7), digitHighlightMatch: 'all', onDigitHighlightMatchChange: fn() },
    tools: {
      togglePencil: fn(), colorMode: false, eraseMode: false, toggleEraseMode: fn(), highlightMode: false,
      toggleHighlightMode: fn(), chainDrawing: false, multi: false, toggleMulti: fn(),
      clearDigitHighlightsAvailable: true, onClearDigitHighlights: fn(),
    },
  },
}
export const MobileCandidatePaint: Story = {
  args: {
    layout: { advancedModes: DEFAULT_ADVANCED_MODES, compact: true, draft: false, disabled: false },
    tools: {
      togglePencil: fn(), colorMode: true, eraseMode: false, toggleEraseMode: fn(), highlightMode: false,
      toggleHighlightMode: fn(), chainDrawing: false, multi: false, toggleMulti: fn(),
      paintCandidateGroupAvailable: true, onPaintCandidateGroup: fn(),
    },
    showColorButton: false,
  },
}
