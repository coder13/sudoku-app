import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PlayActionsButton } from '../../src/components/PlayActionsButton'

const meta = {
  title: 'Small/PlayActionsButton',
  component: PlayActionsButton,
  args: { mobile: false, open: false, onClick: fn() },
} satisfies Meta<typeof PlayActionsButton>
export default meta
type Story = StoryObj<typeof meta>

export const Desktop: Story = {}
export const Mobile: Story = { args: { mobile: true } }
export const Open: Story = { args: { open: true } }
