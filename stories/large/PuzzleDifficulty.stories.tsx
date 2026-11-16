import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PuzzleDifficulty } from '../../src/components/CompletedPuzzle'
import { Width } from '../support/frames'

const meta = {
  title: 'Large/Play/Difficulty choice',
  component: PuzzleDifficulty,
  args: { value: 'easy', showGuides: true, onChange: fn(), onBack: fn() },
  decorators: [(Story) => <Width stage width={540}><Story /></Width>],
} satisfies Meta<typeof PuzzleDifficulty>
export default meta
type Story = StoryObj<typeof meta>
export const Easy: Story = {}
export const Extreme: Story = { args: { value: 'extreme', showGuides: false } }
