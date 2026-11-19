import { calcudokuCatalog, type CalcudokuEntry } from '../calcudoku/catalog'
import { operatorSymbol } from '../calcudoku/engine'
import { cellLabel, checkLatin, findLatinHints, solveLatin } from '../latin/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberGameConfig } from './NumberPuzzle'

const calcudoku: NumberGameConfig<CalcudokuEntry> = {
  game: 'calcudoku',
  name: 'Calcudoku',
  rules: 'Use every number from 1 to the grid size once in each row and column. Each cage’s numbers must match its target and operation.',
  techniques: ['Row and column', 'Cage arithmetic'],
  entries: calcudokuCatalog,
  board: ({ puzzle }) => {
    const { size, cages, givens } = puzzle
    const cageAt = new Map(cages.flatMap(cage => cage.cells.map(cell => [cell, cage] as const)))
    const cells = givens.map((given, cell) => {
      const cage = cageAt.get(cell)!
      const anchor = Math.min(...cage.cells)
      const symbol = operatorSymbol[cage.operator]
      const edges = [
        cell < size || cageAt.get(cell - size) !== cage ? 't' : '',
        cell % size === size - 1 || cageAt.get(cell + 1) !== cage ? 'r' : '',
        cell >= size * (size - 1) || cageAt.get(cell + size) !== cage ? 'b' : '',
        cell % size === 0 || cageAt.get(cell - 1) !== cage ? 'l' : '',
      ].join('')
      const operation = { add: 'plus', subtract: 'minus', multiply: 'times', divide: 'divided by', equal: '' }[cage.operator]
      return {
        given,
        edges,
        label: given ? undefined : `${cage.target} ${operation} cage at ${cellLabel(anchor, size)}`,
        decoration: cell === anchor && !given
          ? <span className="number-puzzle-cell-label" aria-hidden="true">{cage.target}{symbol}</span> : undefined,
      }
    })

    return {
      width: size,
      height: size,
      maxValue: size,
      cells,
      check: values => {
        const { complete, conflicts } = checkLatin(puzzle, values)
        return { complete, marked: conflicts.flatMap(rule => rule.cells.filter(cell => values[cell] || givens[cell])) }
      },
      solve: () => {
        const result = solveLatin(puzzle)
        return result.status === 'unique' ? result.solution : null
      },
      hints: (values, limit) => findLatinHints(puzzle, values, limit).map(hint => ({
        cell: hint.cell,
        value: hint.value,
        technique: hint.rules[0].kind === 'line' ? 'Row and column' : 'Cage arithmetic',
        marked: hint.rules.flatMap(rule => rule.cells),
        reasons: hint.rules.map(rule => rule.label),
      })),
    }
  },
}

export function CalcudokuDifficultyPage() {
  return <NumberGameDifficulty config={calcudoku} />
}

export function CalcudokuPlay({ entry }: { entry: CalcudokuEntry }) {
  return <NumberGamePlay config={calcudoku} entry={entry} />
}
