import { hidatoCatalog, type HidatoEntry } from '../hidato/catalog'
import { checkHidato, findHidatoHints, findHidatoSolutionHints, hidatoTechniques, solveHidato } from '../hidato/engine'
import { NumberGameDifficulty, NumberGamePlay, type NumberGameConfig } from './NumberPuzzle'

export const hidato = {
  game: 'hidato',
  name: 'Hidato',
  difficultyDescriptions: {
    easy: '3 × 3 grid. Connect 1 to 8.',
    medium: '4 × 4 grid. Connect 1 to 14.',
    hard: '5 × 5 grid. Connect 1 to 23.',
  },
  rules: 'Fill the board with consecutive numbers. Every pair of consecutive numbers must touch along an edge or at a corner.',
  techniques: hidatoTechniques,
  entries: hidatoCatalog,
  board: ({ puzzle }) => {
    const end = puzzle.cells.length
    return {
      width: puzzle.width,
      height: puzzle.height,
      maxValue: end,
      cells: puzzle.givens.map(given => {
        if (given === -1) return { block: true }
        const endpoint = given === 1 || given === end
        return { given, endpoint, label: given === 1 ? 'start of path' : given === end ? 'end of path' : undefined }
      }),
      check: values => checkHidato(puzzle, values),
      solve: () => {
        const result = solveHidato(puzzle)
        return result.status === 'unique' ? result.solution : null
      },
      hints: (values, limit) => findHidatoHints(puzzle, values, limit),
      solutionHints: values => findHidatoSolutionHints(puzzle, values),
    }
  },
} satisfies NumberGameConfig<HidatoEntry>

export function HidatoDifficultyPage() {
  return <NumberGameDifficulty config={hidato} />
}

export function HidatoPlay({ entry }: { entry: HidatoEntry }) {
  return <NumberGamePlay config={hidato} entry={entry} />
}
