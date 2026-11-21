import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { prepareImportedCalcudoku } from '../../src/calcudoku/imported'
import { CalcudokuPlay } from '../../src/components/Calcudoku'
import { calcudokuCatalog } from '../../src/calcudoku/catalog'
import { DifficultyOptions, PuzzleDifficultyStep } from '../../src/components/DifficultySelector'
import { FutoshikiDifficultyPage, FutoshikiPlay } from '../../src/components/Futoshiki'
import { KakuroDifficultyPage, KakuroPlay } from '../../src/components/Kakuro'
import { RulloPlay } from '../../src/components/Rullo'
import { futoshikiCatalog } from '../../src/futoshiki/catalog'
import { createImportedFutoshiki } from '../../src/futoshiki/imported'
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

export const MorePuzzlesInProgress: Story = {
  render: () => <PreviewRouter shell><KakuroDifficultyPage /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const saved = new Map(kakuroCatalog.map(({ id, puzzle }) => {
      const key = numberPositionKey('kakuro', id)
      const previous = localStorage.getItem(key)
      const first = puzzle.cells.indexOf(null)
      const values = puzzle.cells.map((_, index) => index === first ? 1 : 0)
      localStorage.setItem(key, JSON.stringify({ values, notes: values.map(() => 0) }))
      return [key, previous]
    }))
    return () => {
      for (const [key, previous] of saved) {
        if (previous === null) localStorage.removeItem(key)
        else localStorage.setItem(key, previous)
      }
    }
  },
  play: async ({ canvas, userEvent }) => {
    const resume = within(await canvas.findByRole('region', { name: 'In progress' }))
    await expect(resume.getAllByRole('link')).toHaveLength(24)
    const more = resume.getByRole('button', { name: 'Show more puzzles' })
    more.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(async () => {
      const links = resume.getAllByRole('link')
      await expect(links.length).toBeGreaterThanOrEqual(kakuroCatalog.length)
      await expect(links[24]).toHaveFocus()
    })
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

const futoshikiHard12 = futoshikiCatalog.find(entry => entry.id === 'hard-12')!
export const FutoshikiLineMatching: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={futoshikiHard12} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const key = numberPositionKey('futoshiki', futoshikiHard12.id)
    const previous = localStorage.getItem(key)
    localStorage.removeItem(key)
    return () => {
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Solution' }))
    const solution = within(await canvas.findByRole('tabpanel', { name: 'Solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(await solution.findByRole('button', { name: /Inequality line matching.*Place 1 in R4C4/ }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByText(/If R4C4 is 2, R3C3, R4C3, and R5C3 need 3 different digits/)).toBeVisible()
    const grid = within(canvas.getByRole('group', { name: 'Futoshiki solution' }))
    await expect(grid.getByRole('button', { name: /^R3C3,/ })).toHaveAttribute('data-context', 'true')
  },
}

const calcudokuWithInequalities = prepareImportedCalcudoku({
  size: 3, givens: '000100000', colors: [],
  cages: [{ label: '5+', cells: [0, 1], operator: 'add' }],
  inequalities: [{ less: 1, greater: 4 }],
})

export const CalcudokuWithInequalities: Story = {
  render: () => <PreviewRouter shell><CalcudokuPlay entry={calcudokuWithInequalities} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const key = numberPositionKey('calcudoku', calcudokuWithInequalities.id)
    const saved = new Map([key, key + '.paused'].map(name => [name, localStorage.getItem(name)]))
    for (const name of saved.keys()) localStorage.removeItem(name)
    return () => {
      for (const [name, value] of saved) {
        if (value === null) localStorage.removeItem(name)
        else localStorage.setItem(name, value)
      }
    }
  },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R1C2, empty, 5 plus cage .*R1C2 is less than R2C2$/ })
    await expect(canvas.getByRole('button', { name: /^R2C2, empty, R1C2 is less than R2C2$/ })).toBeVisible()
    await expect(cell.querySelector('[data-side="bottom"]')).toBeVisible()
    const actions = canvas.getByRole('button', { name: 'Actions' })
    await userEvent.click(cell)
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 3' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
    const check = within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    await expect(check.getByText('The highlighted entries conflict with the rules.')).toBeVisible()
    await expect(cell).toHaveAttribute('data-conflict', 'true')
    await userEvent.click(check.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))

    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Inequality' }))
    await expect(await canvas.findByRole('complementary', { name: 'Puzzle hint' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Solution' }))
    const solution = within(await canvas.findByRole('tabpanel', { name: 'Solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))
    const finalGrid = within(await canvas.findByRole('group', { name: 'Calcudoku solution' }))
    await expect(finalGrid.getByRole('button', { name: /^R1C2, 2,/ })).toBeVisible()
    await expect(finalGrid.getByRole('button', { name: /^R2C2, 3,/ })).toBeVisible()
  },
}

const adjacentCluePuzzle = createImportedFutoshiki(3, '100000000', [
  { less: 0, greater: 1 }, { less: 1, greater: 2 },
], {
  adjacentClues: { marks: [
    { type: 'difference', value: 1, cells: [0, 1] },
    { type: 'ratio', value: 2, cells: [0, 1] },
    { type: 'sum', value: 3, cells: [0, 1] },
    { type: 'sum', value: 3, cells: [0, 3] },
  ] },
})

export const AdjacentClueCombinations: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={adjacentCluePuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const key = numberPositionKey('futoshiki', adjacentCluePuzzle.id)
    const saved = new Map([key, key + '.paused'].map(name => [name, localStorage.getItem(name)]))
    for (const name of saved.keys()) localStorage.removeItem(name)
    return () => {
      for (const [name, value] of saved) {
        if (value === null) localStorage.removeItem(name)
        else localStorage.setItem(name, value)
      }
    }
  },
  play: async ({ canvas, userEvent }) => {
    const first = await canvas.findByRole('button', { name: /^R1C1, given 1, .*differ by 1.*1:2 ratio.*add up to 3/ })
    await expect(canvas.getByRole('button', { name: /^R1C2, empty, .*differ by 1.*1:2 ratio.*add up to 3/ })).toBeVisible()
    const edge = first.querySelector('[data-side="right"]')!
    await expect(edge).toBeVisible()
    await expect(edge).toHaveTextContent('<III')
    const marks = Array.from(edge.children, mark => mark.getBoundingClientRect())
    await expect(marks).toHaveLength(4)
    for (let index = 1; index < marks.length; index++) {
      await expect(marks[index].top).toBeGreaterThanOrEqual(marks[index - 1].bottom)
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Adjacent clues' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Adjacent clues' })).toBeVisible()
  },
}

const whispersCalcudoku = prepareImportedCalcudoku({
  size: 3, givens: '000000000', colors: [],
  cages: [{ label: '3+', cells: [0, 1], operator: 'add' }],
  inequalities: [{ less: 0, greater: 1 }],
  adjacentClues: { marks: [{ type: 'ratio', value: 2, cells: [0, 1] }] },
  whispers: [{ cells: [0, 1], minDifference: 1 }, { cells: [0, 6], minDifference: 2 }],
})

export const WhispersWithEdgeClues: Story = {
  render: () => <PreviewRouter shell><CalcudokuPlay entry={whispersCalcudoku} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const key = numberPositionKey('calcudoku', whispersCalcudoku.id)
    const saved = new Map([key, key + '.paused'].map(name => [name, localStorage.getItem(name)]))
    for (const name of saved.keys()) localStorage.removeItem(name)
    return () => {
      for (const [name, value] of saved) {
        if (value === null) localStorage.removeItem(name)
        else localStorage.setItem(name, value)
      }
    }
  },
  play: async ({ canvas, userEvent }) => {
    const first = await canvas.findByRole('button', { name: /^R1C1, empty, .*1:2 ratio.*Whispers line with R3C1, difference at least 2/ })
    const grid = await canvas.findByRole('group', { name: 'Calcudoku board' })
    const drawing = grid.querySelector('.number-puzzle-line-clues')!
    await expect(drawing).toHaveAttribute('viewBox', '0 0 3 3')
    await expect(drawing.querySelectorAll('.variant-whispers-label-leader')).toHaveLength(1)
    await expect(first.querySelector('.futoshiki-sign')).toBeVisible()
    await expect(first.querySelector('[data-kind="ratio"]')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Whispers' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Whispers' })).toBeVisible()
  },
}

const pathCluePuzzle = createImportedFutoshiki(3, '100000000', [], {
  pathClues: [
    { type: 'consecutive', cells: [1, 0, 2], segments: [[1, 0], [1, 2]] },
    { type: 'palindrome', cells: [1, 8, 3], segments: [[1, 8], [8, 3]] },
  ],
})

export const PalindromeAndConsecutiveLines: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={pathCluePuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R1C2, empty, .*Consecutive Line, next to R1C1.*Consecutive Line, next to R1C3.*Palindrome Line, same digit as R2C1/ })
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    await expect(grid.querySelectorAll('.variant-consecutive polyline')).toHaveLength(2)
    await expect(grid.querySelectorAll('.variant-palindrome polyline')).toHaveLength(2)
    await userEvent.click(cell)
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('button', { name: /^R2C2, empty/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Consecutive Line' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Consecutive Line' })).toBeVisible()
  },
}

const thermometerPuzzle = createImportedFutoshiki(3, '000000000', [{ less: 3, greater: 4 }], {
  pathClues: [
    { type: 'thermometer', cells: [0, 1, 2] },
    { type: 'thermometer', cells: [0, 3] },
  ],
})

export const ThermometersWithInequality: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={thermometerPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    const bulb = await canvas.findByRole('button', { name: /^R1C1, empty, Thermometer bulb.*less than R2C1/ })
    const tip = canvas.getByRole('button', { name: /^R1C3, empty, Thermometer tip.*greater than R1C2/ })
    await expect(tip).toBeVisible()
    await expect(grid.querySelectorAll('.variant-thermometer circle')).toHaveLength(2)
    await userEvent.click(bulb)
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('button', { name: /^R1C2, empty/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Thermometer' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Thermometer' })).toBeVisible()
  },
}

const arrowPuzzle = prepareImportedCalcudoku({
  size: 3, givens: '000000000', colors: [],
  cages: [{ label: '5+', cells: [3, 4], operator: 'add' }],
  pathClues: [{ type: 'arrow', cells: [2, 1, 0] }, { type: 'thermometer', cells: [0, 1] }],
})

export const ArrowWithThermometer: Story = {
  render: () => <PreviewRouter shell><CalcudokuPlay entry={arrowPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Calcudoku board' })
    const bulb = await canvas.findByRole('button', { name: /^R1C3, empty, Arrow bulb, sum of R1C2, R1C1/ })
    const path = grid.querySelector('.variant-arrow-line')!
    const marker = grid.querySelector('defs > marker')!
    await expect(path).toHaveAttribute('marker-end', `url(#${marker.id})`)
    await expect(grid.querySelector('.variant-thermometer')).toBeVisible()
    await userEvent.click(bulb)
    await userEvent.keyboard('{ArrowLeft}')
    await expect(canvas.getByRole('button', { name: /^R1C2, empty, .*Arrow with its bulb at R1C3/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: /^Arrow$/ }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: /^Arrow$/ })).toBeVisible()
  },
}

const renbanPuzzle = createImportedFutoshiki(3, '100000000', [{ less: 1, greater: 2 }], {
  pathClues: [{ type: 'renban', cells: [1, 0, 4], segments: [[1, 0], [0, 4]] }],
})

export const RenbanWithInequality: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={renbanPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    const cell = await canvas.findByRole('button', { name: /^R1C2, empty, .*Renban line of 3 consecutive digits/ })
    await expect(grid.querySelectorAll('.variant-renban polyline')).toHaveLength(2)
    await userEvent.click(cell)
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('button', { name: /^R2C2, empty, Renban line of 3 consecutive digits/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Renban' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Renban' })).toBeVisible()
  },
}

const lockoutPuzzle = createImportedFutoshiki(6, '023056034061345612056023061034612345', [{ less: 6, greater: 7 }], {
  pathClues: [{ type: 'lockout', cells: [19, 20, 21] }, { type: 'lockout', cells: [14, 15, 21] }],
})

export const LockoutWithInequality: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={lockoutPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    const diamond = await canvas.findByRole('button', { name: /^R4C4, empty, Lockout diamond/ })
    await expect(grid.querySelectorAll('.variant-lockout polyline')).toHaveLength(2)
    await expect(grid.querySelectorAll('.variant-lockout-endpoints path')).toHaveLength(3)
    await userEvent.click(diamond)
    await userEvent.keyboard('{ArrowLeft}')
    await expect(canvas.getByRole('button', { name: /^R4C3, .*Lockout Line, digit below both or above both diamonds/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Lockout Line' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Lockout Line' })).toBeVisible()
  },
}

const betweenPuzzle = createImportedFutoshiki(6, '023056034061345612056023061034612345', [{ less: 6, greater: 7 }], {
  pathClues: [{ type: 'between', cells: [2, 3, 4] }, { type: 'between', cells: [2, 1, 0] }],
})

export const BetweenWithInequality: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={betweenPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    const circle = await canvas.findByRole('button', { name: /^R1C3, .*Between Line end circle/ })
    await expect(grid.querySelectorAll('.variant-between polyline')).toHaveLength(2)
    await expect(grid.querySelectorAll('.variant-between-endpoints circle')).toHaveLength(3)
    await userEvent.click(circle)
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('button', { name: /^R1C4, empty, Between Line, digit strictly between/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Between Line' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Between Line' })).toBeVisible()
  },
}

const regionPuzzle = createImportedFutoshiki(4, '0034341200434321', [], {
  extraRegions: [[0, 4, 5, 7], [0, 7]],
})

export const OverlappingExtraRegions: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={regionPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    const cell = within(grid).getByRole('button', { name: /^R1C1, empty, Extra region 1, Extra region 2$/ })
    await expect(grid.querySelectorAll('.variant-extra-region path')).toHaveLength(2)
    await expect(grid.querySelectorAll('.variant-extra-region rect')).toHaveLength(0)
    await userEvent.click(cell)
    await userEvent.keyboard('{ArrowRight}')
    await expect(within(grid).getByRole('button', { name: /^R1C2, empty$/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(cell).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 2' }))
    const actions = canvas.getByRole('button', { name: 'Actions' })
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
    const check = within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    await expect(check.getByText('The highlighted entries conflict with the rules.')).toBeVisible()
    await userEvent.click(check.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Extra region' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Extra region' })).toBeVisible()
    await userEvent.click(hint.getByRole('button', { name: 'Close hint' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Solution' }))
    const solution = within(await canvas.findByRole('tabpanel', { name: 'Solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))
    const final = await canvas.findByRole('group', { name: 'Futoshiki solution' })
    await expect(final.querySelectorAll('.variant-extra-region path')).toHaveLength(2)
    await expect(within(final).getByRole('button', { name: /^R1C1, 1, Extra region 1, Extra region 2$/ })).toBeVisible()
  },
}

const globalEntropyPuzzle = createImportedFutoshiki(9,
  '623597184748216953915483267369145728804072516402058671186724395571639842257861439',
  [], { globalEntropy: true })

export const GlobalEntropy: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={globalEntropyPuzzle} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = await canvas.findByRole('group', { name: 'Futoshiki board' })
    const cell = within(grid).getByRole('button', { name: /^R5C2, empty$/ })
    const actions = canvas.getByRole('button', { name: 'Actions' })
    await expect(grid).not.toHaveAttribute('data-line-clues')
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'How to play' }))
    const rules = within(await canvas.findByRole('dialog', { name: 'Futoshiki rules' }))
    await expect(rules.getByText(/^Every 2 × 2 area contains a low digit/)).toBeVisible()
    await userEvent.click(rules.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(cell)
    await userEvent.keyboard('9')
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
    const result = within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    await expect(result.getByText('The highlighted entries conflict with the rules.')).toBeVisible()
    await expect(grid.querySelector('[data-cell="37"]')).toHaveAttribute('data-conflict', 'true')
    await userEvent.click(result.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))

    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Techniques' }))
    const techniques = within(await canvas.findByRole('tabpanel', { name: 'Techniques' }))
    await userEvent.click(await techniques.findByRole('button', { name: 'Global Entropy' }))
    const hint = within(await canvas.findByRole('complementary', { name: 'Puzzle hint' }))
    await expect(hint.getByRole('heading', { name: 'Global Entropy' })).toBeVisible()
    for (let stage = 0; stage < 3; stage++) await userEvent.click(hint.getByRole('button', { name: 'More detail' }))
    await expect(hint.getByText(/The 2 × 2 area from R4C2 to R5C3 needs a low, a medium, and a high digit/)).toBeVisible()
    await expect(grid.querySelector('[data-cell="29"]')).toHaveAttribute('data-context', 'true')
    await userEvent.click(hint.getByRole('button', { name: 'Close hint' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Solution' }))
    const solution = within(await canvas.findByRole('tabpanel', { name: 'Solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))
    const final = within(await canvas.findByRole('group', { name: 'Futoshiki solution' }))
    await expect(final.getByRole('button', { name: /^R5C2, 3$/ })).toBeVisible()
  },
}

const importedFutoshiki = createImportedFutoshiki(4, '0034234134124123', [{ less: 0, greater: 1 }], {
  position: {
    values: [1, ...Array<number>(15).fill(0)],
    notes: [0, 6, ...Array<number>(14).fill(0)],
    cornerNotes: [0, 10, ...Array<number>(14).fill(0)],
  },
  annotations: {
    givenColors: { 0: ['green'] },
    cellColors: { 0: ['blue', 'orange'] },
    candidateColors: { 1: { 2: 'blueHeavy' } },
    drawings: [{ shape: 'circle', at: [1.5, 1.5], color: 'blue' }],
  },
})

export const ImportedCandidatePositions: Story = {
  render: () => <PreviewRouter shell><FutoshikiPlay entry={importedFutoshiki} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const key = numberPositionKey('futoshiki', importedFutoshiki.id)
    const saved = localStorage.getItem(key)
    localStorage.removeItem(key)
    return () => {
      if (saved === null) localStorage.removeItem(key)
      else localStorage.setItem(key, saved)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const cellName = /^R1C2, center notes 2, 3, corner notes 2, 4, R1C1 is less than R1C2, Candidate 2 deep blue$/
    const cell = await canvas.findByRole('button', { name: cellName })
    await userEvent.click(cell)
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    const positions = within(canvas.getByRole('group', { name: 'Candidate position' }))
    await expect(positions.getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(positions.getByRole('button', { name: 'Corner' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 4' }))
    await expect(cell).toHaveAccessibleName(/^R1C2, center notes 2, 3, corner notes 2, R1C1 is less than R1C2, Candidate 2 deep blue$/)
    const drawing = canvas.getByRole('img', { name: 'Imported Quick Draw annotations' })
    const colored = canvas.getByRole('button', { name: /^R1C1, 1, .*blue, orange$/ })
    await expect(drawing).toHaveAttribute('viewBox', '0 0 4 4')
    await expect(colored).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Clear imported annotations' }))
    await expect(canvas.getByRole('button', { name: /^R1C1, 1, .*green$/ })).toBeVisible()
    await expect(drawing).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(colored).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Imported Quick Draw annotations' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Redo' }))
    await expect(canvas.queryByRole('img', { name: 'Imported Quick Draw annotations' })).not.toBeInTheDocument()
  },
}
