import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { ImportPuzzle } from '../../src/components/ImportPuzzle'
import calcudokuCoach from '../../tests/fixtures/calcudoku-coach.json'
import modularCoach from '../../tests/fixtures/modular-coach.json'
import nonConBento from '../../tests/fixtures/coach-boxless-noncon-bento.json'
import kingX from '../../tests/fixtures/coach-boxless-king-x.json'
import futoshikiCoach from '../../tests/fixtures/futoshiki-coach.json'
import diamonds from '../../tests/fixtures/sized-sudokupad-row-column-sum.json'
import antiSum from '../../tests/fixtures/sized-sudokupad-anti-sum.json'
import whispers from '../../tests/fixtures/whispers-coach.json'
import { starter } from '../support/fixtures'
import { DialogStory, PreviewRouter } from '../support/frames'

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
    await expect(await canvas.findByText('Difficulty', { exact: true }, { timeout: 5000 })).toBeVisible()
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
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: 'Open puzzle' })).toBeEnabled()
    }, { timeout: 5000 })
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

export const FutoshikiPreview: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: args => <PreviewRouter shell><ImportPuzzle {...args} fullPage /></PreviewRouter>,
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(futoshikiCoach.fourByFour.code)
    const preview = await canvas.findByRole('button', { name: 'Preview puzzle' })
    preview.focus()
    await userEvent.keyboard('{Enter}')
    const board = await canvas.findByRole('group', { name: 'Futoshiki puzzle preview' })
    await expect(board.querySelector('[data-cell="0"]')).toHaveAccessibleName(/R1C2 is less than R1C1/)
    await expect(board.querySelector('[data-cell="6"]')).toHaveAccessibleName(/given 1/)
    await expect(canvas.getByRole('link', { name: 'Start playing' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to puzzle input' }))
    await expect(await canvas.findByRole('textbox', { name: 'Puzzle text or link' })).toHaveValue(futoshikiCoach.fourByFour.code)
  },
}

export const CalcudokuPreview: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: args => <PreviewRouter shell><ImportPuzzle {...args} fullPage /></PreviewRouter>,
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(calcudokuCoach.code)
    await userEvent.click(canvas.getByRole('button', { name: 'Preview puzzle' }))
    const operation = await canvas.findByRole('combobox', { name: '6 cage at R2C3' })
    const check = canvas.getByRole('button', { name: 'Check puzzle' })
    await expect(check).toBeDisabled()
    await userEvent.selectOptions(operation, 'multiply')
    check.focus()
    await userEvent.keyboard('{Enter}')
    const board = await canvas.findByRole('group', { name: 'Calcudoku puzzle preview' })
    await expect(board.querySelector('[data-cell="0"]')).toHaveAccessibleName(/6 times cage at R1C1, green/)
    await expect(board.querySelector('[data-cell="34"]')).toHaveAccessibleName(/given 4/)
    await expect(canvas.getByText('The 6 cage at R2C3 uses multiplication.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Start playing' })).toBeVisible()
  },
}


export const BoxlessKingXPreview: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: args => <PreviewRouter shell><ImportPuzzle {...args} fullPage /></PreviewRouter>,
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(kingX.code)
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview puzzle' }))
    const board = await canvas.findByRole('group', { name: 'Futoshiki puzzle preview' })
    await expect(board.querySelectorAll('.variant-diagonal')).toHaveLength(2)
    await expect(board.querySelector('[data-cell="40"]')).toHaveAccessibleName(/top-left to bottom-right diagonal.*top-right to bottom-left diagonal/)
    await expect(board.querySelector('[data-cell="77"]')).toHaveAccessibleName(/odd circle/)
    await expect(canvas.getByText('Cells that touch at a corner must have different digits.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Start playing' })).toBeVisible()
  },
}


export const BoxlessModularLinesPreview: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: args => <PreviewRouter shell><ImportPuzzle {...args} fullPage /></PreviewRouter>,
  play: async ({ canvas, userEvent }) => {
    const source = modularCoach.examples.find(example => example.url.endsWith('/7hzU'))!
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(source.code)
    const preview = await canvas.findByRole('button', { name: 'Preview puzzle' })
    preview.focus()
    await userEvent.keyboard('{Enter}')
    const board = await canvas.findByRole('group', { name: 'Futoshiki puzzle preview' })
    const modular = board.querySelectorAll('.variant-modular polyline')
    const entropic = board.querySelectorAll('.variant-entropic polyline')
    await expect(modular).toHaveLength(2)
    await expect(entropic).toHaveLength(4)
    await expect(parseFloat(getComputedStyle(modular[0]).strokeWidth))
      .toBeGreaterThan(parseFloat(getComputedStyle(entropic[0]).strokeWidth))
    await expect(board.querySelector('[data-cell="0"]')).toHaveAccessibleName(/Modular Line 1.*Entropic Line 1/)
    await expect(canvas.getByText('The groups are {1, 4}, {2, 5}, {3}.', { exact: false })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Start playing' })).toBeVisible()
  },
}

export const BoxlessMinimumAndNonConsecutivePreview: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: args => <PreviewRouter shell><ImportPuzzle {...args} fullPage /></PreviewRouter>,
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('textbox', { name: 'Puzzle text or link' })
    await userEvent.click(input)
    await userEvent.paste(nonConBento.code)
    const preview = await canvas.findByRole('button', { name: 'Preview puzzle' })
    preview.focus()
    await userEvent.keyboard('{Enter}')
    const grid = await canvas.findByRole('group', { name: 'Calcudoku puzzle preview' })
    const minimum = grid.querySelectorAll('.variant-minimum [data-min-max-cell]')
    await expect(minimum).toHaveLength(2)
    await expect(grid.querySelector('[data-cell="60"]')).toHaveAccessibleName(/Minimum cell, smaller than R6C7, R7C6, R7C8, R8C7/)
    await expect(grid.querySelector('[data-cell="2"]')).toHaveAccessibleName(/R1C3 and R2C3 differ by 1/)
    await expect(canvas.getByText(/A white dot for a difference of 1 is an exception/)).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Start playing' })).toBeVisible()
  },
}
