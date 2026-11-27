import skyscrapersMurphy from '../../tests/fixtures/skyscrapers-murphy.json'
import skyscrapersMixed from '../../tests/fixtures/skyscrapers-jigsaw-mixed.json'
import xSumNewman from '../../tests/fixtures/x-sum-newman.json'
import xSumMixed from '../../tests/fixtures/x-sum-jigsaw-mixed.json'
import type { Meta, StoryObj } from '@storybook/react-vite'
import benchmarks from '../../crates/engine/benches/fixtures/variants.json'
import betweenNewman from '../../tests/fixtures/between-newman.json'
import regionSumNewman from '../../tests/fixtures/region-sum-newman.json'
import modularCoach from '../../tests/fixtures/modular-coach.json'
import whispersCoach from '../../tests/fixtures/whispers-coach.json'
import littleKillerMurphy from '../../tests/fixtures/little-killer-murphy.json'
import littleKillerNewman from '../../tests/fixtures/little-killer-newman.json'
import sandwichMurphy from '../../tests/fixtures/sandwich-murphy.json'
import cloneMurphy from '../../tests/fixtures/clone-murphy.json'
import { Board, type BoardAppearance, type BoardContent, type BoardInteraction, type BoardLayout, type BoardProps } from '../../src/components/Board'
import { detectPuzzle } from '../../src/sudoku/puzzle-import'
import type { SizedConstraintRule, VariantPuzzle } from '../../src/sudoku/engine'
import { jigsawLayout, variantSeeds } from '../../src/sudoku/variant-generation'
import { variantHouseMasks } from '../../src/sudoku/variants'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Variant appearance',
  component: Board,
  decorators: [
    (Story, { parameters }) => (
      <Width stage width={parameters.gridWidth ?? 530}>
        <Story />
      </Width>
    ),
  ],
  args: { appearance: { showGuides: true } },
} satisfies Meta<typeof Board>
export default meta
type StoryArgs = Omit<Partial<BoardProps>, 'content' | 'appearance' | 'interaction' | 'layout'> & {
  content?: Partial<BoardContent>
  appearance?: Partial<BoardAppearance>
  interaction?: Partial<BoardInteraction>
  layout?: Partial<BoardLayout>
}
type Story = Omit<StoryObj<typeof meta>, 'args'> & { args?: StoryArgs }

function candidateGrid(puzzle: VariantPuzzle, label: string) {
  return {
    content: {
      givens: puzzle.givens,
      values: puzzle.givens,
      variantPuzzle: puzzle,
      candidates: variantHouseMasks(puzzle, puzzle.givens),
    },
    appearance: { label },
  }
}

const diagonal = benchmarks.find(({ name }) => name === 'x-sudoku')!.position as VariantPuzzle
const killer = benchmarks.find(({ name }) => name === 'killer')!.position as VariantPuzzle

export const Diagonal: Story = {
  args: candidateGrid(diagonal, 'Diagonal Sudoku grid'),
}

export const Killer: Story = {
  args: candidateGrid(killer, 'Killer Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story:
          'Sudoku.com uses small navy totals and fine cage outlines. Killersudoku.co uses larger, bolder totals in the same upper-left position. DKM uses thin dotted outlines and shows a green fill for the selected cage in its help example. This preview uses a medium-weight total, a break in the top cage line, and space for candidates below the total. The grid shows house candidates to exercise crowded cells. [Sudoku.com](https://sudoku.com/killer/easy/) · [Killersudoku.co](https://killersudoku.co/) · [DKM](https://dkmgames.com/KillerSudoku/KillerSudokuHelp.htm)',
      },
    },
  },
}

export const KillerCompact: Story = {
  ...Killer,
  parameters: { ...Killer.parameters, gridWidth: 290 },
}

export const Jigsaw: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '500000000800000009600849200001000002030256100000670003040000000200300008000020391',
      regions: jigsawLayout(variantSeeds.jigsaw.medium![0].regions!),
    },
    'Jigsaw Sudoku grid'
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Thin grid lines separate every row and column. Bold outlines show the nine irregular regions. Every row, column, and outlined region contains 1–9. [PuzzleLab](https://puzzlelab.app/jigsaw-sudoku) · [Kawu](https://kawu.com/jigsaw-sudoku)',
      },
    },
  },
}

export const LockoutLines: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '000000902' + '0'.repeat(72),
      rules: [
        { type: 'lockout', cells: [6, 7, 8] },
        { type: 'lockout', cells: [9, 30, 51] },
      ],
    },
    'Lockout Lines Sudoku grid'
  ),
  parameters: { gridWidth: 290 },
}

export const BetweenLines: Story = {
  args: candidateGrid(betweenNewman.puzzle as VariantPuzzle, 'Between Lines Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story:
          'Between, the Lines by Philip Newman. Two outlined circles bound each independent path. Every interior digit is strictly between the endpoint digits; interior digits can repeat when the other rules allow it.',
      },
    },
  },
}

export const BetweenLinesCompact: Story = {
  ...BetweenLines,
  parameters: { ...BetweenLines.parameters, gridWidth: 290 },
}

export const BetweenSeparatedCells: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '0'.repeat(81),
      rules: [{ type: 'between', cells: [0, 40, 80] }],
    },
    'Between line with separated cells'
  ),
  parameters: {
    docs: {
      description: {
        story: 'The dashed connectors skip unmarked cells. The small dot identifies R5C5 as the one interior cell between the two endpoint circles.',
      },
    },
  },
}

export const RegionSumLines: Story = {
  args: candidateGrid(regionSumNewman.puzzle as VariantPuzzle, 'Region Sum Lines Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story: 'Symmetease by Philip Newman. Region borders divide each blue path into parts with equal totals. Each line has its own total.',
      },
    },
  },
}

export const RegionSumLinesCompact: Story = {
  ...RegionSumLines,
  parameters: { ...RegionSumLines.parameters, gridWidth: 290 },
}

const regionSum220V = modularCoach.examples.find((source) => source.url.endsWith('/7rs9'))!.publishedPuzzle as VariantPuzzle

export const RegionSumContacts: Story = {
  args: {
    content: {
      variantPuzzle: regionSum220V,
      givens: regionSum220V.givens,
      values: regionSum220V.givens,
    },
    appearance: { label: '220V Sudoku grid' },
  },
}

export const RegionSumContactsCompact: Story = {
  args: candidateGrid(regionSum220V, '220V Sudoku grid with candidates'),
  parameters: { gridWidth: 290 },
}

const cmdtLoader = async () => {
  const source = whispersCoach.examples.find((example) => example.url.endsWith('/Cmdt'))!
  const imported = await detectPuzzle(source.code)
  return { puzzle: imported.variant!.puzzle, authoredArtwork: imported.authoredArtwork, solution: source.solution! }
}

const b5mtLoader = async () => {
  const source = whispersCoach.examples.find((example) => example.url.endsWith('/B5mt'))!
  const imported = await detectPuzzle(source.code)
  return { puzzle: imported.variant!.puzzle, authoredArtwork: imported.authoredArtwork, whispersGuide: imported.whispersGuide, solution: source.solution! }
}

const b5mtStory = (finished: boolean): Story => ({
  args: {
    content: { givens: '0'.repeat(81), values: '0'.repeat(81) },
    appearance: { label: finished ? 'Finished Whispers Line Basics grid' : 'Whispers Line Basics grid' },
  },
  loaders: [b5mtLoader],
  render: (args, { loaded }) => {
    const { puzzle, authoredArtwork, whispersGuide, solution } = loaded as Awaited<ReturnType<typeof b5mtLoader>>
    return <Board
      {...args}
      appearance={{ ...args.appearance, authoredArtwork }}
      content={{
        ...args.content,
        variantPuzzle: puzzle,
        givens: puzzle.givens,
        values: finished ? solution : puzzle.givens,
        whispersGuide,
      }}
    />
  },
})

export const WhispersLineBasics: Story = { ...b5mtStory(false), parameters: { gridWidth: 360 } }

export const WhispersLineBasicsFinished: Story = { ...b5mtStory(true), parameters: { gridWidth: 360 } }

const cmdtStory = (finished: boolean): Story => ({
  args: {
    content: { givens: '0'.repeat(81), values: '0'.repeat(81) },
    appearance: { label: finished ? 'Finished Cmdt Sudoku grid' : 'Cmdt Sudoku grid' },
  },
  loaders: [cmdtLoader],
  render: (args, { loaded }) => {
    const { puzzle, authoredArtwork, solution } = loaded as Awaited<ReturnType<typeof cmdtLoader>>
    return <Board
      {...args}
      appearance={{ ...args.appearance, authoredArtwork }}
      content={{
        ...args.content,
        variantPuzzle: puzzle,
        givens: puzzle.givens,
        values: finished ? solution : puzzle.givens,
      }}
    />
  },
})

export const WhispersWithThermometers: Story = cmdtStory(false)

export const WhispersWithThermometersFinished: Story = cmdtStory(true)

export const WhispersWithThermometersCompact: Story = {
  ...WhispersWithThermometers,
  parameters: { gridWidth: 290 },
}

export const RegionSumClosedAndSeparated: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '0'.repeat(81),
      rules: [
        {
          type: 'region-sum',
          cells: [34, 33, 24, 25],
          segments: [[25, 34, 33, 24, 25]],
        },
        { type: 'region-sum', cells: [28, 30, 38], groupByRegion: true },
      ],
    },
    'Closed Region Sum path and combined region visits'
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The first clue keeps its closing edge. The second clue combines its two visits to the same region. Dashed connectors skip unmarked cells; dots identify the logical cells.',
      },
    },
  },
}

export const ConsecutiveLinesAndShading: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '0'.repeat(81),
      rules: [
        { type: 'consecutive-run', cells: [60, 61], color: '#fc03cf' },
        {
          type: 'distinct-cells',
          cells: [68, 77, 78, 79, 80],
          color: '#0cd3ed',
        },
        { type: 'quadruple', topLeft: 68, digits: [4, 6] },
      ],
    },
    'Consecutive Lines with a shaded group and a Quadruple'
  ),
  parameters: { gridWidth: 290 },
}

export const CloneShapes: Story = {
  args: candidateGrid(cloneMurphy.puzzle as VariantPuzzle, 'Clone Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story:
          'Legs in a Snare by Bill Murphy. Shading retains its two pairs of published shapes. Matching letters require matching digits; different letters need not be different digits. Candidate grids reserve a lower strip for the letters.',
      },
    },
  },
}

export const CloneShapesCompact: Story = {
  ...CloneShapes,
  parameters: { ...CloneShapes.parameters, gridWidth: 290 },
}

export const CloneOverlappingCopies: Story = {
  args: {
    ...candidateGrid(
      {
        version: 1,
        givens: '0'.repeat(81),
        rules: [
          {
            type: 'clone',
            groups: [
              [0, 40],
              [8, 30, 52],
            ],
          },
          { type: 'clone', groups: [[40, 80]] },
          { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 7 }] },
          { type: 'thermometer', cells: [8, 17, 26] },
        ],
      },
      'Clone labels with overlapping clues'
    ),
    appearance: {
      label: 'Clone labels with overlapping clues',
      annotations: {
        links: [
          {
            from: { cell: 0, digit: 1 },
            to: { cell: 40, digit: 9 },
            color: 'var(--board-selected-border)',
          },
        ],
      },
    },
  },
  parameters: {
    gridWidth: 290,
    docs: {
      description: {
        story:
          'Overlapping Clone sets link R1C1, R5C5 and R9C9 under one letter. Another letter matches three cells. Cages and thermometers retain their own meaning. Candidate links follow the space reserved for letters and cage totals.',
      },
    },
  },
}

export const Sandwich: Story = {
  args: candidateGrid(sandwichMurphy.puzzle as VariantPuzzle, 'Sandwich Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story:
          'American Food by Bill Murphy. Outside totals sum the digits strictly between 1 and 9. The gutters remain visible when coordinate guides are hidden and preserve every candidate and link position.',
      },
    },
  },
}
export const SandwichCompact: Story = {
  ...Sandwich,
  parameters: { ...Sandwich.parameters, gridWidth: 290 },
}
export const SandwichAllEdges: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '0'.repeat(81),
      rules: [
        {
          type: 'sandwich',
          direction: 'south',
          cells: [0, 9, 18, 27, 36, 45, 54, 63, 72],
          sum: 0,
        },
        {
          type: 'sandwich',
          direction: 'north',
          cells: [80, 71, 62, 53, 44, 35, 26, 17, 8],
          sum: 35,
        },
        {
          type: 'sandwich',
          direction: 'east',
          cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
          sum: 0,
        },
        {
          type: 'sandwich',
          direction: 'west',
          cells: [80, 79, 78, 77, 76, 75, 74, 73, 72],
          sum: 35,
        },
        {
          type: 'sandwich',
          direction: 'east',
          cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
          sum: 0,
        },
      ],
    },
    'Outside clues on all four edges with repeated zero totals'
  ),
  parameters: { gridWidth: 290 },
}

export const SizedSudokuPadImport: Story = {
  args: {
    content: {
      givens: '0'.repeat(36),
      values: '0'.repeat(36),
      grid: { size: 6, boxRows: 2, boxColumns: 3 },
      sizedRules: [
        { type: 'slow-thermometer', cells: [33, 26, 21, 14, 9, 2] },
        {
          type: 'whispers',
          cells: [26, 20, 14, 8, 2, 7, 12, 13],
          minDifference: 2,
        },
        { type: 'whispers', cells: [27, 21, 15, 16], minDifference: 3 },
        { type: 'xv', five: { pairs: [[1, 2]] }, ten: { pairs: [[10, 16]] } },
        {
          type: 'sandwich',
          direction: 'south',
          cells: [2, 8, 14, 20, 26, 32],
          sum: 6,
        },
      ] as SizedConstraintRule[],
    },
    appearance: { label: '6×6 SudokuPad puzzle with combined clues' },
  },
  parameters: {
    gridWidth: 360,
    docs: {
      description: {
        story:
          'A 6×6 grid shows the sized import clues together. Slow Thermometers use a dashed line, Whispers show their minimum, XV markers show their sums, and Sandwich totals sit outside the grid.',
      },
    },
  },
}

export const LittleKiller: Story = {
  args: candidateGrid(littleKillerMurphy.puzzle as VariantPuzzle, 'Little Killer Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story:
          'New Body Rhumba by Bill Murphy. Each arrow identifies the full diagonal whose digits sum to its outside total. Repeats are allowed when the Sudoku houses permit them.',
      },
    },
  },
}
export const LittleKillerCompact: Story = {
  ...LittleKiller,
  parameters: { ...LittleKiller.parameters, gridWidth: 290 },
}
export const LittleKillerCorners: Story = {
  args: candidateGrid(littleKillerNewman.puzzle as VariantPuzzle, 'Little Killer Sudoku with corner arrows'),
  parameters: {
    gridWidth: 290,
    docs: {
      description: {
        story: 'Triforce by Philip Newman preserves both printed directions of its long diagonals. All four corners have their own space outside the cell grid.',
      },
    },
  },
}

export const XSums: Story = {
  args: candidateGrid(xSumNewman.puzzle as VariantPuzzle, 'X-Sums Sudoku grid'),
  parameters: {
    docs: {
      description: {
        story: 'The first digit counts the cells in the outside total and includes itself. This complete Newman control retains every given and clue.',
      },
    },
  },
}
export const XSumsCompact: Story = {
  ...XSums,
  parameters: { ...XSums.parameters, gridWidth: 290 },
}
export const MixedOutsideClues: Story = {
  args: candidateGrid(xSumMixed.puzzle as VariantPuzzle, 'Jigsaw with X-Sums, Sandwich and Little Killer clues'),
  parameters: {
    gridWidth: 290,
    docs: {
      description: {
        story:
          'S/X prefixes and the visible legend distinguish otherwise ambiguous row and column totals. Diagonal arrows retain their separate Little Killer meaning; candidate links stay aligned.',
      },
    },
  },
}

export const Skyscrapers: Story = {
  args: candidateGrid(skyscrapersMurphy.puzzle as VariantPuzzle, 'Skyscrapers visibility clues'),
  parameters: {
    docs: {
      description: {
        story: 'Each outside number counts the visible buildings from that edge. This is the visibility variant, distinct from the Classic single-digit Skyscraper technique.',
      },
    },
  },
}
export const SkyscrapersCompact: Story = {
  ...Skyscrapers,
  parameters: { ...Skyscrapers.parameters, gridWidth: 290 },
}
export const AllOutsideFamilies: Story = {
  args: candidateGrid(skyscrapersMixed.puzzle as VariantPuzzle, 'Jigsaw with all four outside clue families'),
  parameters: {
    gridWidth: 290,
    docs: {
      description: {
        story: 'S/X/Sk prefixes and the visible legend preserve every outside total and visibility count. Little Killer arrows retain their separate diagonal meaning.',
      },
    },
  },
}

export const PillArrows: Story = {
  args: candidateGrid(
    {
      version: 1,
      givens: '000000012000000008' + '0'.repeat(63),
      rules: [{ type: 'pill-arrow', pill: [7, 8], cells: [16, 17] }],
    },
    'Pill Arrow Sudoku grid'
  ),
  parameters: { gridWidth: 290 },
}
