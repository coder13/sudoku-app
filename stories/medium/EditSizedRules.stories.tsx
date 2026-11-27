import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, within } from 'storybook/test'
import { EditSizedRules } from '../../src/components/EditSizedRules'
import { makeGame } from '../../src/sudoku/game'
import { MINI_GRID, rectangularGridForBoxRows } from '../../src/sudoku/grid'
import { detectPuzzle } from '../../src/sudoku/puzzle-import'
import doubledCluesCode from '../../tests/fixtures/sudokupad-double-clues.ctc?raw'
import productCageCode from '../../tests/fixtures/sudokupad-10k.scl?raw'

const xSum = { type: 'x-sum', direction: 'south', cells: [1, 5, 9, 13], sum: 6 } as const
const draft = makeGame('sized-x-sum-editor', 'Sized X-Sum draft', '0'.repeat(16), 'draft', 0, MINI_GRID)
const game = { ...draft, position: { ...draft.position, draftSizedRules: [xSum] } }

const meta = {
  title: 'Medium/Play/Sized rule editor',
  component: EditSizedRules,
  args: { game, layout: MINI_GRID, close: () => {} },
} satisfies Meta<typeof EditSizedRules>
export default meta
type Story = StoryObj<typeof meta>

export const EditOutsideXSum: Story = {
  play: async ({ canvas, userEvent }) => {
    const dialog = await canvas.findByRole('dialog', { name: 'Edit 4 × 4 rules' })
    const editor = within(dialog)
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Clue' }), '0')
    await expect(editor.getByRole('combobox', { name: 'Rule' })).toHaveValue('x-sum')
    await expect(editor.getByRole('combobox', { name: 'Viewing direction' })).toHaveValue('south')
    await expect(editor.getByRole('combobox', { name: 'Column' })).toHaveValue('1')
    await expect(editor.getByRole('spinbutton', { name: 'Outside total' })).toHaveValue(6)
    await expect(editor.getByRole('img', { name: /X-Sum/ }).querySelector('[data-outside-clue="x-sum"]')).toBeVisible()
  },
}

function DoubledClueGroupEditor() {
  const [value, setValue] = useState<{ game: ReturnType<typeof makeGame>; layout: ReturnType<typeof rectangularGridForBoxRows> }>()
  useEffect(() => {
    void detectPuzzle(doubledCluesCode.trim()).then(imported => {
      if (!imported.grid || !imported.sizedRules) return
      const layout = rectangularGridForBoxRows(6, 2)
      const draft = makeGame('sized-doubled-clue-editor', 'Doubled clue draft', '0'.repeat(36), 'draft', 0, layout)
      setValue({ game: { ...draft, position: { ...draft.position, draftSizedRules: imported.sizedRules } }, layout })
    })
  }, [])
  return value ? <EditSizedRules game={value.game} layout={value.layout} close={() => {}} /> : null
}

export const EditDoubledClueGroups: Story = {
  render: () => <DoubledClueGroupEditor />,
  play: async ({ canvas, userEvent }) => {
    const dialog = await canvas.findByRole('dialog', { name: 'Edit 6 × 6 rules' })
    const editor = within(dialog)
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Clue' }), '0')
    await expect(editor.getByText('Choose which clue interpretations are allowed. The solver checks each remaining choice against the grid.')).toBeVisible()
    const choices = within(editor.getByRole('group', { name: 'Allowed clue interpretations' })).getAllByRole('checkbox')
    await expect(choices).toHaveLength(2)
    const grid = editor.getByRole('grid', { name: 'Rule editor' })
    const cageTotal = grid.querySelector('.variant-cage-total')
    await expect(cageTotal).toBeVisible()
    await expect(cageTotal).toHaveTextContent('6')
    const choice = choices[0]
    await userEvent.click(choice)
    await expect(choice).not.toBeChecked()
    await userEvent.click(choice)
    await expect(choice).toBeChecked()
    await expect(editor.getByRole('button', { name: 'Save clue' })).toBeEnabled()
  },
}

function ProductCageRuleEditor() {
  const [value, setValue] = useState<{ game: ReturnType<typeof makeGame>; layout: ReturnType<typeof rectangularGridForBoxRows> }>()
  useEffect(() => {
    void detectPuzzle(productCageCode.trim()).then(imported => {
      if (!imported.grid || !imported.sizedRules) return
      const layout = rectangularGridForBoxRows(6, 2)
      const draft = makeGame('sized-product-cage-editor', '10K rule draft', '0'.repeat(36), 'draft', 0, layout)
      setValue({ game: { ...draft, position: { ...draft.position, draftSizedRules: imported.sizedRules } }, layout })
    })
  }, [])
  return value ? <EditSizedRules game={value.game} layout={value.layout} close={() => {}} /> : null
}

export const EditProductCageAndCornerCount: Story = {
  render: () => <ProductCageRuleEditor />,
  play: async ({ canvas, userEvent }) => {
    const dialog = await canvas.findByRole('dialog', { name: 'Edit 6 × 6 rules' })
    const editor = within(dialog)
    const clue = editor.getByRole('combobox', { name: 'Clue' })
    await userEvent.selectOptions(clue, '0')
    await expect(editor.getByRole('combobox', { name: 'Rule' })).toHaveValue('product-cage')
    await expect(editor.getByRole('spinbutton', { name: 'Product' })).toHaveValue(10_000)
    await userEvent.selectOptions(clue, '1')
    await expect(editor.getByRole('combobox', { name: 'Rule' })).toHaveValue('digit-count')
    await expect(editor.getByRole('combobox', { name: 'Digit to count' })).toHaveValue('3')
    await expect(editor.getByRole('spinbutton', { name: 'Minimum count' })).toHaveValue(1)
    await expect(editor.getByRole('button', { name: 'Save clue' })).toBeEnabled()
  },
}
