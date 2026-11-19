import { kakuroCatalog, type KakuroEntry } from '../kakuro/catalog'
import { checkKakuro, findKakuroHint } from '../kakuro/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberGameConfig } from './NumberPuzzle'
import './kakuro.css'

const kakuro: NumberGameConfig<KakuroEntry> = {
  game: 'kakuro',
  name: 'Kakuro',
  rules: 'Fill each white cell with a digit from 1 to 9. Use each digit only once per run. The digits must add up to the clue.',
  entries: kakuroCatalog,
  hasClueCells: true,
  board: ({ puzzle }) => ({
    width: puzzle.width,
    height: puzzle.height,
    maxValue: 9,
    cells: puzzle.cells.map((cell, index) => cell === null
      ? { label: puzzle.runs.filter(run => run.cells.includes(index)).map(run => `${run.total} ${run.direction}`).join(', ') }
      : {
        block: true,
        label: [cell.across && `${cell.across} across`, cell.down && `${cell.down} down`].filter(Boolean).join(', '),
        decoration: <>
          <span className="kakuro-clue-across" aria-hidden="true">{cell.across}</span>
          <span className="kakuro-clue-down" aria-hidden="true">{cell.down}</span>
        </>,
      }),
    check: values => {
      const { complete, conflicts } = checkKakuro(puzzle, values)
      return { complete, marked: conflicts.flatMap(run => [run.clue, ...run.cells.filter(index => values[index])]) }
    },
    hint: values => {
      const hint = findKakuroHint(puzzle, values)
      if (!hint) return null
      return {
        cell: hint.cell,
        value: hint.digit,
        marked: hint.runs.map(run => run.clue),
        reasons: hint.runs.map(run => `${run.total} ${run.direction} at R${Math.floor(run.clue / puzzle.width) + 1}C${run.clue % puzzle.width + 1}`),
      }
    },
  }),
}

export function KakuroDifficultyPage() {
  return <NumberGameDifficulty config={kakuro} />
}

export function KakuroPlay({ entry }: { entry: KakuroEntry }) {
  return <NumberGamePlay config={kakuro} entry={entry} />
}
