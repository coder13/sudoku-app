import type { Meta, StoryObj } from '@storybook/react-vite'
import { PuzzleRowContent } from '../../src/components/PuzzleRowContent'

const meta = {
  title: 'Puzzles/Puzzle row content',
  component: PuzzleRowContent,
  args: {
    values: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    title: 'Classic Sudoku',
    detail: 'Easy · 12:34',
  },
  parameters: {
    docs: { description: { component: 'Compose the same puzzle summary under the native link or button that owns navigation or selection. Pass the grid size and optional trailing control independently.' } },
  },
} satisfies Meta<typeof PuzzleRowContent>
export default meta

type Story = StoryObj<typeof meta>

export const Selectable: Story = {
  render: args => <button className="game-row" style={{ width: 340 }}><PuzzleRowContent {...args} /></button>,
}
export const Navigable: Story = {
  args: { title: 'Mini Sudoku', values: '1030002400000031', size: 4, detail: 'In progress' },
  render: args => <a className="game-row" style={{ width: 340 }} href="/puzzles"><PuzzleRowContent {...args} /></a>,
}
