import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { DifficultyOptions, PuzzleDifficultyStep } from '../../src/components/DifficultySelector'
import { KakuroPlay } from '../../src/components/Kakuro'
import { RulloPlay } from '../../src/components/Rullo'
import { kakuroCatalog } from '../../src/kakuro/catalog'
import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from '../../src/number-puzzles/catalog'
import { rulloCatalog } from '../../src/rullo/catalog'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Medium/Puzzles/Number puzzle',
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const LoadingDifficultyResults: Story = {
  render: function LoadingResults() {
    const [difficulty, setDifficulty] = useState<NumberPuzzleDifficulty>('easy')
    return <main className="puzzles-page puzzles-difficulty-page">
      <h1 id="puzzles-page-title">Choose difficulty</h1>
      <PuzzleDifficultyStep name="Calcudoku" preview={null} startLabel={`Start ${difficulty} puzzle`} onStart={() => {}}>
        <DifficultyOptions levels={numberPuzzleDifficulties} selected={difficulty} onChange={setDifficulty} statistics={null} />
      </PuzzleDifficultyStep>
    </main>
  },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByLabelText('Easy results')).toHaveAttribute('aria-busy', 'true')
    await expect(canvas.getByRole('button', { name: 'Start easy puzzle' })).toBeEnabled()
    const increase = canvas.getByRole('button', { name: 'Increase difficulty' })
    await userEvent.click(increase)
    await expect(canvas.getByRole('button', { name: 'Start medium puzzle' })).toBeEnabled()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(canvas.getByRole('button', { name: 'Start easy puzzle' })).toBeEnabled()
  },
}

export const Kakuro: Story = {
  render: () => <PreviewRouter shell><KakuroPlay entry={kakuroCatalog[0]} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R2C3,/ })
    const actions = canvas.getByRole('button', { name: 'Actions' })
    await userEvent.click(cell)
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 9' }))
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect(cell).toHaveAccessibleName(/^R2C3, empty/)
    await expect(canvas.getByRole('button', { name: 'Redo' })).toBeEnabled()
    await userEvent.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}')
    await expect(cell).toHaveAccessibleName(/^R2C3, 9/)
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
    const check = within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    await expect(check.getByText('The highlighted clues cannot fit these entries.')).toBeVisible()
    await userEvent.click(check.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const finder = within(await canvas.findByRole('dialog', { name: 'Techniques' }))
    await userEvent.click(await finder.findByRole('button', { name: 'Crossing run sums' }))
    await expect(await canvas.findByRole('complementary', { name: 'Puzzle hint' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Open solution panel' }))
    const solution = within(await canvas.findByRole('dialog', { name: 'Solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Next step' }))
    await expect(solution.getByRole('button', { name: /^R4C2, 3/ })).toBeVisible()
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))
    await userEvent.click(solution.getByRole('button', { name: 'Close dialog' }))
    await expect(cell).toHaveAccessibleName(/^R2C3, empty/)
  },
}

export const Rullo: Story = {
  render: () => <PreviewRouter shell><RulloPlay entry={rulloCatalog[0]} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R1C1,/ })
    const grid = canvas.getByRole('group', { name: 'Rullo board' })
    await expect(grid.querySelectorAll('.rullo-target')).toHaveLength(20)
    await expect(canvas.queryByRole('button', { name: /^Keep$/ })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-pressed', 'false')
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard(' ')
    await expect(cell).toHaveAttribute('aria-pressed', 'false')
    await userEvent.keyboard('{Enter}')
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Show choice' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Show location' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Show explanation' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Apply hint' }))
    await expect(cell).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
  },
}
