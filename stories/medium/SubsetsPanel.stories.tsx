import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import { SubsetsPanel } from '../../src/components/SubsetsPanel'
import { useSubsets } from '../../src/components/useSubsets'
import { CLASSIC_GRID } from '../../src/sudoku/grid'
import { Width } from '../support/frames'

const masks = [0b0111, 0b1011, 0b1100, 0b1100, ...Array<number>(77).fill(0)]
const values = '0'.repeat(81)

function SubsetsExample({ unavailable, initialSelection = [] }: { unavailable?: string; initialSelection?: number[] }) {
  const [selected, setSelected] = useState(initialSelection)
  const tool = useSubsets(unavailable ? null : masks, selected, values, CLASSIC_GRID)
  return <div className="puzzle-stage">
    <Board givens={values} values={values} candidates={masks} annotations={tool.annotations} showGuides
      selected={tool.cells} highlighting={{ relatedCells: false, matchingDigits: false, matchingCandidates: false, candidateStyle: 'cell' }}
      onCell={unavailable ? undefined : (cell) => {
        setSelected((current) => current.includes(cell) ? current.filter((item) => item !== cell) : [...current, cell])
      }} />
    <SubsetsPanel count={tool.cells.length} digits={tool.digits} unavailable={unavailable} onClear={() => setSelected([])} />
  </div>
}

const meta = {
  title: 'Medium/Play/Subsets',
  component: SubsetsExample,
  decorators: [(Story) => <Width stage width={340}><Story /></Width>],
} satisfies Meta<typeof SubsetsExample>
export default meta
type Story = StoryObj<typeof meta>

export const CompareOneCell: Story = { args: { initialSelection: [0] } }
export const CompareMultipleCells: Story = { args: { initialSelection: [0, 1] } }
export const LoadingCandidates: Story = { args: { unavailable: 'Loading candidates…' } }
