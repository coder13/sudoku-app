import type { Meta, StoryObj } from '@storybook/react-vite'
import { FoundationVisual } from '../../src/components/FoundationVisual'
import { LessonFrame } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Foundation visual',
  component: FoundationVisual,
  args: { visual: 'chain-walk' },
  decorators: [(Story) => <LessonFrame><Story /></LessonFrame>],
} satisfies Meta<typeof FoundationVisual>
export default meta
type Story = StoryObj<typeof meta>

export const Chain: Story = {}
export const StrongLink: Story = { args: { visual: 'strong-link' } }
export const WeakLink: Story = { args: { visual: 'weak-link' } }
export const GroupedLink: Story = { args: { visual: 'grouped-link' } }
export const NestedProof: Story = { args: { visual: 'nested-branches' } }
