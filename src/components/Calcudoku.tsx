import { useState } from 'react'
import { calcudokuCatalog, generatedCalcudokuEntry, type CalcudokuEntry } from '../calcudoku/catalog'
import { calcudokuImportOperators, importedOperatorNames, prepareImportedCalcudoku, type CalcudokuImport } from '../calcudoku/imported'
import { operatorSymbol, type CageOperator } from '../calcudoku/engine'
import { cellLabel, checkLatin, findLatinHints, solveLatin } from '../latin/engine'
import { Button } from './Button'
import { NumberGameDifficulty, NumberGamePlay, NumberPuzzlePreview, type NumberGameConfig } from './NumberPuzzle'
import { SelectControl } from './SelectControl'

export const calcudoku = {
  game: 'calcudoku',
  name: 'Calcudoku',
  rules: 'Use every number from 1 to the grid size once in each row and column. Each cage’s numbers must match its target and operation.',
  techniques: ['Row and column', 'Cage arithmetic'],
  entries: calcudokuCatalog,
  generatedEntry: generatedCalcudokuEntry,
  board: ({ puzzle, cageLabels, cellColors, ruleNotes }) => {
    const { size, cages, givens } = puzzle
    const cageAt = new Map(cages.flatMap(cage => cage.cells.map(cell => [cell, cage] as const)))
    const cells = givens.map((given, cell) => {
      const cage = cageAt.get(cell)!
      const anchor = Math.min(...cage.cells)
      const sourceLabel = cageLabels?.[anchor]
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
        color: cellColors?.[cell] || undefined,
        label: given && !sourceLabel ? undefined : `${cage.target}${operation ? ` ${operation}` : ''} cage at ${cellLabel(anchor, size)}${cage.distinct ? ', no repeats' : ''}`,
        decoration: cell === anchor && (sourceLabel || !given)
          ? <span className="number-puzzle-cell-label" aria-hidden="true">{sourceLabel ?? `${cage.target}${symbol}`}</span> : undefined,
      }
    })

    return {
      width: size,
      height: size,
      maxValue: size,
      cells,
      ruleNotes,
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
} satisfies NumberGameConfig<CalcudokuEntry>

export function CalcudokuImportChoices({ source, onResolve }: {
  source: CalcudokuImport
  onResolve: (entry: CalcudokuEntry) => void
}) {
  const [operators, setOperators] = useState<Partial<Record<number, CageOperator>>>({})
  const [error, setError] = useState('')
  const unsigned = source.cages.filter(cage => !cage.operator)
  return <form className="dialog-form" onSubmit={event => {
    event.preventDefault()
    try { onResolve(prepareImportedCalcudoku(source, operators)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The app could not check this puzzle.') }
  }}>
    <p>The export does not specify an operation for these cages. Choose the operation from the original puzzle rules.</p>
    {unsigned.map(cage => {
      const anchor = cage.cells[0]
      const options = calcudokuImportOperators(cage)
      return <label key={anchor}>
        {cage.label} cage at {cellLabel(anchor, source.size)}
        <SelectControl required value={operators[anchor] ?? ''} onChange={event => {
          const operation = options.find(option => option === event.target.value)
          setOperators(previous => ({ ...previous, [anchor]: operation }))
          setError('')
        }}>
          <option value="">Choose an operation</option>
          {options.map(operation => <option key={operation} value={operation}>{importedOperatorNames[operation]}</option>)}
        </SelectControl>
      </label>
    })}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <Button type="submit" variant="primary" disabled={unsigned.some(cage => !operators[cage.cells[0]])}>Check puzzle</Button>
    </div>
  </form>
}

export function CalcudokuImportPreview({ entry }: { entry: CalcudokuEntry }) {
  return <>
    <NumberPuzzlePreview board={calcudoku.board(entry)} game="calcudoku" label="Calcudoku puzzle preview" position={entry.initialPosition} />
    <p>{calcudoku.rules}</p>
    {Boolean(entry.ruleNotes?.length) && <ul className="import-preview-rules">
      {entry.ruleNotes?.map(rule => <li key={rule}>{rule}</li>)}
    </ul>}
  </>
}

export function CalcudokuDifficultyPage() {
  return <NumberGameDifficulty config={calcudoku} />
}

export function CalcudokuPlay({ entry }: { entry: CalcudokuEntry }) {
  return <NumberGamePlay config={calcudoku} entry={entry} />
}
