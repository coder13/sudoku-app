import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ImportPuzzle } from '../../src/components/ImportPuzzle'
import { detectPuzzle } from '../../src/sudoku/puzzle-import'
import { makeGame } from '../../src/sudoku/game'
import { starter } from '../support/fixtures'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/Import puzzle',
  component: ImportPuzzle,
  tags: ['!autodocs'],
  args: {
    close: fn(),
    onPlay: fn(),
    onPreview: async (input) => {
      const { givens, format } = await detectPuzzle(input)
      return { format, game: makeGame('preview', 'Imported puzzle', givens, 'imported') }
    },
  },
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

export const Preview: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Puzzle text or link' }), starter.givens)
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview puzzle' }))
    await expect(await canvas.findByRole('grid', { name: 'Puzzle preview' })).toBeVisible()
  },
}
