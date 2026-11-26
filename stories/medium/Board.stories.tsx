import { useEffect, useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import type { SizedConstraintRule, VariantPuzzle } from '../../src/sudoku/engine'
import { projectFogPuzzle } from '../../src/sudoku/fog'
import { conflictsOf, enter, paintCandidates, valuesOf } from '../../src/sudoku/game'
import { fiveJigsawForSeed, FIVE_BOXLESS_GRID, MINI_GRID, NINE_BOXLESS_GRID, SEVEN_BOXLESS_GRID, SIX_BOXLESS_GRID, type SizedGrid } from '../../src/sudoku/grid'
import { decodeSudokuCoachPayload } from '../../src/sudoku/puzzle-import/sudoku-coach'
import { coachNonogramRules } from '../../src/sudoku/coach-nonogram'
import { coachSkyscrapersRules } from '../../src/sudoku/coach-skyscrapers'
import { sizedRuleDescriptions } from '../../src/sudoku/sized-rule-game'
import { variantRuleDescriptions } from '../../src/sudoku/variants'
import { lessonDiagram, lessonValues } from '../../src/sudoku/lesson-diagram'
import { decodeCoachSix, detectPuzzle } from '../../src/sudoku/puzzle-import.ts'
import authoredLayers from '../../tests/fixtures/sudoku-coach-authored-layers.json'
import coachNonogram from '../../tests/fixtures/sized-coach-nonogram.json'
import coachSkyscrapers from '../../tests/fixtures/skyscrapers-unsupported-9W3o.json'
import coachCrust from '../../tests/fixtures/sudoku-coach-crust.json'
import coachRowEquations from '../../tests/fixtures/coach-row-equations.json'
import coachFractionalRegions from '../../tests/fixtures/coach-fractional-regions.json'
import coachUnknownCageSums from '../../tests/fixtures/sudoku-coach-unknown-cage-totals.json'
import coachDistantNeighbors from '../../tests/fixtures/sudoku-coach-distant-neighbors.json'
import coachWrappedJigsaw from '../../tests/fixtures/coach-mini-wrapped-jigsaw.json'
import coachEntropy from '../../tests/fixtures/entropic-coach.json'
import coachLittleKillerBetween from '../../tests/fixtures/little-killer-between-GJBz.json'
import zipperRegionSum from '../../tests/fixtures/zipper-region-sum.json'
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

function CoachNonogramBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; solution: string; rules: ReturnType<typeof coachNonogramRules> }>()
  useEffect(() => {
    void decodeSudokuCoachPayload(coachNonogram.sudoku).then(payload => setPuzzle({
      givens: String(payload.givenDigits ?? '0'.repeat(36)),
      solution: coachNonogram.solution,
      rules: coachNonogramRules(payload.givenConstraints as unknown[], 6, coachNonogram.description),
    }))
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach Nonogram…</p>
  return <div>
    <p>{sizedRuleDescriptions(SIX_BOXLESS_GRID, puzzle.rules).join(' ')}</p>
    <Board grid={SIX_BOXLESS_GRID} givens={puzzle.givens} values={finished ? puzzle.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [13]} />
  </div>
}

export const CoachNonogramUnfinished: Story = { render: () => <CoachNonogramBoard /> }
export const CoachNonogramFinished: Story = { render: () => <CoachNonogramBoard finished /> }

function SizedAdjacentTotalBoard({ finished = false }: { finished?: boolean }) {
  const givens = '0'.repeat(36)
  const solution = '413652625314234561156243542136361425'
  const rules: SizedConstraintRule[] = [{ type: 'adjacent-total', cells: [2, 3], sum: 9 }]
  return <div>
    <p>{sizedRuleDescriptions(SIX_BOXLESS_GRID, rules).join(' ')}</p>
    <Board grid={SIX_BOXLESS_GRID} givens={givens} values={finished ? solution : givens}
      sizedRules={rules} showGuides selected={finished ? [] : [2]} />
  </div>
}

export const SizedAdjacentTotalUnfinished: Story = { render: () => <SizedAdjacentTotalBoard /> }
export const SizedAdjacentTotalFinished: Story = { render: () => <SizedAdjacentTotalBoard finished /> }

function CoachLittleKillerBetweenBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; grid: SizedGrid; rules: readonly SizedConstraintRule[] }>()
  useEffect(() => {
    void decodeCoachSix(coachLittleKillerBetween.metadata.sudoku).then(imported => {
      if (imported.grid) setPuzzle({ givens: imported.givens, grid: imported.grid, rules: imported.rules })
    })
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach Little Killer and Between Lines puzzle…</p>
  return <div>
    <p>{sizedRuleDescriptions(puzzle.grid, puzzle.rules).join(' ')}</p>
    <Board grid={puzzle.grid} givens={puzzle.givens} values={finished ? coachLittleKillerBetween.metadata.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [15]} />
  </div>
}

export const CoachLittleKillerBetweenUnfinished: Story = { render: () => <CoachLittleKillerBetweenBoard /> }
export const CoachLittleKillerBetweenFinished: Story = { render: () => <CoachLittleKillerBetweenBoard finished /> }

function CoachSkyscrapersBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; solution: string; rules: ReturnType<typeof coachSkyscrapersRules> }>()
  useEffect(() => {
    void decodeSudokuCoachPayload(coachSkyscrapers.metadata.sudoku).then(payload => setPuzzle({
      givens: String(payload.givenDigits ?? '0'.repeat(49)),
      solution: coachSkyscrapers.metadata.solution,
      rules: coachSkyscrapersRules(payload.givenConstraints as unknown[], 7, coachSkyscrapers.metadata.description),
    }))
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach Skyscrapers puzzle…</p>
  return <div>
    <p>{sizedRuleDescriptions(SEVEN_BOXLESS_GRID, puzzle.rules).join(' ')}</p>
    <Board grid={SEVEN_BOXLESS_GRID} givens={puzzle.givens} values={finished ? puzzle.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [17]} />
  </div>
}

export const CoachSkyscrapersUnfinished: Story = { render: () => <CoachSkyscrapersBoard /> }
export const CoachSkyscrapersFinished: Story = { render: () => <CoachSkyscrapersBoard finished /> }

function CoachRowEquationBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; grid: SizedGrid; rules: readonly SizedConstraintRule[] }>()
  useEffect(() => {
    void detectPuzzle(coachRowEquations.code).then(imported => {
      if (imported.grid && imported.sizedRules) setPuzzle({ givens: imported.givens, grid: imported.grid, rules: imported.sizedRules })
    })
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach row-equation puzzle…</p>
  return <div>
    <p>{sizedRuleDescriptions(puzzle.grid, puzzle.rules).join(' ')}</p>
    <Board grid={puzzle.grid} givens={puzzle.givens} values={finished ? coachRowEquations.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [13]} />
  </div>
}

export const CoachRowEquationsUnfinished: Story = { render: () => <CoachRowEquationBoard /> }
export const CoachRowEquationsFinished: Story = { render: () => <CoachRowEquationBoard finished /> }

function CoachFractionalRegionsBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; grid: SizedGrid; rules: readonly SizedConstraintRule[] }>()
  useEffect(() => {
    void detectPuzzle(coachFractionalRegions.code).then(imported => {
      if (imported.grid && imported.sizedRules) setPuzzle({ givens: imported.givens, grid: imported.grid, rules: imported.sizedRules })
    })
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach fractional-region puzzle…</p>
  return <div>
    <p>{sizedRuleDescriptions(puzzle.grid, puzzle.rules).join(' ')}</p>
    <Board grid={puzzle.grid} givens={puzzle.givens} values={finished ? coachFractionalRegions.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [12]} />
  </div>
}

export const CoachFractionalRegionsUnfinished: Story = { render: () => <CoachFractionalRegionsBoard /> }
export const CoachFractionalRegionsFinished: Story = { render: () => <CoachFractionalRegionsBoard finished /> }

function CoachUnknownCageSumsBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<VariantPuzzle>()
  useEffect(() => {
    void detectPuzzle(coachUnknownCageSums.code).then(imported => setPuzzle(imported.variant?.puzzle))
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach unknown-cage puzzle…</p>
  return <div>
    <p>{variantRuleDescriptions(puzzle).join(' ')}</p>
    <Board variantPuzzle={puzzle} givens={puzzle.givens} values={finished ? coachUnknownCageSums.solution : puzzle.givens}
      showGuides selected={finished ? [] : [20]} />
  </div>
}

export const CoachUnknownCageSumsUnfinished: Story = { render: () => <CoachUnknownCageSumsBoard /> }
export const CoachUnknownCageSumsFinished: Story = { render: () => <CoachUnknownCageSumsBoard finished /> }

function CoachDistantNeighborsBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<VariantPuzzle>()
  useEffect(() => {
    void detectPuzzle(coachDistantNeighbors.code).then(imported => setPuzzle(imported.variant?.puzzle))
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach Distant Neighbors puzzle…</p>
  return <div>
    <p>{variantRuleDescriptions(puzzle).join(' ')}</p>
    <Board variantPuzzle={puzzle} givens={puzzle.givens} values={finished ? coachDistantNeighbors.solution : puzzle.givens}
      showGuides selected={finished ? [] : [40]} />
  </div>
}

export const CoachDistantNeighborsUnfinished: Story = { render: () => <CoachDistantNeighborsBoard /> }
export const CoachDistantNeighborsFinished: Story = { render: () => <CoachDistantNeighborsBoard finished /> }

function CoachWrappedJigsawBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; grid: SizedGrid; rules: readonly SizedConstraintRule[] }>()
  useEffect(() => {
    void detectPuzzle(coachWrappedJigsaw.code).then(imported => {
      if (imported.grid && imported.sizedRules) setPuzzle({ givens: imported.givens, grid: imported.grid, rules: imported.sizedRules })
    })
  }, [])
  if (!puzzle) return <p>Loading the published Sudoku Coach wrapped Jigsaw…</p>
  return <div>
    <p>Regions connect across opposite edges. Dashed edges mark the matching wraparound seams.</p>
    <p>{sizedRuleDescriptions(puzzle.grid, puzzle.rules).join(' ')}</p>
    <Board grid={puzzle.grid} givens={puzzle.givens} values={finished ? coachWrappedJigsaw.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [5]} />
  </div>
}

export const CoachWrappedJigsawUnfinished: Story = { render: () => <CoachWrappedJigsawBoard /> }
export const CoachWrappedJigsawFinished: Story = { render: () => <CoachWrappedJigsawBoard finished /> }

function ZipperRegionSumBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; grid: SizedGrid; rules: readonly SizedConstraintRule[] }>()
  useEffect(() => {
    void detectPuzzle(zipperRegionSum.code).then(imported => {
      if (imported.grid && imported.sizedRules) setPuzzle({ givens: imported.givens, grid: imported.grid, rules: imported.sizedRules })
    })
  }, [])
  if (!puzzle) return <p>Loading the Zipper and Region Sum puzzle…</p>
  return <div>
    <p>{sizedRuleDescriptions(puzzle.grid, puzzle.rules).join(' ')}</p>
    <Board grid={puzzle.grid} givens={puzzle.givens} values={finished ? zipperRegionSum.solution : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [7]} />
  </div>
}

export const ZipperRegionSumUnfinished: Story = { render: () => <ZipperRegionSumBoard /> }
export const ZipperRegionSumFinished: Story = { render: () => <ZipperRegionSumBoard finished /> }

const coachCrustEdgeCount = coachCrust.find(source => source.id === '9Z8C')!
function CoachCrustBoard({ finished = false }: { finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<{ givens: string; rules: NonNullable<Awaited<ReturnType<typeof detectPuzzle>>['sizedRules']> }>()
  useEffect(() => {
    void detectPuzzle(coachCrustEdgeCount.code).then(imported => {
      if (imported.sizedRules) setPuzzle({ givens: imported.givens, rules: imported.sizedRules })
    })
  }, [])
  if (!puzzle) return <p>Loading the published 9×9 Crust of Edge-Count puzzle…</p>
  return <div>
    <p>{sizedRuleDescriptions(NINE_BOXLESS_GRID, puzzle.rules).join(' ')}</p>
    <Board grid={NINE_BOXLESS_GRID} givens={puzzle.givens} values={finished ? coachCrustEdgeCount.solution! : puzzle.givens}
      sizedRules={puzzle.rules} showGuides selected={finished ? [] : [42]} />
  </div>
}

export const CoachCrustEdgeCountUnfinished: Story = { render: () => <CoachCrustBoard /> }
export const CoachCrustEdgeCountFinished: Story = { render: () => <CoachCrustBoard finished /> }

const coachEntropyExamples = coachEntropy.examples as { url: string; title: string; code: string; solution: string }[]
const coachEntropySpiral = coachEntropyExamples.find(example => example.url.endsWith('/LEjN'))!
const coachEntropyOrder = coachEntropyExamples.find(example => example.url.endsWith('/7nms'))!
function CoachEntropyBoard({ source, finished = false }: { source: typeof coachEntropySpiral; finished?: boolean }) {
  const [puzzle, setPuzzle] = useState<VariantPuzzle>()
  useEffect(() => {
    void detectPuzzle(source.code).then(imported => setPuzzle(imported.variant?.puzzle))
  }, [source])
  if (!puzzle) return <p>Loading the published Sudoku Coach {source.title} puzzle…</p>
  return <div>
    <p>{source.title === 'Entropic Order'
      ? 'At each L/M/H clue, the digits in that group appear in ascending order along the marked row or column.'
      : 'At each broken connection, at least one neighboring Entropic triple does not contain all three digit groups.'}</p>
    <Board variantPuzzle={puzzle} givens={puzzle.givens} values={finished ? source.solution : puzzle.givens}
      showGuides selected={finished ? [] : [40]} />
  </div>
}

export const CoachEntropicSpiralUnfinished: Story = { render: () => <CoachEntropyBoard source={coachEntropySpiral} /> }
export const CoachEntropicSpiralFinished: Story = { render: () => <CoachEntropyBoard source={coachEntropySpiral} finished /> }
export const CoachEntropicOrderUnfinished: Story = { render: () => <CoachEntropyBoard source={coachEntropyOrder} /> }
export const CoachEntropicOrderFinished: Story = { render: () => <CoachEntropyBoard source={coachEntropyOrder} finished /> }

export const AuthoredCellFills: Story = {
  args: {
    givenCellColors: { 10: ['orange'], 11: ['orange'], 12: ['green'], 19: ['orange'], 20: ['orange', 'green'] },
    selected: [11],
    showPlayerColors: false,
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
export const AuthoredVariantArtwork: Story = {
  args: {
    authoredArtwork: [
      { type: 'outline', points: [[1, 1], [4, 1], [4, 4], [1, 4], [1, 1]], thickness: .05 },
      { type: 'disc', center: [4.5, 4.5], radius: .225, color: '#2a2a2a' },
    ],
    showImportedAnnotations: false,
    selected: [40],
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
export const GlobalEntropyShapeWindows: Story = {
  args: {
    variantPuzzle: {
      version: 1,
      givens: '0'.repeat(81),
      rules: [
        { type: 'global-entropy' },
        { type: 'entropy-window-group', cells: [0, 1, 9, 10], group: 'low' },
        { type: 'entropy-window-group', cells: [13, 14, 22, 23], group: 'middle' },
        { type: 'entropy-window-group', cells: [24, 25, 33, 34], group: 'high' },
      ],
    },
    authoredArtwork: [{ type: 'text', center: [4.5, 4.5], text: 'RP', size: .455, color: '#ffa852',
      opacity: 188, outlineColor: '#f77c00', outlineThickness: .01, offsetY: .07 }],
    selected: [14],
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const RaumploximentroplanerClues: Story = {
  args: {
    givens: '0'.repeat(81),
    values: '0'.repeat(81),
    variantPuzzle: {
      version: 1,
      givens: '0'.repeat(81),
      rules: [
        { type: 'neighbor-match', clues: [
          { cell: 35, digit: 6 }, { cell: 26, digit: 6 }, { cell: 16, digit: 4 }, { cell: 36, digit: 4 },
          { cell: 45, digit: 5 }, { cell: 67, digit: 6 }, { cell: 78, digit: 4 }, { cell: 13, digit: 1 },
          { cell: 37, digit: 2 }, { cell: 72, digit: 9 }, { cell: 55, digit: 3 }, { cell: 2, digit: 2 },
          { cell: 1, digit: 7 }, { cell: 70, digit: 8 }, { cell: 57, digit: 1 }, { cell: 52, digit: 7 },
          { cell: 23, digit: 8 },
        ] },
        { type: 'entropic', cells: [15, 16, 17, 26, 35, 25, 24, 33, 34, 43, 53, 44] },
        { type: 'entropic', cells: [36, 27, 37, 46, 47, 56, 55, 45, 54, 63, 64, 65] },
        { type: 'entropic', cells: [5, 13, 12, 21, 20, 11, 3, 2, 1, 10, 19] },
        { type: 'entropic', cells: [61, 70, 79, 78, 77, 69, 60, 59, 68, 67, 75] },
      ],
    },
    authoredArtwork: [
      [[8.125, 3.75], '6'], [[8.125, 2.75], '6'], [[7.125, 1.75], '4'], [[.125, 4.75], '4'],
      [[.125, 5.75], '5'], [[4.125, 7.75], '6'], [[6.125, 8.75], '4'], [[4.125, 1.75], '1'],
      [[1.125, 4.75], '2'], [[.125, 8.75], '9'], [[1.125, 6.75], '3'], [[2.125, .75], '2'],
      [[1.125, .75], '7'], [[7.125, 7.75], '8'], [[3.125, 6.75], '1'], [[7.125, 5.75], '7'],
      [[5.125, 2.75], '8'],
    ].map(([center, text]) => ({ type: 'text' as const, center: center as [number, number], text: text as string,
      size: .195, color: '#ff8080', opacity: 255, outlineColor: '#ff8080', outlineThickness: 0, offsetY: .08 })),
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}

const aqreSnakeGivens = '000000007000000000000000000008000000000000000000000003600000000000000000000000000'
const aqrePlusGivens = '000001030300020000000000100400302000000000002600000020000004000000000003003000201'
const aqreSnakeRegions = [
  { cells: [0, 1, 2, 3, 11, 12, 20], count: { type: 'digit-cell' as const, cell: 1 } },
  { cells: [4, 5] },
  { cells: [6, 14, 15, 16], count: { type: 'digit-cell' as const, cell: 14 } },
  { cells: [7, 8], count: { type: 'fixed' as const, value: 0 } },
  { cells: [9, 18, 27, 28], count: { type: 'digit-cell' as const, cell: 27 } },
  { cells: [10, 19], count: { type: 'digit-cell' as const, cell: 10 } },
  { cells: [13, 21, 22], count: { type: 'digit-cell' as const, cell: 21 } },
  { cells: [17, 23, 24, 25, 26, 35], count: { type: 'digit-cell' as const, cell: 24 } },
  { cells: [29, 30, 31, 39], count: { type: 'fixed' as const, value: 0 } },
  { cells: [32], count: { type: 'digit-cell' as const, cell: 32 } },
  { cells: [33, 34], count: { type: 'fixed' as const, value: 0 } },
  { cells: [36, 37, 38, 45, 47], count: { type: 'fixed' as const, value: 2 } },
  { cells: [40, 41], count: { type: 'digit-cell' as const, cell: 41 } },
  { cells: [42, 51, 60, 68, 69, 77], count: { type: 'fixed' as const, value: 4 } },
  { cells: [43, 44, 52, 53, 61], count: { type: 'digit-cell' as const, cell: 53 } },
  { cells: [46, 55, 64, 65], count: { type: 'digit-cell' as const, cell: 65 } },
  { cells: [48, 49, 50, 57, 58, 59], count: { type: 'digit-cell' as const, cell: 59 } },
  { cells: [54, 63], count: { type: 'digit-cell' as const, cell: 63 } },
  { cells: [56], count: { type: 'digit-cell' as const, cell: 56 } },
  { cells: [62, 70, 71, 78, 79, 80], count: { type: 'digit-cell' as const, cell: 80 } },
  { cells: [66, 67, 75, 76], count: { type: 'digit-cell' as const, cell: 67 } },
  { cells: [72, 73, 74], count: { type: 'fixed' as const, value: 0 } },
]
const aqrePlusRegions = [
  [0, 1, 2, 9, 10, 18], [3, 4, 11, 12, 13], [5, 6, 14, 15], [7, 8, 16, 17, 26],
  [19, 20, 27, 28, 29], [21, 30, 31, 39], [22, 23, 32], [24, 25, 33, 34, 35],
  [36, 37, 38, 45, 46, 47, 54, 55, 56], [40, 41, 48, 49, 50, 51, 52], [42, 43, 44],
  [53, 61, 62, 69, 70, 71], [57, 58, 59, 60, 66, 75], [63, 64, 65, 72, 73, 74],
  [67, 68, 76, 77, 78, 79], [80],
]
const aqrePlusCountCells = [9, 13, 5, 7, 27, 30, 32, 24, 45, 52, 44, 71, 59, 74, 78, 80]
const aqreSnakePuzzle: VariantPuzzle = { version: 1, givens: aqreSnakeGivens, rules: [
  { type: 'aqre', kind: 'snake', regions: aqreSnakeRegions, givenShades: [] },
] }
const aqrePlusPuzzle: VariantPuzzle = { version: 1, givens: aqrePlusGivens, rules: [
  { type: 'aqre', kind: 'plus', regions: aqrePlusRegions.map((cells, index) => ({ cells,
    count: { type: 'digit-cell' as const, cell: aqrePlusCountCells[index] } })), givenShades: [] },
  ...[[25, 34, 35], [67, 68, 77], [41, 42, 33], [73, 72, 63], [28, 20], [47, 55]].map(cells => ({ type: 'renban' as const, cells })),
] }

function AqreVariantExamples(args: ComponentProps<typeof Board>) {
  const finishedShades = Array.from({ length: 81 }, (_, cell) => {
    const row = Math.floor(cell / 9), column = cell % 9
    return (row + column) % 3 === 0 ? '1' : '2'
  }).join('')
  const snakeStarted = Array.from({ length: 81 }, () => '0')
  for (const cell of [0, 2, 4, 5, 25, 27, 45, 65]) snakeStarted[cell] = [2, 5, 27].includes(cell) ? '1' : '2'
  const plusStarted = Array.from({ length: 81 }, (_, cell) => cell % 9 < 2 && Math.floor(cell / 9) < 4
    ? ((Math.floor(cell / 9) + cell % 9) % 3 === 0 ? '1' : '2') : '0').join('')
  const examples = [
    { label: 'Aqre Snake · unfinished', puzzle: aqreSnakePuzzle, shades: snakeStarted.join('') },
    { label: 'Aqre Snake · finished', puzzle: aqreSnakePuzzle, shades: finishedShades },
    { label: 'Aqre+Renban · unfinished', puzzle: aqrePlusPuzzle, shades: plusStarted },
    { label: 'Aqre+Renban · finished', puzzle: aqrePlusPuzzle, shades: finishedShades },
  ]
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
    {examples.map(example => <figure key={example.label} style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{example.label}</figcaption>
      <Board {...args} givens={example.puzzle.givens} values={example.puzzle.givens} variantPuzzle={example.puzzle}
        aqreShades={example.shades} onCell={() => {}} />
    </figure>)}
  </div>
}

export const AqreShadeInput: Story = {
  render: args => <AqreVariantExamples {...args} />,
  decorators: [(Story) => <Width width={530}><Story /></Width>],
}

function AqreShadeControlsExample(args: ComponentProps<typeof Board>) {
  const [shades, setShades] = useState('0'.repeat(81))
  return <Board {...args} givens={aqrePlusGivens} values={aqrePlusGivens} variantPuzzle={aqrePlusPuzzle}
    aqreShades={shades} onCell={() => {}} onAqreShade={(cell, shade) => setShades(current =>
      current.slice(0, cell) + (shade === 'unknown' ? '0' : shade === 'unshaded' ? '1' : '2') + current.slice(cell + 1))} />
}

export const AqreShadeControls: Story = {
  render: args => <AqreShadeControlsExample {...args} />,
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}

function CoachShapeArtworkExample(args: ComponentProps<typeof Board>) {
  const [puzzle, setPuzzle] = useState<Awaited<ReturnType<typeof detectPuzzle>>>()
  useEffect(() => {
    let active = true
    const source = authoredLayers.examples.find(example => example.issue === 547)
    if (source) void detectPuzzle(source.code).then(result => { if (active) setPuzzle(result) })
    return () => { active = false }
  }, [])
  if (!puzzle) return <p>Loading the reviewed Coach export…</p>
  return <Board {...args} label="CS1G authored shapes" givens={puzzle.givens} values={puzzle.givens}
    variantPuzzle={puzzle.variant?.puzzle} authoredArtwork={puzzle.authoredArtwork} onCell={() => {}} />
}

export const CoachAuthoredShapeArtwork: Story = {
  render: args => <CoachShapeArtworkExample {...args} />,
  decorators: [(Story) => <Width width={530}><Story /></Width>],
}
export const MiniSudoku: Story = {
  args: { grid: MINI_GRID, givens: '0234341221434321', values: '0234341221434321',
    candidates: [1, ...Array<number>(15).fill(0)], selected: [0] },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
export const SixWithCombinedRules: Story = {
  args: {
    grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: '0'.repeat(36), values: '0'.repeat(36),
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
      { type: 'kropki', consecutive: { pairs: [[8, 9]] }, ratioTwo: { pairs: [[8, 9]] } },
    ],
    selected: [20], candidates: Array.from({ length: 36 }, (_, cell) => cell === 20 ? 0b101000 : 0),
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const EightWithTallBoxes: Story = {
  args: {
    grid: { size: 8, boxRows: 4, boxColumns: 2 },
    givens: '00000000'.repeat(8), values: '00000000'.repeat(8),
    selected: [9], candidates: Array.from({ length: 64 }, (_, cell) => cell === 9 ? 0b11111111 : 0),
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const FiveJigsaw: Story = {
  args: {
    grid: fiveJigsawForSeed(),
    givens: '0030000400000000100000002',
    values: '0030000400000000100000002',
    selected: [13], candidates: Array.from({ length: 25 }, (_, cell) => cell === 13 ? 0b11111 : 0),
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
export const SevenJigsawThermometer: Story = {
  args: {
    grid: {
      size: 7,
      regions: Array.from({ length: 7 }, (_, region) => [...'0000111020011122233312223434555343456664445556666']
        .flatMap((label, cell) => Number(label) === region ? [cell] : [])),
    },
    givens: '0'.repeat(49), values: '0'.repeat(49),
    sizedRules: [{ type: 'thermometer', cells: [8, 16, 24] }],
    selected: [24], candidates: Array.from({ length: 49 }, (_, cell) => cell === 24 ? 0b1100000 : 0),
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const SixDoubleArrows: Story = {
  args: {
    grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: '0'.repeat(36), values: '0'.repeat(36),
    sizedRules: [
      { type: 'double-arrow', ends: [0, 4], cells: [1, 2, 3] },
      { type: 'double-arrow', ends: [4, 22], cells: [10, 16] },
      { type: 'parity', parity: 'even', cells: [14] },
    ],
    selected: [4],
  },
  decorators: [(Story) => <Width width={350}><Story /></Width>],
}
export const LinkedDoubleArrowXSum: Story = {
  args: {
    grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: '0'.repeat(36), values: '0'.repeat(36),
    sizedRules: [
      { type: 'linked-double-arrow', ends: [{ direction: 'south', index: 1 }, { direction: 'east', index: 1 }], cells: [0] },
      { type: 'linked-double-arrow', ends: [{ direction: 'west', index: 3 }, { direction: 'north', index: 2 }], cells: [29, 28, 33] },
    ],
    selected: [0],
  },
  decorators: [(Story) => <Width width={365}><Story /></Width>],
}
export const SevenBoxlessKiller: Story = {
  args: {
    grid: SEVEN_BOXLESS_GRID, givens: '0'.repeat(49), values: '0'.repeat(49),
    sizedRules: [
      { type: 'killer-cages', cages: [{ cells: [0, 1, 2, 7, 8, 14], sum: 26 }, { cells: [3, 4], sum: 8 }] },
      { type: 'extra-house', cells: [6, 12, 18, 24, 30, 36, 42] },
    ],
    selected: [0],
  },
  decorators: [(Story) => <Width width={385}><Story /></Width>],
}
export const MiniRenbanLine: Story = {
  args: {
    grid: MINI_GRID, givens: '1000000000000000', values: '1000000000000000',
    sizedRules: [{ type: 'renban', cells: [0, 1, 5], segments: [[0, 1], [1, 5]] }],
    selected: [5],
  },
  decorators: [(Story) => <Width width={290}><Story /></Width>],
}
export const MiniKropkiDots: Story = {
  args: {
    grid: MINI_GRID, givens: '1000000000000000', values: '1000000000000000',
    sizedRules: [{ type: 'kropki', consecutive: { pairs: [[0, 1], [6, 10]] }, ratioTwo: { pairs: [[0, 1], [2, 6]] } }],
    selected: [1], active: 1,
  },
  decorators: [(Story) => <Width width={290}><Story /></Width>],
}
export const AlgebraicCageCaptions: Story = {
  args: {
    grid: MINI_GRID, givens: '0'.repeat(16), values: '0'.repeat(16),
    algebraicCages: [
      { type: 'algebraic-cage', cells: [4, 5], label: 'n+2', total: { type: 'variable', name: 'n', offset: 2 } },
      { type: 'algebraic-cage', cells: [8], label: 'n-1', total: { type: 'variable', name: 'n', offset: -1 } },
    ],
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}
const fogPuzzle = {
  version: 1,
  givens: '0'.repeat(81),
  rules: [
    { type: 'killer-cages', cages: [{ cells: [45, 46, 47], sum: 12 }] },
    { type: 'whispers', cells: [63, 64, 65], minDifference: 5 },
    { type: 'sandwich', cells: [79, 70, 61, 52, 43, 34, 25, 16, 7], direction: 'north', sum: 17 },
  ],
} satisfies VariantPuzzle
const fogCells = new Set([45, 46, 54, 55, 63, 64, 72, 73])
const fogEntries = '0'.repeat(54) + '8' + '0'.repeat(8) + '1' + '0'.repeat(17)
export const FogFragments: Story = {
  args: {
    variantPuzzle: fogPuzzle, fog: { entries: fogEntries, cells: fogCells, puzzle: projectFogPuzzle(fogPuzzle, fogCells) },
    givens: fogPuzzle.givens, values: fogEntries, selected: [54],
  },
  decorators: [(Story) => <Width width={340}><Story /></Width>],
}

export const WithoutGuides: Story = { args: { showGuides: false } }
export const CellSelection: Story = { render: (args) => <SelectableGrid {...args} /> }
const candidateExample = enter(enter(inProgress, [3, 5], 'center', 6), [2, 5], 'color', 4)
export const CandidatesAndColor: Story = {
  args: {
    values: valuesOf(inProgress),
    position: paintCandidates(candidateExample, [{ cell: 5, digit: 2, color: 2 }, { cell: 5, digit: 6, color: 5 }]).position,
    candidateLayout: 'center-corner',
    selected: [3, 5],
    highlightedDigit: 2,
  },
}
export const ImportedColors: Story = {
  render: args => <SelectableGrid {...args} />,
  args: {
    values: valuesOf(inProgress),
    position: {
      ...enter(enter(inProgress, [3], 'center', 6), [5], 'corner', 2).position,
      importedCellColors: { 2: ['blueHeavy', 'yellow'], 3: ['cyan'], 5: ['lime', 'magenta', 'orange'] },
      importedCandidateColors: { 3: { 6: 'purpleHeavy' }, 5: { 2: 'orangeHeavy' } },
    },
    candidateLayout: 'center-corner',
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
}

export const ImportedQuickDraw: Story = {
  render: args => <SelectableGrid {...args} />,
  args: {
    values: valuesOf(inProgress),
    position: { ...inProgress.position, importedDrawings: [
      { shape: 'line', from: [.5, .5], to: [2.5, 2.5], color: 'purpleHeavy' },
      { shape: 'line', from: [0, 1], to: [2, 1], color: 'orangeHeavy' },
      { shape: 'cross', at: [2, 1.5], color: 'redHeavy' },
      { shape: 'square', at: [4.5, 2.5], color: 'greenHeavy' },
      { shape: 'circle', at: [3.5, 3.5], color: 'blueHeavy' },
    ] },
  },
  decorators: [(Story) => <Width width={320}><Story /></Width>],
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
