import { useState } from 'react'
import { calcudokuCatalog, generatedCalcudokuEntry, type CalcudokuEntry } from '../calcudoku/catalog'
import { calcudokuImportOperators, importedOperatorNames, prepareImportedCalcudoku, type CalcudokuImport } from '../calcudoku/imported'
import { operatorSymbol, type CageOperator } from '../calcudoku/engine'
import { adjacentClueNotes, adjacentClueTechnique } from '../latin/adjacent-clues'
import { cellLabel, checkLatin, findLatinHints, findLatinSolutionHints, latinContradictionTechnique, solveLatin, type LatinHint } from '../latin/engine'
import { subsetTechnique, subsetTechniques } from '../latin/line-subsets'
import { latinClueTechnique, supportingLatinClueTechniques } from '../latin/path-clues'
import { whispersTechnique } from '../latin/whispers'
import { xWingTechnique } from '../latin/x-wing'
import { Button } from './Button'
import { NumberGameDifficulty, NumberGamePlay, NumberPuzzlePreview, type NumberGameConfig } from './NumberPuzzle'
import { SelectControl } from './SelectControl'
import { advancedInequalityTechnique, inequalityTechniqueNames, inequalityTechniques, numberPuzzleEdgeClues } from './number-puzzle-edge-clues'
import { numberPuzzleClues } from './number-puzzle-line-clues'

const lockedCandidates = 'Locked candidates'

function numberHint(hint: LatinHint, hasInequalities: boolean) {
  const comparison = hasInequalities
    ? hint.rules.some(rule => rule.kind === 'inequality-line-matching')
      ? inequalityTechniqueNames['inequality-line-matching']
      : advancedInequalityTechnique(hint) ?? (hint.rules[0].kind === 'inequality' ? inequalityTechniqueNames.inequality : undefined)
    : undefined
  return {
    cell: hint.cell,
    value: hint.value,
    technique: hint.rules.some(rule => rule.kind === 'x-wing') ? xWingTechnique
      : hint.rules[0].kind === 'contradiction' ? latinContradictionTechnique
      : hint.rules[0].kind === 'whispers' ? whispersTechnique
      : hint.rules[0].kind === 'adjacent-clue' ? adjacentClueTechnique
      : latinClueTechnique(hint.rules[0].kind) ?? comparison ??
        (hint.rules.some(rule => rule.kind === 'cage-line') ? lockedCandidates
          : subsetTechnique(hint) ?? (hint.rules[0].kind === 'line-total' ? 'Line totals'
            : hint.rules[0].kind === 'line' ? 'Row and column' : 'Cage arithmetic')),
    supportingTechniques: supportingLatinClueTechniques(hint.rules),
    marked: hint.rules.flatMap(rule => rule.cells),
    reasons: hint.rules.map(rule => rule.label),
    trace: hint.trace,
  }
}

export const calcudoku = {
  game: 'calcudoku',
  name: 'Calcudoku',
  rules: 'Use every number from 1 to the grid size once in each row and column. If a cage has a target, its digits must match the target and operation.',
  techniques: ['Row and column', 'Cage arithmetic', 'Line totals', ...subsetTechniques, lockedCandidates, xWingTechnique],
  entries: calcudokuCatalog,
  generatedEntry: generatedCalcudokuEntry,
  board: ({ puzzle, cageLabels, cellColors, ruleNotes, annotations }) => {
    const { size, cages, givens, inequalities, adjacentClues } = puzzle
    const hasInequalities = inequalities.length > 0
    const clues = numberPuzzleEdgeClues(size, inequalities, adjacentClues)
    const lines = numberPuzzleClues(size, inequalities, puzzle, annotations?.authoredPaths)
    const describeHint = (hint: LatinHint) => numberHint(hint, hasInequalities)
    const cageAt = new Map(cages.flatMap(cage => cage.cells.map(cell => [cell, cage] as const)))
    const quadrupleCorners = new Set(puzzle.quadruples?.map(clue => clue.topLeft + size + 1))
    const cells = givens.map((given, cell) => {
      const cage = cageAt.get(cell)
      const clue = clues.get(cell)
      const labels = [...(clue?.labels ?? []), ...(lines?.labels.get(cell) ?? [])]
      const color = cellColors?.[cell] || undefined
      if (!cage) return { given, color, label: labels.join(', '), decoration: clue?.signs }
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
      const caption = cage.distinct && cage.operator === 'add' ? `Cage total ${cage.target}`
        : `${cage.target}${operation ? ` ${operation}` : ''} cage`
      const cageLabel = given && !sourceLabel ? undefined
        : `${caption} at ${cellLabel(anchor, size)}${cage.distinct ? ', no repeats' : ''}`
      const label = (cageLabel ? [cageLabel, ...labels] : labels).join(', ')
      const decoration = cell === anchor && (sourceLabel || !given)
        ? <span key="cage" className="number-puzzle-cell-label" data-below-quadruple={quadrupleCorners.has(cell) || undefined}
          aria-hidden="true">{sourceLabel ?? `${cage.target}${symbol}`}</span> : undefined
      return {
        given, edges, color, label,
        decoration: clue?.signs.length ? [decoration, ...clue.signs] : decoration,
      }
    })

    return {
      width: size,
      height: size,
      maxValue: size,
      lineClues: lines?.drawing,
      cells,
      ruleNotes: [
        ...(ruleNotes ?? []), ...(adjacentClues ? adjacentClueNotes(adjacentClues) : []),
        ...(lines?.notes ?? []),
      ],
      extraTechniques: [
        ...(hasInequalities ? inequalityTechniques : []),
        ...(adjacentClues ? [adjacentClueTechnique] : []),
        ...(lines ? [...lines.techniques, latinContradictionTechnique] : []),
      ],
      check: values => {
        const { complete, conflicts } = checkLatin(puzzle, values)
        return { complete, marked: conflicts.flatMap(rule => rule.cells.filter(cell => values[cell] || givens[cell])) }
      },
      solve: () => {
        const result = solveLatin(puzzle)
        return result.status === 'unique' ? result.solution : null
      },
      hints: (values, limit) => findLatinHints(puzzle, values, limit).map(describeHint),
      solutionHints: values => findLatinSolutionHints(puzzle, values).map(describeHint),
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
  return <NumberPuzzlePreview board={calcudoku.board(entry)} game="calcudoku" label="Calcudoku puzzle preview"
    position={entry.initialPosition} annotations={entry.annotations} rules={calcudoku.rules} />
}

export function CalcudokuDifficultyPage() {
  return <NumberGameDifficulty config={calcudoku} />
}

export function CalcudokuPlay({ entry }: { entry: CalcudokuEntry }) {
  return <NumberGamePlay config={calcudoku} entry={entry} />
}
