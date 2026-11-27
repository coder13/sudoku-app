import { futoshikiCatalog, type FutoshikiEntry } from '../futoshiki/catalog'
import { cellLabel, checkLatin, findLatinHints, solveLatin } from '../latin/engine'
import { NumberGameDifficulty, NumberGamePlay, NumberPuzzlePreview, type NumberGameConfig } from './NumberPuzzle'
import './futoshiki.css'

const futoshiki: NumberGameConfig<FutoshikiEntry> = {
  game: 'futoshiki',
  name: 'Futoshiki',
  rules: 'Use every number from 1 to the grid size once in each row and column. Each arrow points to the smaller number.',
  techniques: ['Row and column', 'Inequality', 'Odd/Even'],
  entries: futoshikiCatalog,
  board: entry => {
    const { puzzle } = entry
    const { size, givens, inequalities, parity } = puzzle
    const parityAt = new Map(parity.map(clue => [clue.cell, clue.parity]))
    return {
      width: size,
      height: size,
      maxValue: size,
      cells: givens.map((given, cell) => {
        const adjacent = inequalities.filter(edge => edge.less === cell || edge.greater === cell)
        const decoration = adjacent.flatMap(({ less, greater }) => {
          if (Math.min(less, greater) !== cell) return []
          const other = Math.max(less, greater)
          return [<span key={other} className="futoshiki-sign"
            data-side={other - cell === size ? 'bottom' : 'right'} aria-hidden="true">
            {less === cell ? '<' : '>'}
          </span>]
        })
        const mark = parityAt.get(cell)
        const decorations = [...decoration, ...(mark ? [<svg key="parity" className="number-puzzle-parity" viewBox="0 0 1 1" aria-hidden="true">
          <g className={`variant-parity variant-parity-${mark}`}>{mark === 'odd'
            ? <circle cx=".5" cy=".5" r=".36" />
            : <rect x=".14" y=".14" width=".72" height=".72" />}</g>
        </svg>] : [])]
        return {
          given,
          authoredColors: entry.givenCellColors?.[cell],
          label: [...adjacent.map(({ less, greater }) => `${cellLabel(less, size)} is less than ${cellLabel(greater, size)}`),
            ...(mark ? [`${mark === 'odd' ? 'Odd circle' : 'Even square'} requires an ${mark} digit`] : [])].join(', '),
          decoration: decorations.length ? decorations : undefined,
        }
      }),
      check: values => {
        const { complete, conflicts } = checkLatin(puzzle, values)
        return { complete, marked: conflicts.flatMap(rule => rule.cells) }
      },
      solve: () => {
        const result = solveLatin(puzzle)
        return result.status === 'unique' ? result.solution : null
      },
      hints: (values, limit) => findLatinHints(puzzle, values, limit).map(hint => ({
        cell: hint.cell,
        value: hint.value,
        technique: hint.rules.some(rule => rule.kind === 'parity') ? 'Odd/Even'
          : hint.rules.every(rule => rule.kind === 'line') ? 'Row and column' : 'Inequality',
        marked: hint.rules.flatMap(rule => rule.cells),
        reasons: hint.rules.map(rule => rule.label),
      })),
    }
  },
}

export function FutoshikiDifficultyPage() {
  return <NumberGameDifficulty config={futoshiki} />
}

export function FutoshikiImportPreview({ entry }: { entry: FutoshikiEntry }) {
  return <NumberPuzzlePreview board={futoshiki.board(entry)} game="futoshiki"
    label="Futoshiki puzzle preview" position={entry.initialPosition} />
}

export function FutoshikiPlay({ entry }: { entry: FutoshikiEntry }) {
  return <NumberGamePlay config={futoshiki} entry={entry} />
}
