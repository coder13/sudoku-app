import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import { conflictsOf, enter, paintCandidates, valuesOf } from '../../src/sudoku/game'
import { MINI_GRID } from '../../src/sudoku/grid'
import { lessonDiagram, lessonValues } from '../../src/sudoku/lesson-diagram'
import { inProgress, lessonExamples, starter } from '../support/fixtures'
import { LessonFrame, Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Sudoku grid',
  component: Board,
  decorators: [(Story) => <Width stage width={530}><Story /></Width>],
  args: { givens: starter.givens, values: starter.givens, showGuides: true },
} satisfies Meta<typeof Board>
export default meta
type Story = StoryObj<typeof meta>

export const ReadOnly: Story = {}
export const MiniSudoku: Story = {
  args: { grid: MINI_GRID, givens: '0234341221434321', values: '0234341221434321',
    candidates: [1, ...Array<number>(15).fill(0)], selected: [0] },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
export const SixWithCombinedRules: Story = {
  args: {
    grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: '0'.repeat(36), values: '0'.repeat(36),
    sizedRules: [
      { type: 'diagonal', diagonal: 'main' },
      { type: 'parity', parity: 'even', cells: [3, 15] },
      { type: 'parity', parity: 'odd', cells: [25] },
      { type: 'renban', cells: [20, 13, 19] },
      { type: 'arrow', circle: 30, cells: [24, 25] },
      { type: 'region-sum', cells: [7, 13, 20] },
      { type: 'thermometer', cells: [12, 13, 20, 27] },
      { type: 'difference', cells: [13, 19], difference: 2 },
      { type: 'difference', cells: [8, 9], difference: 1 },
      { type: 'kropki', consecutive: { pairs: [[8, 9]] }, ratioTwo: { pairs: [[8, 9]] } },
    ],
    selected: [20], candidates: Array.from({ length: 36 }, (_, cell) => cell === 20 ? 0b101000 : 0),
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const SevenJigsawThermometer: Story = {
  args: {
    grid: {
      size: 7,
      regions: Array.from({ length: 7 }, (_, region) => [...'0000111020011122233312223434555343456664445556666']
        .flatMap((label, cell) => Number(label) === region ? [cell] : [])),
    },
    givens: '0'.repeat(49), values: '0'.repeat(49),
    sizedRules: [{ type: 'thermometer', cells: [8, 16, 24] }],
    selected: [24], candidates: Array.from({ length: 49 }, (_, cell) => cell === 24 ? 0b1100000 : 0),
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const MiniRenbanLine: Story = {
  args: {
    grid: MINI_GRID, givens: '1000000000000000', values: '1000000000000000',
    sizedRules: [{ type: 'renban', cells: [0, 1, 5], segments: [[0, 1], [1, 5]] }],
    selected: [5],
  },
  decorators: [(Story) => <Width width={290}><Story /></Width>],
}
export const MiniKropkiDots: Story = {
  args: {
    grid: MINI_GRID, givens: '1000000000000000', values: '1000000000000000',
    sizedRules: [{ type: 'kropki', consecutive: { pairs: [[0, 1], [6, 10]] }, ratioTwo: { pairs: [[0, 1], [2, 6]] } }],
    selected: [1], active: 1,
  },
  decorators: [(Story) => <Width width={290}><Story /></Width>],
}
export const AlgebraicCageCaptions: Story = {
  args: {
    grid: MINI_GRID, givens: '0'.repeat(16), values: '0'.repeat(16),
    algebraicCages: [
      { type: 'algebraic-cage', cells: [4, 5], label: 'n+2', total: { type: 'variable', name: 'n', offset: 2 } },
      { type: 'algebraic-cage', cells: [8], label: 'n-1', total: { type: 'variable', name: 'n', offset: -1 } },
    ],
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
export const WithoutGuides: Story = { args: { showGuides: false } }
export const CellSelection: Story = { render: (args) => <SelectableGrid {...args} /> }
const candidateExample = enter(enter(inProgress, [3, 5], 'center', 6), [2, 5], 'color', 4)
export const CandidatesAndColor: Story = {
  args: {
    values: valuesOf(inProgress),
    position: paintCandidates(candidateExample, [{ cell: 5, digit: 2, color: 2 }, { cell: 5, digit: 6, color: 5 }]).position,
    candidateLayout: 'center-corner',
    selected: [3, 5],
    highlightedDigit: 2,
  },
}
export const ConflictingDigits: Story = {
  render: (args) => {
    const values = valuesOf(enter(starter, [2], 'value', 5))
    return <Board {...args} values={values} errors={conflictsOf(values)} />
  },
}
export const CroppedChain: Story = {
  render: (args) => {
    const example = lessonExamples['xy-chain']
    const { annotations, region } = lessonDiagram(example)
    return <LessonFrame><Board {...args} givens={example.givens} values={lessonValues(example)}
      candidates={example.candidates} annotations={annotations} region={region} /></LessonFrame>
  },
}

function SelectableGrid(props: ComponentProps<typeof Board>) {
  const [selected, setSelected] = useState(2)
  return <Board {...props} active={selected} selected={[selected]} onCell={setSelected} />
}
