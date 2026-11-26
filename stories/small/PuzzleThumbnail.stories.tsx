import type { Meta, StoryObj } from '@storybook/react-vite'
import { PuzzleThumbnail } from '../../src/components/PuzzleThumbnail'

const meta = {
  title: 'Design system/Puzzle thumbnail',
  component: PuzzleThumbnail,
  args: { values: '530070000600195000098000060800060003400803001700020006060000280000419005000080079' },
  parameters: {
    docs: { description: { component: 'Use PuzzleThumbnail for compact puzzle previews in links and lists. Pass the puzzle values and grid size so smaller variants use the same shared layout.' } },
  },
} satisfies Meta<typeof PuzzleThumbnail>
export default meta

type Story = StoryObj<typeof meta>

export const Classic: Story = {}
export const Mini: Story = {
  args: { values: '1030002400000031', size: 4 },
}
export const SixBySix: Story = {
  args: { values: '100000020000003000000400000050000006', size: 6 },
}
