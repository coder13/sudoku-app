import type { Meta, StoryObj } from '@storybook/react-vite'
import { PuzzleHistoryActions } from '../../src/components/PuzzleHistoryActions'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Play/PuzzleHistoryActions',
  component: PuzzleHistoryActions,
  args: { undo: () => {}, redo: () => {}, canUndo: true, canRedo: false },
  decorators: [(Story) => <Width><Story /></Width>],
  render: args => <div className="side-actions left-actions" role="group" aria-label="Puzzle actions">
    <PuzzleHistoryActions {...args} />
  </div>,
} satisfies Meta<typeof PuzzleHistoryActions>
export default meta
type Story = StoryObj<typeof meta>

export const UndoAvailable: Story = {}
export const HistoryDisabled: Story = { args: { disabled: true } }
export const RedoAvailable: Story = { args: { canUndo: true, canRedo: true } }
