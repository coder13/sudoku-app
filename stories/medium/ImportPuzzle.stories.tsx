import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ImportPuzzle } from '../../src/components/ImportPuzzle'
import diamonds from '../../tests/fixtures/sized-sudokupad-row-column-sum.json'
import antiSum from '../../tests/fixtures/sized-sudokupad-anti-sum.json'
import whispers from '../../tests/fixtures/whispers-coach.json'
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

export const CoachProgressPreview: Story = {
  play: async ({ canvas, userEvent }) => {
    const code = 'SCv7_32_f2ecr3md1b130444rtisubacfqdv8q3t0efq140g2p58bdiaa5u7eiaq7i4iegbn5qts6b7jrkkkq72efi5t9uka29fu6u74oj5kob8p0kq00o01s56ttf6rdqrrik0qe1881i21b7eeogsmk0b1sa4f1pk3olbkj7hv8ag06iv3kuq12u3q3qu7o2gluoh9lapqpavhlvdci3v7uk6rgd7mqtu1vi0v9v53auc5'
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(code)
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview puzzle' }))
    const grid = await canvas.findByRole('grid', { name: 'Puzzle preview' })
    await expect(grid.querySelector('[data-cell="2"]')).toHaveAccessibleName(/Row 1, column 3, digit 4/)
    await expect(grid.querySelector('[data-cell="3"]')).toHaveAccessibleName(/corner candidates 8.*center candidates 2 6/)
    await expect(canvas.getByRole('button', { name: 'Open puzzle' })).toBeVisible()
  },
}

export const CoachWhispersGuidePreview: Story = {
  play: async ({ canvas, userEvent }) => {
    const lesson = whispers.examples.find(source => source.url.endsWith('/B5mt'))!
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(lesson.code)
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview puzzle' }))
    const grid = await canvas.findByRole('grid', { name: 'Puzzle preview' })
    await expect(grid.querySelector('[data-cell="11"]')).toHaveAccessibleName(/Whispers neighbors need at least 4 distinct digits/)
    await expect(canvas.getByRole('list', { name: 'Whispers neighbors' })).toBeVisible()
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

export const JigsawDiamondPreview: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(diamonds.url)
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview puzzle' }))
    const grid = await canvas.findByRole('grid', { name: '5 × 5 puzzle preview' })
    await expect(grid).toBeVisible()
    await expect(grid.querySelector('[data-cell="22"]')).toHaveAccessibleName(/sum diamond.*total 5/)
    await expect(canvas.getByText(/At least one edge without a diamond/)).toBeVisible()
  },
}
