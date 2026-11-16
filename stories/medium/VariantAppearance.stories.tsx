import type { Meta, StoryObj } from '@storybook/react-vite'
import benchmarks from '../../crates/engine/benches/fixtures/variants.json'
import { Board } from '../../src/components/Board'
import type { VariantPuzzle } from '../../src/sudoku/engine'
import { jigsawLayout, variantSeeds } from '../../src/sudoku/variant-generation'
import { variantHouseMasks } from '../../src/sudoku/variants'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Variant appearance',
  component: Board,
  decorators: [(Story, { parameters }) => <Width stage width={parameters.gridWidth ?? 530}><Story /></Width>],
  args: { showGuides: true },
} satisfies Meta<typeof Board>
export default meta
type Story = StoryObj<typeof meta>

function candidateGrid(puzzle: VariantPuzzle, label: string) {
  return {
    label, givens: puzzle.givens, values: puzzle.givens,
    variantPuzzle: puzzle, candidates: variantHouseMasks(puzzle, puzzle.givens),
  }
}

const diagonal = benchmarks.find(({ name }) => name === 'x-sudoku')!.position as VariantPuzzle
const killer = benchmarks.find(({ name }) => name === 'killer')!.position as VariantPuzzle

export const Diagonal: Story = { args: candidateGrid(diagonal, 'Diagonal Sudoku grid') }

export const Killer: Story = {
  args: candidateGrid(killer, 'Killer Sudoku grid'),
  parameters: { docs: { description: { story:
    'Sudoku.com uses small navy totals and fine cage outlines. Killersudoku.co uses larger, bolder totals in the same upper-left position. DKM uses thin dotted outlines and shows a green fill for the selected cage in its help example. This preview uses a medium-weight total, a break in the top cage line, and space for candidates below the total. The grid shows house candidates to exercise crowded cells. [Sudoku.com](https://sudoku.com/killer/easy/) · [Killersudoku.co](https://killersudoku.co/) · [DKM](https://dkmgames.com/KillerSudoku/KillerSudokuHelp.htm)',
  } } },
}

export const KillerCompact: Story = {
  ...Killer,
  parameters: { ...Killer.parameters, gridWidth: 290 },
}

export const Jigsaw: Story = {
  args: candidateGrid({
    version: 1,
    givens: '500000000800000009600849200001000002030256100000670003040000000200300008000020391',
    regions: jigsawLayout(variantSeeds.jigsaw.medium![0].regions!),
  }, 'Jigsaw Sudoku grid'),
  parameters: { docs: { description: { story:
    'Thin grid lines separate every row and column. Bold outlines show the nine irregular regions. Every row, column, and outlined region contains 1–9. [PuzzleLab](https://puzzlelab.app/jigsaw-sudoku) · [Kawu](https://kawu.com/jigsaw-sudoku)',
  } } },
}
