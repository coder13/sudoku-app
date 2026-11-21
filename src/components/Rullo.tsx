import { rulloCatalog, type RulloEntry } from '../rullo/catalog'
import { checkRullo, createRulloHintFinder, findRulloSolutionHints, KEEP, REMOVE, rulloTechniques, solveRullo, type RulloHint, type RulloPuzzle } from '../rullo/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberBoard, type NumberGameConfig } from './NumberPuzzle'
import './rullo.css'

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

type RulloLine = RulloPuzzle['lines'][number]
type RulloStep = RulloHint['steps'][number]

function lineName(line: RulloLine) {
  return `${line.axis === 'row' ? 'Row' : 'Column'} ${line.index + 1}`
}

function stepLines(step: RulloStep): RulloLine[] {
  if ('line' in step) return [step.line]
  if ('assumption' in step) return [...step.deductions.map(deduction => deduction.line), step.rejectedBy]
  const crossings = step.comparison?.rejected.map(({ crossing }) => crossing) ?? step.crossings
  return [...step.lines, ...crossings]
}

const pairOptionNames = ['A', 'B']

function RulloPairComparison({ step, describeCell }: {
  step: Extract<RulloStep, { lines: readonly RulloLine[] }>
  describeCell: (cell: number) => string
}) {
  const { comparison, lines } = step
  if (!comparison) return null
  return <>
    <p>Each line has two options before this deduction.</p>
    {comparison.options.map((options, index) => {
      const line = lines[index]
      return <div key={line.index}>
        <strong>{lineName(line)}</strong>
        <ul>{options.map((mask, option) => {
          const cells = line.cells.filter((_, offset) => mask & (1 << offset))
          return <li key={mask}>Option {pairOptionNames[option]} keeps {list.format(cells.map(describeCell))}.</li>
        })}</ul>
      </div>
    })}
    <ul>{comparison.rejected.map(({ options: [first, second], crossing }) =>
      <li key={first * 2 + second}>
        {lineName(lines[0])} option {pairOptionNames[first]} and {lineName(lines[1]).toLowerCase()} option {pairOptionNames[second]} fail.
        {' '}{lineName(crossing)} cannot reach {crossing.target}.
      </li>
    )}</ul>
  </>
}

function RulloHintSteps({ steps, describeCell }: {
  steps: RulloHint['steps']; describeCell: (cell: number) => string
}) {
  function decisionList(decisions: RulloStep['decisions']) {
    return <ul>{decisions.map(({ cell, value }) => <li key={cell}>
      {value === KEEP ? 'Keep' : 'Remove'} {describeCell(cell)}.
    </li>)}</ul>
  }

  function lineExplanation({ line, combinations }: Extract<RulloStep, { line: RulloLine }>) {
    return <>
      <strong>{lineName(line)} needs a total of {line.target}.</strong>
      <p>{combinations === 1 ? 'Only one combination fits.' : `${combinations} combinations fit.`}</p>
    </>
  }

  return <details className="number-puzzle-help">
    <summary>Show hint steps</summary>
    <ol>{steps.map((step, index) => <li key={index}>
      {'line' in step ? lineExplanation(step) : 'assumption' in step ? <>
        <strong>If you {step.assumption.value === KEEP ? 'keep' : 'remove'} {describeCell(step.assumption.cell)}, these choices follow.</strong>
        <ol>{step.deductions.map((deduction, index) => <li key={index}>
          {lineExplanation(deduction)}
          {decisionList(deduction.decisions)}
        </li>)}</ol>
        <p>No combination in {lineName(step.rejectedBy).toLowerCase()} adds up to {step.rejectedBy.target}.</p>
      </> : <>
        <strong>{step.lines[0].axis === 'row' ? 'Rows' : 'Columns'} {list.format(step.lines.map(line => String(line.index + 1)))}
          {' '}need totals of {list.format(step.lines.map(line => String(line.target)))}.</strong>
        {step.lines.length === 2 ? <p>{step.combinations === 1 ? 'Only one pair of choices fits the highlighted crossing targets.'
          : `Only ${step.combinations} pairs of choices fit the highlighted crossing targets.`}</p>
          : <p>{step.combinations === 1 ? 'Only one set of choices fits all the highlighted targets.'
            : `Only ${step.combinations} sets of choices fit all the highlighted targets.`}</p>}
        <RulloPairComparison step={step} describeCell={describeCell} />
      </>}
      {decisionList(step.decisions)}
    </li>)}</ol>
  </details>
}

function rulloBoard(puzzle: RulloPuzzle): NumberBoard {
  const width = puzzle.width + 1
  const height = puzzle.height + 1
  const cells: NumberBoard['cells'][number][] = Array.from({ length: width * height }, () => ({ block: true }))
  const gridCells = puzzle.numbers.map((printed, cell) => {
    const gridCell = Math.floor(cell / puzzle.width) * width + cell % puzzle.width
    cells[gridCell] = { printed }
    return gridCell
  })
  const clueCell = (line: RulloLine) => line.axis === 'row'
    ? line.index * width + puzzle.width : puzzle.height * width + line.index
  for (const line of puzzle.lines) {
    cells[clueCell(line)] = {
      block: true,
      label: `${lineName(line)} target ${line.target}`,
      decoration: <span className="rullo-target" aria-hidden="true">{line.target}</span>,
    }
  }

  const findHints = createRulloHintFinder(puzzle)
  const decisions = (values: readonly number[]) => gridCells.map(cell => values[cell] ?? 0)
  const numberHint = ({ cell, value, steps, technique }: RulloHint) => ({
    cell: gridCells[cell], value, technique,
    marked: steps.flatMap(stepLines).map(clueCell),
    renderExplanation: (cellName: (cell: number) => string) => <RulloHintSteps steps={steps}
      describeCell={cell => `${puzzle.numbers[cell]} in ${cellName(gridCells[cell])}`} />,
  })
  return {
    width, height, maxValue: REMOVE, cells,
    cellChoices: { labels: ['Keep', 'Remove'], off: REMOVE },
    mirrorEdgeClues: true,
    check: (values, mode) => {
      const { complete, conflicts } = checkRullo(puzzle, decisions(values), { keepUnmarked: mode !== 'solution' })
      return { complete, marked: conflicts.map(clueCell) }
    },
    solve: () => {
      const { status, solution } = solveRullo(puzzle)
      if (status !== 'unique' || !solution) return null
      const values = cells.map(() => 0)
      gridCells.forEach((cell, index) => { values[cell] = solution[index] })
      return values
    },
    hints: (values, limit) => findHints(decisions(values), limit).map(numberHint),
    solutionHints: values => findRulloSolutionHints(puzzle, decisions(values)).map(numberHint),
  }
}

export const rullo = {
  game: 'rullo',
  name: 'Rullo',
  difficultyDescriptions: {
    easy: '5 × 5 grid. Use one total at a time.',
    medium: '6 × 6 grid. Some puzzles compare crossing totals.',
    hard: '8 × 8 grid. Some puzzles compare totals or test a choice.',
  },
  rules: 'Select a cell to remove its number. Select it again to put the number back. The numbers left in each row and column must add up to its target.',
  techniques: rulloTechniques,
  entries: rulloCatalog,
  hasClueCells: true,
  board: ({ puzzle }) => rulloBoard(puzzle),
} satisfies NumberGameConfig<RulloEntry>

export function RulloDifficultyPage() {
  return <NumberGameDifficulty config={rullo} />
}

export function RulloPlay({ entry }: { entry: RulloEntry }) {
  return <NumberGamePlay config={rullo} entry={entry} />
}
