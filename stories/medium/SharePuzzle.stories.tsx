import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { SharePuzzle } from '../../src/components/PuzzleDialogs'
import { starter } from '../support/fixtures'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/Share puzzle',
  component: SharePuzzle,
  tags: ['!autodocs'],
  args: { game: starter, close: fn() },
  render: (args) => <DialogStory label="Share puzzle">{(close) =>
    <SharePuzzle {...args} close={() => { args.close(); close() }} />
  }</DialogStory>,
} satisfies Meta<typeof SharePuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const DefaultFormat: Story = {}
export const TextGrid: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.selectOptions(await canvas.findByLabelText('Format'), 'grid')
  },
}
export const AppLink: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.selectOptions(await canvas.findByLabelText('Format'), 'link')
  },
}
