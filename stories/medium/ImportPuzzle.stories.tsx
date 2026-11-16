import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ImportPuzzle } from '../../src/components/PuzzleDialogs'
import { importExample, starter } from '../support/fixtures'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/Import puzzle',
  component: ImportPuzzle,
  tags: ['!autodocs'],
  args: { close: fn(), onImport: importExample },
  render: (args) => <DialogStory label="Import puzzle">{(close) =>
    <ImportPuzzle {...args} close={() => { args.close(); close() }} />
  }</DialogStory>,
} satisfies Meta<typeof ImportPuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {}
export const ReadyToImport: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Puzzle text or link' }), starter.givens)
  },
}
export const InvalidPuzzle: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Puzzle text or link' }), '1234')
    await userEvent.click((await canvas.findByRole('dialog')).querySelector('button[type=submit]')!)
    await expect(await canvas.findByRole('alert')).toBeVisible()
  },
}
