import { calcudokuCatalog, generatedCalcudokuEntry, type CalcudokuEntry } from '../calcudoku/catalog'
import { operatorSymbol } from '../calcudoku/engine'
import { cellLabel, checkLatin, findLatinHints, solveLatin } from '../latin/engine'
import { latinKropkiClueLabel, latinKropkiDotsByCell, latinKropkiRuleDescription, LatinKropkiDots } from './LatinKropkiClues'
import { NumberGameDifficulty, NumberGamePlay, NumberPuzzlePreview, type NumberGameConfig } from './NumberPuzzle'

const calcudoku: NumberGameConfig<CalcudokuEntry> = {
  game: 'calcudoku',
  name: 'Calcudoku',
  rules: 'Use every number from 1 to the grid size once in each row and column. Each cage’s numbers must match its target and operation.',
  techniques: ['Row and column', 'Cage arithmetic', 'Odd/Even', 'Kropki'],
  entries: calcudokuCatalog,
  generatedEntry: generatedCalcudokuEntry,
  board: ({ puzzle }) => {
    const { size, cages, givens, parity, kropki } = puzzle
    const parityAt = new Map(parity.map(clue => [clue.cell, clue.parity]))
    const kropkiAt = latinKropkiDotsByCell(kropki, size, true)
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
      const operation = { add: 'plus', subtract: 'minus', multiply: 'times', divide: 'divided by', equal: '', hidden: '' }[cage.operator]
      const mark = parityAt.get(cell)
      const dots = kropkiAt.get(cell) ?? []
      const decorations = [
        ...(cell === anchor && !given ? [<span key="cage" className="number-puzzle-cell-label" aria-hidden="true">{cage.target}{symbol}</span>] : []),
        ...(dots.length ? [<LatinKropkiDots key="kropki" dots={dots} />] : []),
        ...(mark ? [<svg key="parity" className="number-puzzle-parity" viewBox="0 0 1 1" aria-hidden="true">
          <g className={`variant-parity variant-parity-${mark}`}>{mark === 'odd'
            ? <circle cx=".5" cy=".5" r=".36" />
            : <rect x=".14" y=".14" width=".72" height=".72" />}</g>
        </svg>] : []),
      ]
      return {
        given,
        kropki: dots.length > 0,
        edges,
        label: [...(!given ? [`${cage.target}${operation ? ` ${operation}` : ''} cage at ${cellLabel(anchor, size)}`] : []),
          ...dots.filter(({ anchor }) => anchor).map(latinKropkiClueLabel),
          ...(mark ? [`${mark === 'odd' ? 'Odd circle' : 'Even square'} requires an ${mark} digit`] : [])].join(', ') || undefined,
        decoration: decorations.length ? decorations : undefined,
      }
    })

    return {
      width: size,
      height: size,
      maxValue: size,
      ruleDescription: latinKropkiRuleDescription(kropki),
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
        technique: hint.rules.some(rule => rule.kind === 'parity') ? 'Odd/Even'
          : hint.rules.some(rule => rule.kind === 'labeled-dots') ? 'Numbered Difference or Ratio'
            : hint.rules.some(rule => rule.kind === 'kropki') ? 'Kropki'
          : hint.rules.every(rule => rule.kind === 'line') ? 'Row and column' : 'Cage arithmetic',
        marked: hint.rules.flatMap(rule => rule.cells),
        reasons: hint.rules.map(rule => rule.label),
      })),
    }
  },
}

export function CalcudokuDifficultyPage() {
  return <NumberGameDifficulty config={calcudoku} />
}

export function CalcudokuImportPreview({ entry }: { entry: CalcudokuEntry }) {
  return <NumberPuzzlePreview board={calcudoku.board(entry)} game="calcudoku"
    label="Calcudoku puzzle preview" position={entry.initialPosition} />
}

export function CalcudokuPlay({ entry }: { entry: CalcudokuEntry }) {
  return <NumberGamePlay config={calcudoku} entry={entry} />
}
