import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../../src/components/Button'
import { ActionHistoryPanel } from '../../src/components/ActionHistoryPanel'
import { PuzzleCompletionView } from '../../src/components/PuzzleCompletionView'

const meta = {
  title: 'Large/Play/Completion view',
  component: PuzzleCompletionView,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PuzzleCompletionView>
export default meta

type Story = StoryObj<typeof meta>

export const Sudoku: Story = {
  args: {
    subtitle: 'Classic Sudoku',
    showGuides: true,
    results: [
      { label: 'Solve time', value: '08:42' },
      { label: 'Difficulty', value: 'Hard' },
      { label: 'Points per second', value: '1.86' },
      { label: 'Overall points per second', value: <>1.42<small>+0.04</small></> },
    ],
    stats: [
      { label: 'Puzzles solved', value: 18 },
      { label: 'Best hard time', value: '07:56' },
    ],
    details: <ActionHistoryPanel entries={[{
      id: 'placed', at: 0, lastAt: 0, elapsed: 522, kind: 'edit', technique: 'hidden-single',
      changes: [{ kind: 'entry', cell: 31, before: 0, after: 9 }],
    }]} />,
    actions: <div className="completion-footer"><div className="completion-actions">
      <Button variant="primary">Next puzzle</Button><Button>Choose difficulty</Button>
    </div></div>,
  },
}

export const NumberGame: Story = {
  args: {
    title: 'Puzzle complete',
    subtitle: 'Futoshiki · 5 × 5',
    showGuides: false,
    results: [{ label: 'Solve time', value: '03:18' }],
    stats: [{ label: 'Puzzles solved', value: 4 }],
    actions: <div className="completion-footer"><div className="completion-actions">
      <Button variant="primary">Play another</Button>
    </div></div>,
  },
}
