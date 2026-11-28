import { futoshikiCatalog, type FutoshikiEntry } from '../futoshiki/catalog'
import { cellLabel, checkLatin, findLatinHints, solveLatin } from '../latin/engine'
import { latinKropkiClueLabel, latinKropkiDotsByCell, latinKropkiRuleDescription, LatinKropkiDots } from './LatinKropkiClues'
import { NumberGameDifficulty, NumberGamePlay, NumberPuzzlePreview, type NumberGameConfig } from './NumberPuzzle'
import './futoshiki.css'

const futoshiki: NumberGameConfig<FutoshikiEntry> = {
  game: 'futoshiki',
  name: 'Futoshiki',
  rules: 'Use every number from 1 to the grid size once in each row and column. Each arrow points to the smaller number.',
  techniques: ['Row and column', 'Inequality', 'Odd/Even', 'Kropki'],
  entries: futoshikiCatalog,
  board: entry => {
    const { puzzle } = entry
    const { size, givens, inequalities, parity, kropki } = puzzle
    const parityAt = new Map(parity.map(clue => [clue.cell, clue.parity]))
    const kropkiAt = latinKropkiDotsByCell(kropki, size)
    return {
      width: size,
      height: size,
      maxValue: size,
      ruleDescription: latinKropkiRuleDescription(kropki),
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
        const dots = kropkiAt.get(cell) ?? []
        const decorations = [...decoration, ...(dots.length ? [<LatinKropkiDots key="kropki" dots={dots} />] : []), ...(mark ? [<svg key="parity" className="number-puzzle-parity" viewBox="0 0 1 1" aria-hidden="true">
          <g className={`variant-parity variant-parity-${mark}`}>{mark === 'odd'
            ? <circle cx=".5" cy=".5" r=".36" />
            : <rect x=".14" y=".14" width=".72" height=".72" />}</g>
        </svg>] : [])]
        return {
          given,
          kropki: dots.length > 0,
          authoredColors: entry.givenCellColors?.[cell],
          label: [...adjacent.map(({ less, greater }) => `${cellLabel(less, size)} is less than ${cellLabel(greater, size)}`),
            ...dots.filter(({ anchor }) => anchor).map(latinKropkiClueLabel),
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
          : hint.rules.some(rule => rule.kind === 'labeled-dots') ? 'Numbered Difference or Ratio'
            : hint.rules.some(rule => rule.kind === 'kropki') ? 'Kropki'
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
