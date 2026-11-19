import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import { SubsetsPanel } from '../../src/components/SubsetsPanel'
import { useSubsets } from '../../src/components/useSubsets'
import { CLASSIC_GRID } from '../../src/sudoku/grid'
import { Width } from '../support/frames'

const masks = [0b0111, 0b1011, 0b1100, 0b1100, ...Array<number>(77).fill(0)]
const values = '0'.repeat(81)

function SubsetsExample({ unavailable }: { unavailable?: string }) {
  const tool = useSubsets(unavailable ? null : masks, CLASSIC_GRID)
  const canDrag = !unavailable && tool.kind === 'hidden'
  return <div className="puzzle-stage">
    <Board givens={values} values={values} candidates={masks} annotations={tool.annotations} showGuides
      onCell={unavailable ? undefined : tool.selectCell}
      dragSelect={canDrag} onCellPointerDown={canDrag ? tool.startSweep : undefined}
      onCellPointerMove={canDrag ? tool.moveSweep : undefined} onGridPointerEnd={canDrag ? tool.endSweep : undefined} />
    <SubsetsPanel tool={tool} size={CLASSIC_GRID.size} unavailable={unavailable} />
  </div>
}

const meta = {
  title: 'Medium/Play/Subsets',
  component: SubsetsExample,
  decorators: [(Story) => <Width stage width={340}><Story /></Width>],
} satisfies Meta<typeof SubsetsExample>
export default meta
type Story = StoryObj<typeof meta>

export const CompareAndReveal: Story = {}
export const LoadingCandidates: Story = { args: { unavailable: 'Loading candidates…' } }
