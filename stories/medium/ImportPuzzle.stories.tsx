import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ImportPuzzle } from '../../src/components/ImportPuzzle'
import antiSum from '../../tests/fixtures/sized-sudokupad-anti-sum.json'
import { starter } from '../support/fixtures'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/Import puzzle',
  component: ImportPuzzle,
  tags: ['!autodocs'],
  args: {
    close: fn(),
    onPlay: fn(),
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
    await expect(await canvas.findByRole('grid', { name: 'Puzzle preview' }, { timeout: 5000 })).toBeVisible()
    await expect(canvas.getByText('Difficulty', { exact: true })).toBeVisible()
    await expect(canvas.getByText('Score', { exact: true })).toBeVisible()
  },
}

export const JigsawAntiSumPreview: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(antiSum.url)
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview puzzle' }))
    await expect(await canvas.findByRole('grid', { name: '5 × 5 puzzle preview' })).toBeVisible()
    await expect(canvas.getByText('Digits in cells that share an edge cannot add to 9.')).toBeVisible()
    await expect(canvas.getByText('Digits strictly increase from the bulb to the tip of each thermometer.')).toBeVisible()
  },
}
