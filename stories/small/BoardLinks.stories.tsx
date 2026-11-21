import type { Meta, StoryObj } from '@storybook/react-vite'
import { BoardLinks, type BoardLink } from '../../src/components/BoardAnnotations'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Grid/Inference links',
  component: BoardLinks,
  args: { links: [] },
  decorators: [(Story) => <Width width={350}>
    <div className="board-body" style={{ aspectRatio: '1', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <Story />
    </div>
  </Width>],
} satisfies Meta<typeof BoardLinks>
export default meta
type Story = StoryObj<typeof meta>
const links: BoardLink[] = [
  { from: { cell: 0, digit: 5 }, to: { cell: 3, digit: 5 }, color: 'var(--focus)' },
  { from: { cell: 3, digit: 5 }, to: { cell: 39, digit: 5 }, color: 'var(--focus)', dashed: true },
  { from: { cell: 39, digit: 5 }, to: { cells: [41, 42], digit: 5 }, color: 'var(--focus)', arrow: true },
]
export const StrongWeakAndArrow: Story = { args: { links } }
export const CroppedGrid: Story = { args: { links, region: { row: 0, column: 0, rows: 6, columns: 6 } } }
export const GroupedEndpoints: Story = {
  args: {
    links: [
      { from: { cell: 0, digit: 5 }, to: { cells: [3, 4], digit: 5 }, color: 'var(--chain-blue)' },
      { from: { cells: [4, 3], digit: 5 }, to: { cells: [30, 39], digit: 5 }, color: 'var(--chain-blue)', dashed: true },
      { from: { cells: [30, 39], digit: 5 }, to: { cell: 48, digit: 5 }, color: 'var(--chain-blue)' },
    ],
  },
}
export const MixedGroupAndEndpointClue: Story = {
  args: {
    links: [{ from: { candidates: [{ cell: 1, digit: 2 }, { cell: 1, digit: 5 }, { cell: 10, digit: 5 }] },
      to: { cell: 46, digit: 5 }, color: 'var(--chain-purple)' }],
    groups: [{ point: { cells: [48, 49], digit: 7 }, color: 'var(--chain-orange)', label: 'Chain end' }],
  },
}
export const OddLoopColorBreak: Story = {
  args: {
    links: [
      { from: { cell: 0, digit: 5 }, to: { cell: 2, digit: 5 }, color: 'var(--chain-blue)' },
      { from: { cell: 2, digit: 5 }, to: { cell: 20, digit: 5 }, color: 'var(--chain-blue)' },
      { from: { cell: 20, digit: 5 }, to: { cell: 0, digit: 5 }, color: 'var(--chain-blue)', dashed: true, colorBreak: true },
    ],
  },
}
