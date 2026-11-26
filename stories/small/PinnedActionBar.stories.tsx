import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CheckCheck, Link2, PencilLine } from 'lucide-react'
import { PinnedActionBar } from '../../src/components/PinnedActionBar'

const run = fn()
const meta = {
  title: 'Play/Pinned actions',
  component: PinnedActionBar,
  args: {
    actions: [
      { Icon: PencilLine, shortLabel: 'Candidates', command: { id: 'candidates', label: 'Generate candidates', available: true, run } },
      { Icon: CheckCheck, shortLabel: 'Singles', command: { id: 'singles', label: 'Solve singles', available: false, run } },
      { Icon: Link2, shortLabel: 'Chain', command: { id: 'chain', label: 'Chain mode', available: true, pressed: true, run } },
    ],
  },
  parameters: {
    docs: { description: { component: 'Pass resolved feature commands and the selected pinned IDs. This presenter owns only their compact button layout and leaves each action, enabled state, and pressed state with its feature.' } },
  },
} satisfies Meta<typeof PinnedActionBar>
export default meta

type Story = StoryObj<typeof meta>

export const MixedStates: Story = {}
export const Disabled: Story = { args: { disabled: true } }
