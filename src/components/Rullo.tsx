import { rulloCatalog, type RulloEntry } from '../rullo/catalog'
import { checkRullo, findRulloHints, KEEP, REMOVE, solveRullo, type RulloPuzzle } from '../rullo/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberBoard, type NumberGameConfig } from './NumberPuzzle'
import './rullo.css'

const techniques = ['Line sum', 'Crossing line sums']

function rulloBoard(puzzle: RulloPuzzle): NumberBoard {
  const width = puzzle.width + 1
  const height = puzzle.height + 1
  const cells: NumberBoard['cells'][number][] = Array.from({ length: width * height }, () => ({ block: true }))
  const gridCells = puzzle.numbers.map((printed, cell) => {
    const gridCell = Math.floor(cell / puzzle.width) * width + cell % puzzle.width
    cells[gridCell] = { printed }
    return gridCell
  })
  const clueCell = (line: RulloPuzzle['lines'][number]) => line.axis === 'row'
    ? line.index * width + puzzle.width : puzzle.height * width + line.index
  for (const line of puzzle.lines) {
    cells[clueCell(line)] = {
      block: true,
      label: `${line.axis === 'row' ? 'Row' : 'Column'} ${line.index + 1} target ${line.target}`,
      decoration: <span className="rullo-target" aria-hidden="true">{line.target}</span>,
    }
  }

  const decisions = (values: readonly number[]) => gridCells.map(cell => values[cell] ?? 0)
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
    hints: (values, limit) => findRulloHints(puzzle, decisions(values), limit).map(({ cell, value, steps }) => ({
      cell: gridCells[cell], value,
      technique: steps.length === 1 ? techniques[0] : techniques[1],
      marked: steps.map(step => clueCell(step.line)),
      renderExplanation: cellName => <details className="number-puzzle-help">
        <summary>Show hint steps</summary>
        <ol>{steps.map(({ line, combinations, decisions }, index) => <li key={index}>
          <strong>{line.axis === 'row' ? 'Row' : 'Column'} {line.index + 1} needs a total of {line.target}.</strong>
          <p>{combinations === 1 ? 'Only one combination fits.' : `${combinations} combinations fit.`}</p>
          <ul>{decisions.map(({ cell, value }) => <li key={cell}>
            {value === KEEP ? 'Keep' : 'Remove'} {puzzle.numbers[cell]} in {cellName(gridCells[cell])}.
          </li>)}</ul>
        </li>)}</ol>
      </details>,
    })),
  }
}

export const rullo = {
  game: 'rullo',
  name: 'Rullo',
  rules: 'Select a cell to remove its number. Select it again to put the number back. The numbers left in each row and column must add up to its target.',
  techniques,
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
