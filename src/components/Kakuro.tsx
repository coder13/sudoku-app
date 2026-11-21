import { kakuroCatalog, generatedKakuroEntry, type KakuroEntry } from '../kakuro/catalog'
import { checkKakuro, createKakuroHintFinder, findKakuroSolutionHints, solveKakuro, type KakuroHint, type KakuroPuzzle } from '../kakuro/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberBoard, type NumberGameConfig } from './NumberPuzzle'
import './kakuro.css'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const candidateList = new Intl.ListFormat('en', { type: 'disjunction' })

function describeCandidates(mask: number) {
  return candidateList.format(digits.filter(digit => mask & (1 << (digit - 1))).map(String))
}

function numberHint(hint: KakuroHint): ReturnType<NumberBoard['hints']>[number] {
  return {
    cell: hint.cell,
    value: hint.digit,
    technique: hint.runs.length === 1 ? 'Run sum' : 'Crossing run sums',
    marked: hint.runs.map(run => run.clue),
    renderExplanation: cellName => <details className="number-puzzle-help">
      <summary>Show hint steps</summary>
      <p>Each step uses the clue total, distinct digits, and the candidates left by earlier steps.</p>
      <ol className="kakuro-hint-steps">{hint.steps.map(({ run, changes }, index) => <li key={index}>
        <strong>{run.total} {run.direction} at {cellName(run.clue)}</strong>
        <ul>{changes.map(({ cell, removedMask, remainingMask }) => <li key={cell}>
          The clue rules out {describeCandidates(removedMask)} in {cellName(cell)}.
          {' '}{cellName(cell)} can only be {describeCandidates(remainingMask)}.
        </li>)}</ul>
      </li>)}</ol>
    </details>,
  }
}

function kakuroBoardHints(puzzle: KakuroPuzzle): NumberBoard['hints'] {
  const findHints = createKakuroHintFinder(puzzle)
  return (values, limit) => findHints(values, limit).map(numberHint)
}

export const kakuro = {
  game: 'kakuro',
  name: 'Kakuro',
  difficultyDescriptions: {
    easy: 'Use short chains of across and down clues.',
    medium: 'Link several crossing clues to narrow the choices.',
    hard: 'Follow longer chains of crossing clues.',
  },
  rules: 'Fill each white cell with a digit from 1 to 9. Use each digit only once per run. The digits must add up to the clue.',
  techniques: ['Run sum', 'Crossing run sums'],
  entries: kakuroCatalog,
  generatedEntry: generatedKakuroEntry,
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
    solve: () => {
      const result = solveKakuro(puzzle)
      return result.status === 'unique' ? result.solution : null
    },
    hints: kakuroBoardHints(puzzle),
    solutionHints: values => findKakuroSolutionHints(puzzle, values).map(numberHint),
  }),
} satisfies NumberGameConfig<KakuroEntry>

export function KakuroDifficultyPage() {
  return <NumberGameDifficulty config={kakuro} />
}

export function KakuroPlay({ entry }: { entry: KakuroEntry }) {
  return <NumberGamePlay config={kakuro} entry={entry} />
}
