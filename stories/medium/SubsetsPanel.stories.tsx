import type { Meta, StoryObj } from '@storybook/react-vite'
import { SubsetsPanel } from '../../src/components/SubsetsPanel'
import { useSubsets } from '../../src/components/useSubsets'
import { CLASSIC_GRID } from '../../src/sudoku/grid'
import { Width } from '../support/frames'

const masks = [0b0111, 0b1011, 0b1100, 0b1100, ...Array<number>(77).fill(0)]

function SubsetsExample({ unavailable }: { unavailable?: string }) {
  const tool = useSubsets(unavailable ? null : masks, CLASSIC_GRID)
  return <SubsetsPanel tool={tool} size={CLASSIC_GRID.size} unavailable={unavailable} />
}

const meta = {
  title: 'Medium/Play/Subsets',
  component: SubsetsExample,
  decorators: [(Story) => <Width width={300}><Story /></Width>],
} satisfies Meta<typeof SubsetsExample>
export default meta
type Story = StoryObj<typeof meta>

export const CompareAndReveal: Story = {}
export const LoadingCandidates: Story = { args: { unavailable: 'Loading candidates…' } }
