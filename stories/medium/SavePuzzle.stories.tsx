import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SavePuzzle } from '../../src/components/PuzzleDialogs'
import { conflictDraft, draft, namedDraft } from '../support/fixtures'
import { DialogStory } from '../support/frames'
import { seedRoom } from '../support/story-room'

const meta = {
  title: 'Medium/Dialogs/Save puzzle',
  component: SavePuzzle,
  tags: ['!autodocs'],
  args: { game: draft, close: fn() },
  beforeEach: ({ args }) => { seedRoom([args.game]) },
  render: (args) => <DialogStory label="Save puzzle">{(close) =>
    <SavePuzzle {...args} close={() => { args.close(); close() }} />
  }</DialogStory>,
} satisfies Meta<typeof SavePuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const Untitled: Story = {}
export const NamedDraft: Story = { args: { game: namedDraft } }
export const ConflictingGivens: Story = {
  args: { game: { ...conflictDraft, title: 'Tuesday draft' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Save and play' }))
    await expect(await canvas.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent('Resolve the highlighted conflicts first.')
  },
}
