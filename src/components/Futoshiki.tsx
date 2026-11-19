import { futoshikiCatalog, type FutoshikiEntry } from '../futoshiki/catalog'
import { cellLabel, checkLatin, findLatinHint, solveLatin } from '../latin/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberGameConfig } from './NumberPuzzle'
import './futoshiki.css'

const futoshiki: NumberGameConfig<FutoshikiEntry> = {
  game: 'futoshiki',
  name: 'Futoshiki',
  rules: 'Use every number from 1 to the grid size once in each row and column. Each arrow points to the smaller number.',
  entries: futoshikiCatalog,
  board: ({ puzzle }) => {
    const { size, givens, inequalities } = puzzle
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
        return {
          given,
          label: adjacent.map(({ less, greater }) => `${cellLabel(less, size)} is less than ${cellLabel(greater, size)}`).join(', '),
          decoration: decoration.length ? decoration : undefined,
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
      hint: values => {
        const hint = findLatinHint(puzzle, values)
        return hint && { cell: hint.cell, value: hint.value, marked: hint.rules.flatMap(rule => rule.cells),
          reasons: hint.rules.map(rule => rule.label) }
      },
    }
  },
}

export function FutoshikiDifficultyPage() {
  return <NumberGameDifficulty config={futoshiki} />
}

export function FutoshikiPlay({ entry }: { entry: FutoshikiEntry }) {
  return <NumberGamePlay config={futoshiki} entry={entry} />
}
