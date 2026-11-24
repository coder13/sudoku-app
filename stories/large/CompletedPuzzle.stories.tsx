import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CompletedPuzzle } from '../../src/components/CompletedPuzzle'
import { ActionHistoryPanel } from '../../src/components/ActionHistoryPanel'
import { fillEntries, makeGame, type Game } from '../../src/sudoku/game'
import { MINI_GRID } from '../../src/sudoku/grid'
import { calculatePlayerRating, initialPlayerRating } from '../../src/sudoku/player-rating'
import { inProgress, quicker, solved } from '../support/fixtures'
import { PreviewRouter, Width } from '../support/frames'
import { seedPlayerRating, seedRoom } from '../support/story-room'

const meta = {
  title: 'Large/Play/Completion results',
  component: CompletedPuzzle,
  args: { game: solved, games: [solved, quicker], preferredDifficulty: 'easy', ratingPending: false, shortcutEnabled: false,
    showGuides: true, onResumePuzzle: fn(), onChooseDifficulty: fn(), onChooseVariant: fn() },
  decorators: [(Story, { parameters }) => parameters.layout === 'fullscreen' ? <Story /> : <Width stage width={540}><Story /></Width>],
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
const practiceSolved: Game = {
  ...fillEntries(makeGame('story-practice-solved', 'WXYZ-Wing practice',
    '217693458050000963693548127502004019070905042040032576005006200000050700001000605', 'generated'),
  '217693458854127963693548127582764319376915842149832576735486291968251734421379685'),
  difficulty: 'very-hard', score: 520, elapsed: 151, practiceTechnique: 'wxyz-wing',
  actionHistory: [{
    id: 'wing', at: 1, lastAt: 1, elapsed: 134, kind: 'edit', technique: 'wxyz-wing',
    changes: [{ kind: 'candidate', cell: 38, digit: 8, added: false }],
  }],
}
export const PracticePlaylist: Story = {
  args: { game: practiceSolved, games: [practiceSolved], cellReferenceStyle: 'concise' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const frame = canvas.getByRole('region', { name: 'Puzzle solved' })
    const height = frame.getBoundingClientRect().height
    await expect(canvas.getByRole('status')).toHaveTextContent('WXYZ-Wing found')
    await expect(canvas.getByText('You removed 8 from r5c3.')).toBeVisible()
    await userEvent.click(canvas.getByText('Action history'))
    await expect(frame.getBoundingClientRect().height).toBe(height)
    await expect(canvas.getByRole('button', { name: 'Next practice puzzle' })).toBeVisible()
  },
}
const practiceWithHint: Game = {
  ...practiceSolved,
  actionHistory: practiceSolved.actionHistory?.map(entry => ({ ...entry, kind: 'hint' })),
}
export const PracticeWithHint: Story = { args: { game: practiceWithHint, games: [practiceWithHint] } }
const miniSolved: Game = {
  ...fillEntries(makeGame('mini-solved', 'Mini Sudoku', '0234341221434321', 'generated', 0, MINI_GRID), '1234341221434321'),
  elapsed: 94, difficulty: 'easy',
}
export const NextActivePuzzle: Story = {
  parameters: { layout: 'fullscreen' },
  beforeEach: ({ args }) => seedRoom([...args.games, ...activePlaylist], args.game.id),
  render: ({ game }) => <div className="story-app"><PreviewRouter shell path={`/?puzzle=${encodeURIComponent(game.id)}`} /></div>,
}
export const NextActivePuzzleOnMobile: Story = {
  ...NextActivePuzzle,
  args: { game: miniSolved, games: [miniSolved] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
export const RatingPending: Story = { args: { ratingPending: true, game: { ...solved, difficulty: undefined } } }
export const Unrated: Story = { args: { showGuides: false, game: { ...solved, difficulty: null } } }

const recentActive: Game = { ...inProgress, id: 'playlist-medium', title: 'Medium puzzle', source: 'generated', difficulty: 'medium', score: 428, created: 2 }
const olderActive: Game = { ...makeGame('playlist-easy', 'Easy puzzle', quicker.givens, 'generated', 1), difficulty: 'easy' }
const activePlaylist = [olderActive, recentActive]

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
