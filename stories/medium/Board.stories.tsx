import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board, type BoardAppearance, type BoardContent, type BoardInteraction, type BoardLayout, type BoardProps } from '../../src/components/Board'
import type { VariantPuzzle } from '../../src/sudoku/engine'
import { projectFogPuzzle } from '../../src/sudoku/fog'
import { conflictsOf, enter, paintCandidates, valuesOf } from '../../src/sudoku/game'
import { fiveJigsawForSeed, MINI_GRID, SEVEN_BOXLESS_GRID } from '../../src/sudoku/grid'
import { lessonDiagram, lessonValues } from '../../src/sudoku/lesson-diagram'
import { inProgress, lessonExamples, starter } from '../support/fixtures'
import { LessonFrame, Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Sudoku grid',
  component: Board,
  decorators: [
    (Story) => (
      <Width stage width={530}>
        <Story />
      </Width>
    ),
  ],
  args: {
    content: { givens: starter.givens, values: starter.givens },
    appearance: { showGuides: true },
  },
} satisfies Meta<typeof Board>
export default meta
type StoryArgs = Omit<Partial<BoardProps>, 'content' | 'appearance' | 'interaction' | 'layout'> & {
  content?: Partial<BoardContent>
  appearance?: Partial<BoardAppearance>
  interaction?: Partial<BoardInteraction>
  layout?: Partial<BoardLayout>
}
type Story = Omit<StoryObj<typeof meta>, 'args'> & { args?: StoryArgs }

export const ReadOnly: Story = {}
export const AuthoredCellFills: Story = {
  args: {
    content: {
      givenCellColors: {
        10: ['orange'],
        11: ['orange'],
        12: ['green'],
        19: ['orange'],
        20: ['orange', 'green'],
      },
    },
    appearance: { showPlayerColors: false },
    interaction: { selected: [11] },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}
export const AuthoredVariantArtwork: Story = {
  args: {
    appearance: {
      authoredArtwork: [
        {
          type: 'outline',
          points: [
            [1, 1],
            [4, 1],
            [4, 4],
            [1, 4],
            [1, 1],
          ],
          thickness: 0.05,
        },
        { type: 'disc', center: [4.5, 4.5], radius: 0.225, color: '#2a2a2a' },
      ],
      showImportedAnnotations: false,
    },
    interaction: { selected: [40] },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}
export const GlobalEntropyShapeWindows: Story = {
  args: {
    content: {
      variantPuzzle: {
        version: 1,
        givens: '0'.repeat(81),
        rules: [
          { type: 'global-entropy' },
          { type: 'entropy-window-group', cells: [0, 1, 9, 10], group: 'low' },
          {
            type: 'entropy-window-group',
            cells: [13, 14, 22, 23],
            group: 'middle',
          },
          {
            type: 'entropy-window-group',
            cells: [24, 25, 33, 34],
            group: 'high',
          },
        ],
      },
    },
    interaction: { selected: [14] },
  },
  decorators: [
    (Story) => (
      <Width width={385}>
        <Story />
      </Width>
    ),
  ],
}
export const MiniSudoku: Story = {
  args: {
    content: {
      grid: MINI_GRID,
      givens: '0234341221434321',
      values: '0234341221434321',
      candidates: [1, ...Array<number>(15).fill(0)],
    },
    interaction: { selected: [0] },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}
export const SixWithCombinedRules: Story = {
  args: {
    content: {
      grid: { size: 6, boxRows: 2, boxColumns: 3 },
      givens: '0'.repeat(36),
      values: '0'.repeat(36),
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
        {
          type: 'kropki',
          consecutive: { pairs: [[8, 9]] },
          ratioTwo: { pairs: [[8, 9]] },
        },
      ],
      candidates: Array.from({ length: 36 }, (_, cell) => (cell === 20 ? 0b101000 : 0)),
    },
    interaction: { selected: [20] },
  },
  decorators: [
    (Story) => (
      <Width width={385}>
        <Story />
      </Width>
    ),
  ],
}
export const EightWithTallBoxes: Story = {
  args: {
    content: {
      grid: { size: 8, boxRows: 4, boxColumns: 2 },
      givens: '00000000'.repeat(8),
      values: '00000000'.repeat(8),
      candidates: Array.from({ length: 64 }, (_, cell) => (cell === 9 ? 0b11111111 : 0)),
    },
    interaction: { selected: [9] },
  },
  decorators: [
    (Story) => (
      <Width width={385}>
        <Story />
      </Width>
    ),
  ],
}
export const FiveJigsaw: Story = {
  args: {
    content: {
      grid: fiveJigsawForSeed(),
      givens: '0030000400000000100000002',
      values: '0030000400000000100000002',
      candidates: Array.from({ length: 25 }, (_, cell) => (cell === 13 ? 0b11111 : 0)),
    },
    interaction: { selected: [13] },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}
export const SevenJigsawThermometer: Story = {
  args: {
    content: {
      grid: {
        size: 7,
        regions: Array.from({ length: 7 }, (_, region) =>
          [...'0000111020011122233312223434555343456664445556666'].flatMap((label, cell) => (Number(label) === region ? [cell] : []))
        ),
      },
      givens: '0'.repeat(49),
      values: '0'.repeat(49),
      sizedRules: [{ type: 'thermometer', cells: [8, 16, 24] }],
      candidates: Array.from({ length: 49 }, (_, cell) => (cell === 24 ? 0b1100000 : 0)),
    },
    interaction: { selected: [24] },
  },
  decorators: [
    (Story) => (
      <Width width={385}>
        <Story />
      </Width>
    ),
  ],
}
export const SixDoubleArrows: Story = {
  args: {
    content: {
      grid: { size: 6, boxRows: 2, boxColumns: 3 },
      givens: '0'.repeat(36),
      values: '0'.repeat(36),
      sizedRules: [
        { type: 'double-arrow', ends: [0, 4], cells: [1, 2, 3] },
        { type: 'double-arrow', ends: [4, 22], cells: [10, 16] },
        { type: 'parity', parity: 'even', cells: [14] },
      ],
    },
    interaction: { selected: [4] },
  },
  decorators: [
    (Story) => (
      <Width width={350}>
        <Story />
      </Width>
    ),
  ],
}
export const LinkedDoubleArrowXSum: Story = {
  args: {
    content: {
      grid: { size: 6, boxRows: 2, boxColumns: 3 },
      givens: '0'.repeat(36),
      values: '0'.repeat(36),
      sizedRules: [
        {
          type: 'linked-double-arrow',
          ends: [
            { direction: 'south', index: 1 },
            { direction: 'east', index: 1 },
          ],
          cells: [0],
        },
        {
          type: 'linked-double-arrow',
          ends: [
            { direction: 'west', index: 3 },
            { direction: 'north', index: 2 },
          ],
          cells: [29, 28, 33],
        },
      ],
    },
    interaction: { selected: [0] },
  },
  decorators: [
    (Story) => (
      <Width width={365}>
        <Story />
      </Width>
    ),
  ],
}
export const SevenBoxlessKiller: Story = {
  args: {
    content: {
      grid: SEVEN_BOXLESS_GRID,
      givens: '0'.repeat(49),
      values: '0'.repeat(49),
      sizedRules: [
        {
          type: 'killer-cages',
          cages: [
            { cells: [0, 1, 2, 7, 8, 14], sum: 26 },
            { cells: [3, 4], sum: 8 },
          ],
        },
        { type: 'extra-house', cells: [6, 12, 18, 24, 30, 36, 42] },
      ],
    },
    interaction: { selected: [0] },
  },
  decorators: [
    (Story) => (
      <Width width={385}>
        <Story />
      </Width>
    ),
  ],
}
export const MiniRenbanLine: Story = {
  args: {
    content: {
      grid: MINI_GRID,
      givens: '1000000000000000',
      values: '1000000000000000',
      sizedRules: [
        {
          type: 'renban',
          cells: [0, 1, 5],
          segments: [
            [0, 1],
            [1, 5],
          ],
        },
      ],
    },
    interaction: { selected: [5] },
  },
  decorators: [
    (Story) => (
      <Width width={290}>
        <Story />
      </Width>
    ),
  ],
}
export const MiniKropkiDots: Story = {
  args: {
    content: {
      grid: MINI_GRID,
      givens: '1000000000000000',
      values: '1000000000000000',
      sizedRules: [
        {
          type: 'kropki',
          consecutive: {
            pairs: [
              [0, 1],
              [6, 10],
            ],
          },
          ratioTwo: {
            pairs: [
              [0, 1],
              [2, 6],
            ],
          },
        },
      ],
    },
    interaction: { selected: [1], active: 1 },
  },
  decorators: [
    (Story) => (
      <Width width={290}>
        <Story />
      </Width>
    ),
  ],
}
export const AlgebraicCageCaptions: Story = {
  args: {
    content: {
      grid: MINI_GRID,
      givens: '0'.repeat(16),
      values: '0'.repeat(16),
      algebraicCages: [
        {
          type: 'algebraic-cage',
          cells: [4, 5],
          label: 'n+2',
          total: { type: 'variable', name: 'n', offset: 2 },
        },
        {
          type: 'algebraic-cage',
          cells: [8],
          label: 'n-1',
          total: { type: 'variable', name: 'n', offset: -1 },
        },
      ],
    },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}
const fogPuzzle = {
  version: 1,
  givens: '0'.repeat(81),
  rules: [
    { type: 'killer-cages', cages: [{ cells: [45, 46, 47], sum: 12 }] },
    { type: 'whispers', cells: [63, 64, 65], minDifference: 5 },
    {
      type: 'sandwich',
      cells: [79, 70, 61, 52, 43, 34, 25, 16, 7],
      direction: 'north',
      sum: 17,
    },
  ],
} satisfies VariantPuzzle
const fogCells = new Set([45, 46, 54, 55, 63, 64, 72, 73])
const fogEntries = '0'.repeat(54) + '8' + '0'.repeat(8) + '1' + '0'.repeat(17)
export const FogFragments: Story = {
  args: {
    content: {
      variantPuzzle: fogPuzzle,
      fog: {
        entries: fogEntries,
        cells: fogCells,
        puzzle: projectFogPuzzle(fogPuzzle, fogCells),
      },
      givens: fogPuzzle.givens,
      values: fogEntries,
    },
    interaction: { selected: [54] },
  },
  decorators: [
    (Story) => (
      <Width width={340}>
        <Story />
      </Width>
    ),
  ],
}

export const WithoutGuides: Story = {
  args: { appearance: { showGuides: false } },
}
export const CellSelection: Story = {
  render: (args) => <SelectableGrid {...args} />,
}
const candidateExample = enter(enter(inProgress, [3, 5], 'center', 6), [2, 5], 'color', 4)
export const CandidatesAndColor: Story = {
  args: {
    content: {
      values: valuesOf(inProgress),
      position: paintCandidates(candidateExample, [
        { cell: 5, digit: 2, color: 2 },
        { cell: 5, digit: 6, color: 5 },
      ]).position,
    },
    appearance: { candidateLayout: 'center-corner', highlightedDigit: 2 },
    interaction: { selected: [3, 5] },
  },
}
export const CellColorHoverPreview: Story = {
  args: { appearance: { colorPreview: { target: 'cell', color: 4 } } },
}
export const CandidateColorHoverPreview: Story = {
  args: {
    content: {
      values: valuesOf(inProgress),
      position: paintCandidates(candidateExample, [
        { cell: 5, digit: 2, color: 2 },
        { cell: 5, digit: 6, color: 5 },
      ]).position,
    },
    appearance: { colorPreview: { target: 'candidate', color: 4 } },
    interaction: { onPaintCandidate: () => {} },
  },
}
export const HintAnnotationsOverPlayerHighlights: Story = {
  args: {
    content: {
      values: valuesOf(inProgress),
      position: {
        ...inProgress.position,
        colors: inProgress.position.colors.map((color, cell) => (cell === 40 ? 6 : cell === 41 ? 2 : color)),
      },
    },
    appearance: {
      annotations: {
        cells: new Map([[40, { fill: 'var(--lesson-pattern-fill)', label: 'hint cell' }]]),
      },
      annotationsOnTop: true,
      highlightedDigitMask: (1 << 1) | (1 << 4),
      highlightCandidateCells: true,
    },
  },
}
export const OverlappingCellAnnotations: Story = {
  args: {
    content: {
      values: valuesOf(inProgress),
      position: {
        ...inProgress.position,
        colors: inProgress.position.colors.map((color, cell) => (cell === 40 ? 6 : cell === 41 ? 2 : color)),
      },
    },
    appearance: {
      annotations: {
        cells: new Map([
          [
            40,
            {
              fills: ['#f5c7d4', '#cce1fc'],
              label: 'overlapping analysis groups',
            },
          ],
          [41, { fills: ['#cce1fc'], label: 'analysis group' }],
        ]),
      },
      annotationsOnTop: true,
      highlightedDigitMask: (1 << 1) | (1 << 4),
      highlightCandidateCells: true,
    },
    interaction: { selected: [40] },
  },
}
export const PlayerMultiCellColors: Story = {
  args: {
    content: {
      values: valuesOf(inProgress),
      position: {
        ...inProgress.position,
        colors: inProgress.position.colors.map((color, cell) => (cell === 40 ? 6 : color)),
        cellColors: { 40: [6, 5], 41: [2, 4, 8] },
      },
    },
    interaction: { selected: [40] },
  },
}
export const ImportedColors: Story = {
  render: (args) => <SelectableGrid {...args} />,
  args: {
    content: {
      values: valuesOf(inProgress),
      position: {
        ...enter(enter(inProgress, [3], 'center', 6), [5], 'corner', 2).position,
        importedCellColors: {
          2: ['blueHeavy', 'yellow'],
          3: ['cyan'],
          5: ['lime', 'magenta', 'orange'],
        },
        importedCandidateColors: {
          3: { 6: 'purpleHeavy' },
          5: { 2: 'orangeHeavy' },
        },
      },
    },
    appearance: { candidateLayout: 'center-corner' },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}

export const ImportedQuickDraw: Story = {
  render: (args) => <SelectableGrid {...args} />,
  args: {
    content: {
      values: valuesOf(inProgress),
      position: {
        ...inProgress.position,
        importedDrawings: [
          {
            shape: 'line',
            from: [0.5, 0.5],
            to: [2.5, 2.5],
            color: 'purpleHeavy',
          },
          { shape: 'line', from: [0, 1], to: [2, 1], color: 'orangeHeavy' },
          { shape: 'cross', at: [2, 1.5], color: 'redHeavy' },
          { shape: 'square', at: [4.5, 2.5], color: 'greenHeavy' },
          { shape: 'circle', at: [3.5, 3.5], color: 'blueHeavy' },
        ],
      },
    },
  },
  decorators: [
    (Story) => (
      <Width width={320}>
        <Story />
      </Width>
    ),
  ],
}

export const ConflictingDigits: Story = {
  render: (args) => {
    const values = valuesOf(enter(starter, [2], 'value', 5))
    return <Board {...args} content={{ ...args.content, values }} appearance={{ ...args.appearance, errors: conflictsOf(values) }} />
  },
}
export const CroppedChain: Story = {
  render: (args) => {
    const example = lessonExamples['xy-chain']
    const { annotations, region } = lessonDiagram(example)
    return (
      <LessonFrame>
        <Board
          {...args}
          content={{
            ...args.content,
            givens: example.givens,
            values: lessonValues(example),
            candidates: example.candidates,
          }}
          appearance={{ ...args.appearance, annotations, region }}
        />
      </LessonFrame>
    )
  },
}

function SelectableGrid(props: ComponentProps<typeof Board>) {
  const [selected, setSelected] = useState(2)
  return (
    <Board
      {...props}
      interaction={{
        ...props.interaction,
        active: selected,
        selected: [selected],
        onCell: setSelected,
      }}
    />
  )
}
