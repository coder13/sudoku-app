import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CheckCheck, PencilLine } from 'lucide-react'
import { ActionMenuItem } from '../../src/components/ActionMenuItem'
import { Width } from '../support/frames'

const run = fn()
const meta = {
  title: 'Small/Play/Action menu item',
  component: ActionMenuItem,
  args: {
    command: { id: 'candidates', label: 'Generate candidates', available: true, shortcut: 'G', run },
    Icon: PencilLine,
    showShortcut: true,
  },
  decorators: [(Story) => <Width><div className="app-menu"><Story /></div></Width>],
  parameters: {
    docs: { description: { component: 'Present one feature-owned UiCommand in an action menu. The command supplies its label, availability, pressed state, shortcut, and callback; the menu item supplies consistent native button semantics and icon layout.' } },
  },
} satisfies Meta<typeof ActionMenuItem>
export default meta

type Story = StoryObj<typeof meta>

export const WithShortcut: Story = {}
export const Unavailable: Story = { args: { command: { id: 'singles', label: 'Solve singles', available: false, run }, Icon: CheckCheck } }
export const Pressed: Story = { args: { command: { id: 'chains', label: 'Chain mode', available: true, pressed: true, run }, Icon: CheckCheck, showShortcut: false } }
export const AccessibleNameOverride: Story = {
  args: { command: { id: 'solution', label: 'Solution', available: true, run }, Icon: PencilLine, ariaLabel: 'Open solution panel' },
}
