import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CompletedPuzzle } from '../../src/components/CompletedPuzzle'
import { calculatePlayerRating, initialPlayerRating } from '../../src/sudoku/player-rating'
import { quicker, solved } from '../support/fixtures'
import { Width } from '../support/frames'
import { seedPlayerRating } from '../support/story-room'

const meta = {
  title: 'Large/Play/Completion results',
  component: CompletedPuzzle,
  args: { game: solved, games: [solved, quicker], preferredDifficulty: 'easy', ratingPending: false, shortcutEnabled: false,
    showGuides: true, onChooseDifficulty: fn(), onChooseVariant: fn() },
  decorators: [(Story) => <Width stage width={540}><Story /></Width>],
} satisfies Meta<typeof CompletedPuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const Rated: Story = {}
export const RatedWithHints: Story = {
  beforeEach: () => {
    seedPlayerRating(calculatePlayerRating([{
      id: 'rated-solve', gameId: solved.id, givens: solved.givens, difficulty: 'easy', at: 1,
      finish: 'solved', viewed: 46, applied: 46, elapsed: solved.elapsed,
    }]))
    return () => seedPlayerRating(initialPlayerRating)
  },
}
export const FirstSolve: Story = { args: { games: [solved], preferredDifficulty: 'medium' } }
export const RatingPending: Story = { args: { ratingPending: true, game: { ...solved, difficulty: undefined } } }
export const Unrated: Story = { args: { showGuides: false, game: { ...solved, difficulty: null } } }
