import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import type { SizedConstraintRule } from '../../src/sudoku/engine'
import { Width } from '../support/frames'

const givens = '0'.repeat(36)
const solution = '314265265314652143143652431526526431'
const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
const rules: readonly SizedConstraintRule[] = [
  { type: 'product-cage', cells: [8, 10, 13, 14, 15, 16, 22, 26, 27, 28], product: 10_000, color: '#ffbfffff' },
  { type: 'digit-count', cells: [0, 5, 30, 35], digit: 3, minimum: 1 },
]

const meta = {
  title: 'Medium/Grid/Product cage',
  component: Board,
  decorators: [(Story) => <Width stage width={530}><Story /></Width>],
} satisfies Meta<typeof Board>
export default meta
type Story = StoryObj<typeof meta>

function ProductCageBoard({ finished = false }: { finished?: boolean }) {
  return <div>
    <p>The digits in the shaded cage multiply to 10,000. Repeats are allowed when other rules permit them. At least one corner contains a 3.</p>
    <Board content={{ givens, values: finished ? solution : givens, grid, sizedRules: rules }}
      appearance={{ showGuides: true, label: 'Sudoku' }} />
  </div>
}

const args = { content: { givens, values: givens, grid, sizedRules: rules } }
export const TenKUnfinished: Story = { args, render: () => <ProductCageBoard /> }
export const TenKFinished: Story = { args, render: () => <ProductCageBoard finished /> }
