import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import { conflictsOf, enter, valuesOf } from '../../src/sudoku/game'
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
export const WithoutGuides: Story = { args: { showGuides: false } }
export const CellSelection: Story = { render: (args) => <SelectableGrid {...args} /> }
export const CandidatesAndColor: Story = {
  args: {
    values: valuesOf(inProgress),
    position: enter(enter(inProgress, [3, 5], 'center', 6), [2, 5], 'color', 4).position,
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
