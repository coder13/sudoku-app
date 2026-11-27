import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { DifficultyOptions, PuzzleDifficultyStep } from '../../src/components/DifficultySelector'
import { CalcudokuImportPreview } from '../../src/components/Calcudoku'
import { FutoshikiDifficultyPage, FutoshikiImportPreview } from '../../src/components/Futoshiki'
import { NumberPuzzleGrid as NumberPuzzleGridView } from '../../src/components/NumberPuzzleGrid'
import { NumberPuzzlePreview as NumberPuzzlePreviewView } from '../../src/components/NumberPuzzlePreview'
import { KakuroPlay } from '../../src/components/Kakuro'
import { RulloPlay } from '../../src/components/Rullo'
import { futoshikiCatalog } from '../../src/futoshiki/catalog'
import { createImportedFutoshiki } from '../../src/futoshiki/imported'
import { createImportedCalcudoku } from '../../src/calcudoku/imported'
import { kakuroCatalog } from '../../src/kakuro/catalog'
import { checkLatin, solveLatin, type LatinPuzzle } from '../../src/latin/engine'
import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from '../../src/number-puzzles/catalog'
import { emptyNumberPosition } from '../../src/number-puzzles/progress'
import { numberPositionKey } from '../../src/number-puzzles/generated-storage'
import { rulloCatalog } from '../../src/rullo/catalog'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Medium/Puzzles/Number puzzle',
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const sampleNumberBoard = {
  width: 4,
  height: 4,
  maxValue: 4,
  cells: Array.from({ length: 16 }, (_, index) => ({
    given: [0, 3, 6, 9, 12, 15].includes(index) ? (index % 4) + 1 : undefined,
    label: index === 1 ? 'Odd' : undefined,
    endpoint: index === 5,
    edges: index % 4 === 3 ? 'right' : undefined,
  })),
  check: () => ({ complete: false, marked: [] }),
  hints: () => [],
  solve: () => null,
}

export const NumberPuzzleGrid: Story = {
  render: function GridRenderer() {
    const [position, setPosition] = useState(() => emptyNumberPosition(sampleNumberBoard.cells.length))
    const [selection, setSelection] = useState(1)
    return <div className="number-puzzle-board-card surface" style={{ maxWidth: 480, margin: '2rem auto', padding: 24 }}>
      <NumberPuzzleGridView content={{ board: sampleNumberBoard, game: 'futoshiki', name: 'Futoshiki' }}
        appearance={{ values: position.values, notes: position.notes, conflicts: new Set() }}
        interaction={{ selection, locked: false, onCellFocus: setSelection,
          onCellClick: index => setSelection(index), onCellRef: () => {} }} />
    </div>
  },
}

export const NumberPuzzleGridReadOnly: Story = {
  render: () => <div className="number-puzzle-board-card surface" style={{ maxWidth: 480, margin: '2rem auto', padding: 24 }}>
    <NumberPuzzleGridView content={{ board: sampleNumberBoard, game: 'futoshiki', name: 'Futoshiki' }}
      appearance={{
        values: [1, 0, 3, 0, 0, 2, 0, 4, 2, 0, 4, 0, 0, 4, 0, 1],
        highlightedCell: 5,
        contextCells: new Set([1, 5, 9]),
      }} ariaLabel="Futoshiki solution" />
  </div>,
}

export const NumberPuzzlePreview: Story = {
  render: () => {
    const position = emptyNumberPosition(sampleNumberBoard.cells.length)
    position.values[1] = 3
    position.notes[2] = (1 << 0) | (1 << 2)
    return <div className="number-puzzle-board-card surface" style={{ maxWidth: 480, margin: '2rem auto', padding: 24 }}>
      <NumberPuzzlePreviewView board={sampleNumberBoard} game="futoshiki" label="Futoshiki preview" position={position} />
    </div>
  },
}

export const ImportedParityPreview: Story = {
  render: () => <div className="import-preview">
    <FutoshikiImportPreview entry={createImportedFutoshiki(4, '0000000000000000', [
      { less: 0, greater: 1 }, { less: 7, greater: 11 },
    ], [{ cell: 0, parity: 'odd' }, { cell: 10, parity: 'even' }])} />
  </div>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

const ratioPreviewRules = {
  layers: [
    { relation: 'consecutive' as const, pairs: [[0, 1], [10, 11]] as const, negative: false },
    { relation: 'ratioTwo' as const, pairs: [[3, 7], [8, 12]] as const, negative: false },
    { relation: 'difference' as const, pairs: [{ cells: [0, 4] as const, value: 2 }], negative: false },
    { relation: 'ratio' as const, pairs: [{ cells: [0, 4] as const, value: 3 }], negative: false },
  ],
}
function checkedRatioPreviewSolution(puzzle: LatinPuzzle) {
  const solution = solveLatin(puzzle).solution
  if (!solution || !checkLatin(puzzle, solution).complete) throw new Error('The numbered Kropki preview needs a valid finished solution.')
  return solution
}
const unfinishedRatioFutoshiki = createImportedFutoshiki(4, '0'.repeat(16), [], [], undefined, { kropki: ratioPreviewRules })
const ratioSolution = checkedRatioPreviewSolution(unfinishedRatioFutoshiki.puzzle)
const finishedRatioFutoshiki = createImportedFutoshiki(4, '0'.repeat(16), [], [], {
  values: ratioSolution, notes: Array(16).fill(0),
}, { kropki: ratioPreviewRules })

export const ImportedFutoshikiKropki: Story = {
  render: () => <div className="import-preview" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24, maxWidth: 480, marginInline: 'auto' }}>
    <section><h2>Unfinished</h2><FutoshikiImportPreview entry={unfinishedRatioFutoshiki} /></section>
    <section><h2>Finished</h2><FutoshikiImportPreview entry={finishedRatioFutoshiki} /></section>
  </div>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('img', { name: /(?:White|Black) dot on the/ })).toHaveLength(8)
    await expect(canvas.getAllByRole('img', { name: /White dot on the right edge requires consecutive digits/ })).toHaveLength(4)
    await expect(canvas.getAllByRole('img', { name: /Black dot on the bottom edge requires digits in a 1:2 ratio/ })).toHaveLength(4)
    await expect(canvas.getAllByRole('img', { name: /Difference 2 on the bottom edge requires digits separated by 2/ })).toHaveLength(2)
    await expect(canvas.getAllByRole('img', { name: /Ratio 1:3 on the bottom edge requires digits in a 1:3 ratio/ })).toHaveLength(2)
    const offsets = [...canvasElement.querySelectorAll('.number-puzzle-kropki[data-edge-offset]')]
      .map(marker => Number(marker.getAttribute('data-edge-offset')))
    await expect(offsets.filter(offset => offset !== 0)).toHaveLength(8)
    await expect(canvas.getAllByText(/^[1-4]$/, { selector: '.number-puzzle-cell' })).toHaveLength(16)
  },
}

const ratioPreviewCages = Array.from({ length: 4 }, (_, row) => ({
  target: 10, operator: 'add' as const, distinct: true as const,
  cells: Array.from({ length: 4 }, (_, column) => row * 4 + column),
}))
const unfinishedRatioCalcudoku = createImportedCalcudoku(4, '0'.repeat(16), ratioPreviewCages, [], undefined,
  { kropki: ratioPreviewRules })
const calcudokuRatioSolution = checkedRatioPreviewSolution(unfinishedRatioCalcudoku.puzzle)
const finishedRatioCalcudoku = createImportedCalcudoku(4, '0'.repeat(16), ratioPreviewCages, [], {
  values: calcudokuRatioSolution, notes: Array(16).fill(0),
}, { kropki: ratioPreviewRules })

export const ImportedCalcudokuKropki: Story = {
  render: () => <div className="import-preview" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24, maxWidth: 480, marginInline: 'auto' }}>
    <section><h2>Unfinished</h2><CalcudokuImportPreview entry={unfinishedRatioCalcudoku} /></section>
    <section><h2>Finished</h2><CalcudokuImportPreview entry={finishedRatioCalcudoku} /></section>
  </div>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('img', { name: /(?:White|Black) dot on the/ })).toHaveLength(8)
    await expect(canvas.getAllByRole('img', { name: /Difference 2 on the bottom edge requires digits separated by 2/ })).toHaveLength(2)
    await expect(canvas.getAllByRole('img', { name: /Ratio 1:3 on the bottom edge requires digits in a 1:3 ratio/ })).toHaveLength(2)
    const offsets = [...canvasElement.querySelectorAll('.number-puzzle-kropki[data-edge-key="0:4"]')]
      .map(marker => Number(marker.getAttribute('data-edge-offset')))
    await expect(offsets).toHaveLength(8)
    await expect(Math.min(...offsets)).toBeGreaterThan(0)
    await expect(new Set(offsets).size).toBe(2)
    await expect(canvas.getAllByText(/^[1-4]$/, { selector: '.number-puzzle-cell' })).toHaveLength(16)
  },
}

export const ImportedCoachColorsPreview: Story = {
  render: () => <div className="import-preview">
    <FutoshikiImportPreview entry={createImportedFutoshiki(4, '1234341221434321', [], [], undefined, {
      givenCellColors: { 0: ['red'], 1: ['blue', 'yellow'], 6: ['limeHeavy'] },
    })} />
  </div>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

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

export const KakuroDesktopActions: Story = {
  render: () => <PreviewRouter shell><KakuroPlay entry={kakuroCatalog[0]} /></PreviewRouter>,
  globals: { viewport: { value: 'shortDesktop', isRotated: false } },
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
