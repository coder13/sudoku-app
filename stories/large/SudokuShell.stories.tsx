import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
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
