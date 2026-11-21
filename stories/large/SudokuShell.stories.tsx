import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { kakuroCatalog } from '../../src/kakuro/catalog'
import { numberPositionKey } from '../../src/number-puzzles/generated-storage'
import { StartupProgress, SudokuShell } from '../../src/components/Workspace'
import { PreviewRouter } from '../support/frames'
import { namedDraft, quicker, solved, starter } from '../support/fixtures'
import { seedRoom } from '../support/story-room'

const meta = {
  title: 'Large/App/App shell',
  component: SudokuShell,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  args: { children: null },
  beforeEach: () => { seedRoom([starter, namedDraft, solved, quicker]) },
  render: () => <div className="story-app"><PreviewRouter shell /></div>,
} satisfies Meta<typeof SudokuShell>
export default meta
type Story = StoryObj<typeof meta>

export const Play: Story = {}
export const Loading: Story = {
  parameters: { docs: { description: { story: 'The loading line sits outside the header layout. The page stays blank until initial data is ready. A cached puzzle opens immediately, as in Play.' } } },
  render: () => <div className="story-app"><div className="app-shell standard-mode">
    <header className="topbar"><div className="topbar-inner"><span className="wordmark">Sudoku</span></div><StartupProgress /></header>
    <main className="page startup-loading" aria-label="Loading puzzles" aria-busy="true" />
  </div></div>,
}
export const Options: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open options menu' }))
    await expect(canvas.getByRole('button', { name: 'Settings' })).toBeVisible()
  },
}
export const Learn: Story = {
  render: () => <div className="story-app"><PreviewRouter path="/learn" shell /></div>,
}

export const ActivePuzzlePage: Story = {
  parameters: { docs: { description: { story: 'Show more puzzles adds 24 rows to the active list. Focus moves to the first new puzzle.' } } },
  beforeEach: () => {
    const games = Array.from({ length: 30 }, (_, index) => ({
      ...starter, id: `active-story-${index + 1}`, title: `Sudoku ${index + 1}`, created: index + 1,
    }))
    seedRoom(games)
    const { id, puzzle } = kakuroCatalog[0]
    const key = numberPositionKey('kakuro', id)
    const previous = localStorage.getItem(key)
    const firstEditable = puzzle.cells.indexOf(null)
    const values = puzzle.cells.map((_, cell) => cell === firstEditable ? 1 : 0)
    localStorage.setItem(key, JSON.stringify({ values, notes: values.map(() => 0), lastPlayed: 3000 }))
    return () => {
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
  },
  render: () => <div className="story-app"><PreviewRouter path="/puzzles/browse" shell /></div>,
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole('link', { name: 'Kakuro · Easy 1' })).toBeVisible()
    await expect(canvas.queryByRole('link', { name: /^Sudoku 7 / })).not.toBeInTheDocument()
    const more = canvas.getByRole('button', { name: 'Show more puzzles' })
    await waitFor(() => expect(more).not.toHaveAttribute('aria-disabled', 'true'))
    await userEvent.click(more)
    await waitFor(() => expect(canvas.getByRole('link', { name: /^Sudoku 7 / })).toHaveFocus())
  },
}
