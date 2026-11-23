import type { Meta, StoryObj } from '@storybook/react-vite'
import type { VariantPuzzle } from '../src/sudoku/engine'
import { KillerCombos } from '../src/components/KillerCombos'

const puzzle = {
  rules: [{ type: 'killer-cages', cages: [{ sum: 6, cells: [0, 1] }] }],
} as unknown as VariantPuzzle

const meta = {
  title: 'Puzzle tools/Killer combinations',
  component: KillerCombos,
  args: { puzzle, values: '0'.repeat(81), active: 0, visible: true },
  decorators: [Story => <div style={{ width: 320, margin: '1rem auto' }}><Story /></div>],
} satisfies Meta<typeof KillerCombos>

export default meta
type Story = StoryObj<typeof meta>

export const SelectedCage: Story = {}

export const HiddenAfterDeselect: Story = {
  args: { visible: false },
}
