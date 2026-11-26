import type { Meta, StoryObj } from '@storybook/react-vite'
import { PuzzleDetails } from '../../src/components/PuzzleDetails'

const meta = {
  title: 'Play/Puzzle details',
  component: PuzzleDetails,
  args: {
    items: [
      { label: 'Puzzle', value: 'Mini Sudoku' },
      { label: 'Status', value: 'In progress' },
      { label: 'Difficulty', value: 'Gentle' },
      { label: 'Givens', value: 8 },
      { label: 'Placed digits', value: 4 },
      { label: 'Candidates', value: 21 },
      { label: 'Undo steps', value: 3 },
    ],
  },
} satisfies Meta<typeof PuzzleDetails>
export default meta

type Story = StoryObj<typeof meta>

export const Standard: Story = {}
export const Compact: Story = {
  args: { items: [{ label: 'Puzzle', value: 'Windoku' }, { label: 'Status', value: 'Not started' }, { label: 'Givens', value: 30 }] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
