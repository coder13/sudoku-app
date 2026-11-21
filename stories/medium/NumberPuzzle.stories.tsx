import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { CalcudokuPlay } from '../../src/components/Calcudoku'
import { calcudokuCatalog } from '../../src/calcudoku/catalog'
import { DifficultyOptions, PuzzleDifficultyStep } from '../../src/components/DifficultySelector'
import { FutoshikiDifficultyPage } from '../../src/components/Futoshiki'
import { KakuroPlay } from '../../src/components/Kakuro'
import { RulloPlay } from '../../src/components/Rullo'
import { futoshikiCatalog } from '../../src/futoshiki/catalog'
import { kakuroCatalog } from '../../src/kakuro/catalog'
import { solveLatin } from '../../src/latin/engine'
import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from '../../src/number-puzzles/catalog'
import { numberPositionKey } from '../../src/number-puzzles/generated-storage'
import { rulloCatalog } from '../../src/rullo/catalog'
import { REMOVE, solveRullo } from '../../src/rullo/engine'
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

export const SavedDifficultyResults: Story = {
  render: () => <PreviewRouter shell><FutoshikiDifficultyPage /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const entries = futoshikiCatalog.filter(entry => entry.difficulty === 'easy')
    const previous = new Map(entries.map((entry, index) => {
      const key = numberPositionKey('futoshiki', entry.id)
      const saved = localStorage.getItem(key)
      if (index > 1) {
        localStorage.removeItem(key)
        return [key, saved]
      }
      const { puzzle } = entry
      const values = solveLatin(puzzle).solution!.map((digit, cell) => puzzle.givens[cell] ? 0 : digit)
      localStorage.setItem(key, JSON.stringify({
        values, notes: values.map(() => 0), clock: index === 0 ? { elapsed: 42, finished: true } : undefined,
      }))
      return [key, saved]
    }))
    const difficultyKey = 'futoshiki.difficulty.v1'
    previous.set(difficultyKey, localStorage.getItem(difficultyKey))
    localStorage.setItem(difficultyKey, 'easy')
    return () => {
      for (const [key, saved] of previous) {
        if (saved === null) localStorage.removeItem(key)
        else localStorage.setItem(key, saved)
      }
    }
  },
  play: async ({ canvas, userEvent }) => {
    const easy = within(await canvas.findByLabelText('Easy results'))
    await expect(easy.getByText('2')).toBeVisible()
    await expect(easy.getByText('00:42')).toBeVisible()
    const increase = canvas.getByRole('button', { name: 'Increase difficulty' })
    await userEvent.click(increase)
    await userEvent.keyboard('{ArrowLeft}')
    await expect(canvas.getByLabelText('Easy results')).toBeVisible()
  },
}

export const Kakuro: Story = {
  render: () => <PreviewRouter shell><KakuroPlay entry={kakuroCatalog[0]} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R2C3,/ })
    const actions = canvas.getByRole('button', { name: 'Actions' })
    await userEvent.click(cell)
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('button', { name: /^R2C4,/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(cell).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 9' }))
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect(cell).toHaveAccessibleName(/^R2C3, empty/)
    await expect(canvas.getByRole('button', { name: 'Redo' })).toBeEnabled()
    await userEvent.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}')
    await expect(cell).toHaveAccessibleName(/^R2C3, 9/)
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
    const conflictHint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(conflictHint.getByRole('heading', { name: 'Hint unavailable' })).toBeVisible()
    await expect(conflictHint.getByText('Resolve the highlighted clues first.')).toBeVisible()
    await expect(conflictHint.queryByRole('button', { name: 'Apply hint' })).toBeNull()
    cell.focus()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('complementary', { name: 'Puzzle hint' })).toBeNull()
    await expect(actions).toHaveFocus()

    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
    const check = within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    await expect(check.getByText('The highlighted clues cannot fit these entries.')).toBeVisible()
    await userEvent.click(check.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const tabs = within(await canvas.findByRole('tablist', { name: 'Kakuro input' }))
    const techniquesTab = tabs.getByRole('tab', { name: 'Techniques' })
    const finder = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await finder.findByRole('button', { name: 'Crossing run sums' }))
    await expect(await canvas.findByRole('complementary', { name: 'Puzzle hint' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await expect(techniquesTab).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Input tools' }))
    const tools = within(await canvas.findByRole('group', { name: 'Input tools' }))
    await userEvent.click(tools.getByRole('button', { name: 'Solution' }))
    await userEvent.keyboard('{Escape}')

    const solutionTab = tabs.getByRole('tab', { name: 'Solution' })
    const solution = within(await canvas.findByRole('tabpanel', { name: 'Solution' }))
    await expect(solution.queryByRole('list', { name: 'Solving steps' })).not.toBeInTheDocument()
    cell.focus()
    await userEvent.keyboard('9')
    await expect(cell).toHaveAccessibleName(/^R2C3, 9/)
    await userEvent.click(solution.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Next step' }))
    const preview = within(canvas.getByRole('group', { name: 'Kakuro solution' }))
    await expect(preview.getByRole('button', { name: /^R4C2, 3/ })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await expect(solutionTab).toHaveFocus()
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))

    solutionTab.focus()
    await userEvent.keyboard('{ArrowLeft}')
    const digitsTab = tabs.getByRole('tab', { name: 'Digits' })
    await expect(digitsTab).toHaveFocus()
    await expect(cell).toHaveAccessibleName(/^R2C3, 9/)
    await userEvent.keyboard('{ArrowRight}')
    await expect(solution.getByRole('button', { name: 'Final grid' })).toHaveAttribute('aria-current', 'step')
    await userEvent.click(canvas.getByRole('button', { name: 'Close solution panel' }))
    await expect(digitsTab).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Close techniques panel' }))
    await expect(actions).toHaveFocus()
  },
}

export const DesktopInsights: Story = {
  render: () => <PreviewRouter shell><CalcudokuPlay entry={calcudokuCatalog[0]} /></PreviewRouter>,
  beforeEach: () => {
    const key = numberPositionKey('calcudoku', calcudokuCatalog[0].id)
    const saved = localStorage.getItem(key)
    localStorage.removeItem(key)
    return () => {
      if (saved === null) localStorage.removeItem(key)
      else localStorage.setItem(key, saved)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const actions = await canvas.findByRole('button', { name: 'Actions' })
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    await expect(actions).toHaveAttribute('aria-expanded', 'false')
    const table = within(await canvas.findByRole('table', { name: 'Available placements by technique' }))
    await userEvent.click(table.getByRole('button', { name: 'Row and column' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Solution' }))
    await expect(actions).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.getByRole('tab', { name: 'Techniques' })).toBeVisible()
    const solutionTab = canvas.getByRole('tab', { name: 'Solution' })
    await expect(solutionTab).toHaveAttribute('aria-selected', 'true')
    canvas.getByRole('button', { name: 'Reveal solution' }).focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(canvas.getByRole('button', { name: 'Next step' }))
    canvas.getByRole('button', { name: 'Close hint' }).focus()
    await userEvent.keyboard('{Enter}')
    await expect(solutionTab).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Close solution tab' }))
    await expect(canvas.getByRole('tab', { name: 'Techniques' })).toHaveAttribute('aria-selected', 'true')
    await expect(actions).toHaveFocus()
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
    const more = await canvas.findByRole('button', { name: 'More detail' })
    for (let stage = 0; stage < 3; stage++) await userEvent.click(more)
    await userEvent.click(canvas.getByRole('button', { name: 'Apply hint' }))
    await expect(cell).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
  },
}

export const SolvedRulloReview: Story = {
  render: () => <PreviewRouter shell><RulloPlay entry={rulloCatalog[0]} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const entry = rulloCatalog[0]
    const key = numberPositionKey('rullo', entry.id)
    const saved = localStorage.getItem(key)
    // R1C1 is the last number left to remove. The board reserves an extra cell for each row target.
    const { width, height } = entry.puzzle
    const { solution } = solveRullo(entry.puzzle)
    const values = Array.from({ length: (width + 1) * (height + 1) }, () => 0)
    solution!.forEach((choice, cell) => {
      if (cell && choice === REMOVE) values[cell + Math.floor(cell / width)] = REMOVE
    })
    localStorage.setItem(key, JSON.stringify({ values, notes: values.map(() => 0) }))
    return () => {
      if (saved === null) localStorage.removeItem(key)
      else localStorage.setItem(key, saved)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R1C1,/ })
    await userEvent.click(cell)
    await expect(await canvas.findByText('Puzzle solved.')).toBeVisible()

    const actions = canvas.getByRole('button', { name: 'Actions' })
    const openPanel = async (name: 'Solution' | 'Techniques') => {
      await userEvent.click(actions)
      await userEvent.click(await canvas.findByRole('button', { name }))
      return within(await canvas.findByRole('tabpanel', { name }))
    }

    const solution = await openPanel('Solution')
    await expect(canvas.getByRole('group', { name: 'Rullo board' })).toBeVisible()
    await userEvent.click(solution.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))
    const preview = within(canvas.getByRole('group', { name: 'Rullo solution' }))
    const previewCell = preview.getByRole('button', { name: /^R1C1,/ })
    await expect(previewCell).toHaveAttribute('data-choice', String(REMOVE))
    await expect(previewCell).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Close solution panel' }))
    await expect(actions).toHaveFocus()

    const reopened = await openPanel('Solution')
    await expect(reopened.queryByRole('list', { name: 'Solving steps' })).not.toBeInTheDocument()
    await userEvent.click(reopened.getByRole('button', { name: 'Reveal solution' }))
    await expect(reopened.getByRole('button', { name: 'Final grid' })).toHaveAttribute('aria-current', 'step')
    await expect(canvas.queryByRole('complementary', { name: 'Puzzle hint' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Close solution panel' }))

    const techniques = await openPanel('Techniques')
    await expect(techniques.queryByRole('button', { name: 'Line sum' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Close techniques panel' }))
    const live = within(canvas.getByRole('group', { name: 'Rullo board' }))
    await expect(live.getByRole('button', { name: /^R1C1,/ })).toHaveAttribute('data-choice', String(REMOVE))
    await expect(canvas.getByText('Puzzle solved.')).toBeVisible()
  },
}

export const RulloCheck: Story = {
  render: () => <PreviewRouter shell><RulloPlay entry={rulloCatalog.find(entry => entry.id === 'easy-1')!} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const key = numberPositionKey('rullo', 'easy-1')
    const saved = localStorage.getItem(key)
    localStorage.removeItem(key)
    return () => {
      if (saved === null) localStorage.removeItem(key)
      else localStorage.setItem(key, saved)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R2C1,/ })
    const actions = canvas.getByRole('button', { name: 'Actions' })
    const check = async () => {
      await userEvent.click(actions)
      await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
      return within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    }

    const message = 'The highlighted choices cannot fit the solution.'
    await userEvent.click(cell)
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const panel = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await expect(panel.getByRole('alert')).toHaveTextContent(message)
    await expect(cell).toHaveAttribute('data-conflict', 'true')
    cell.focus()
    await userEvent.keyboard(' ')
    await expect(await panel.findByRole('table', { name: 'Available choices by technique' })).toBeVisible()
    await expect(cell).toHaveAttribute('data-conflict', 'false')
    await userEvent.click(canvas.getByRole('tab', { name: 'Controls' }))

    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-pressed', 'false')
    const wrong = await check()
    await expect(wrong.getByText(message)).toBeVisible()
    wrong.getByRole('button', { name: 'Close dialog' }).focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Puzzle check' })).toBeNull())
    await expect(actions).toHaveFocus()
    await expect(cell).toHaveAccessibleName(/conflict$/)
    await expect(cell).toHaveAttribute('data-conflict', 'true')

    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Hint unavailable' })).toBeVisible()
    await expect(hint.getByText(message)).toBeVisible()
    await expect(hint.queryByRole('button', { name: 'Apply hint' })).toBeNull()
    await expect(cell).toHaveAttribute('data-conflict', 'true')
    cell.focus()
    await userEvent.keyboard(' ')
    await expect(canvas.queryByRole('complementary', { name: 'Puzzle hint' })).toBeNull()
    await expect(cell).toHaveAttribute('data-conflict', 'false')
    await expect(cell).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(canvas.getByRole('button', { name: /^R1C1,/ }))
    const correct = await check()
    await expect(correct.getByText('Your choices fit the solution so far.')).toBeVisible()
    await userEvent.click(correct.getByRole('button', { name: 'Close dialog' }))
    await waitFor(() => expect(actions).toHaveFocus())
  },
}
