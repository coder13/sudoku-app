import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { CompletedPuzzle } from '../../src/components/CompletedPuzzle'
import { ActionHistoryPanel } from '../../src/components/ActionHistoryPanel'
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
export const ActionHistory: Story = {
  render: () => <section className="board-frame completion-frame guides-hidden"><div className="completion">
    <ActionHistoryPanel entries={[
      { id: 'candidates', at: 0, lastAt: 0, elapsed: 0, kind: 'candidates',
        changes: Array.from({ length: 81 }, (_, cell) => ({ kind: 'candidate', cell, digit: 3, added: true })) },
      { id: 'first', at: 1000, lastAt: 1000, elapsed: 12, kind: 'edit', technique: 'hidden-single',
        changes: [{ kind: 'entry', cell: 4, before: 0, after: 5 }] },
      { id: 'grouped', at: 2000, lastAt: 3500, elapsed: 24, kind: 'edit', technique: 'locked-pair',
        changes: [{ kind: 'candidate', cell: 20, digit: 3, added: false }, { kind: 'candidate', cell: 21, digit: 3, added: false }] },
      { id: 'hint', at: 4000, lastAt: 4000, elapsed: 45, kind: 'hint', technique: 'x-wing',
        changes: [{ kind: 'candidate', cell: 36, digit: 7, added: false }] },
      { id: 'singles', at: 4500, lastAt: 4500, elapsed: 60, kind: 'singles',
        changes: Array.from({ length: 12 }, (_, cell) => ({ kind: 'entry', cell, before: 0, after: cell % 9 + 1 })) },
      { id: 'unknown', at: 5000, lastAt: 5000, elapsed: 70, kind: 'edit', technique: null,
        changes: [{ kind: 'candidate', cell: 15, digit: 2, added: false }] },
    ]} />
  </div></section>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Action history'))
  },
}
