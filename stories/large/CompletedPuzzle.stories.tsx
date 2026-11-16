import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CompletedPuzzle } from '../../src/components/CompletedPuzzle'
import { quicker, solved } from '../support/fixtures'
import { Width } from '../support/frames'

const meta = {
  title: 'Large/Play/Completion results',
  component: CompletedPuzzle,
  args: { game: solved, games: [solved, quicker], preferredDifficulty: 'easy', ratingPending: false, shortcutEnabled: false,
    showGuides: true, onChooseDifficulty: fn() },
  decorators: [(Story) => <Width stage width={540}><Story /></Width>],
} satisfies Meta<typeof CompletedPuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const Rated: Story = {}
export const FirstSolve: Story = { args: { games: [solved], preferredDifficulty: 'medium' } }
export const RatingPending: Story = { args: { ratingPending: true, game: { ...solved, difficulty: undefined } } }
export const Unrated: Story = { args: { showGuides: false, game: { ...solved, difficulty: null } } }
