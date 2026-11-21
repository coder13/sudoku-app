import { futoshikiCatalog, type FutoshikiEntry } from '../futoshiki/catalog'
import { adjacentClueNotes, adjacentClueTechnique } from '../latin/adjacent-clues'
import { checkLatin, findLatinHints, findLatinSolutionHints, latinContradictionTechnique, solveLatin, type LatinHint } from '../latin/engine'
import { subsetTechnique, subsetTechniques } from '../latin/line-subsets'
import { latinClueTechnique, supportingLatinClueTechniques } from '../latin/path-clues'
import { whispersTechnique } from '../latin/whispers'
import { xWingTechnique } from '../latin/x-wing'
import { NumberGameDifficulty, NumberGamePlay, NumberPuzzlePreview, type NumberGameConfig } from './NumberPuzzle'
import { advancedInequalityTechnique, inequalityTechniqueNames, numberPuzzleEdgeClues } from './number-puzzle-edge-clues'
import { numberPuzzleLines } from './number-puzzle-line-clues'

function numberHint(hint: LatinHint) {
  const matching = hint.rules.filter(rule => rule.kind === 'inequality-line-matching')
  return {
    cell: hint.cell,
    value: hint.value,
    technique: matching.length ? inequalityTechniqueNames['inequality-line-matching']
      : hint.rules.some(rule => rule.kind === 'x-wing') ? xWingTechnique
      : hint.rules[0].kind === 'contradiction' ? latinContradictionTechnique
      : hint.rules[0].kind === 'whispers' ? whispersTechnique
      : hint.rules[0].kind === 'adjacent-clue' ? adjacentClueTechnique
      : latinClueTechnique(hint.rules[0].kind) ??
        advancedInequalityTechnique(hint) ?? subsetTechnique(hint) ??
        (hint.rules[0].kind === 'line' ? 'Row and column' : inequalityTechniqueNames.inequality),
    supportingTechniques: supportingLatinClueTechniques(hint.rules),
    marked: (matching.length ? matching : hint.rules).flatMap(rule => rule.cells),
    reasons: hint.rules.map(rule => rule.label),
    trace: hint.trace,
  }
}

export const futoshiki = {
  game: 'futoshiki',
  name: 'Futoshiki',
  rules: 'Use every number from 1 to the grid size once in each row and column.',
  techniques: [
    'Row and column', inequalityTechniqueNames.inequality, ...subsetTechniques, inequalityTechniqueNames['inequality-line'],
    inequalityTechniqueNames['inequality-bound'], inequalityTechniqueNames['inequality-chain-line'],
    inequalityTechniqueNames['line-digit-bound'], xWingTechnique, inequalityTechniqueNames['inequality-line-matching'],
  ],
  entries: futoshikiCatalog,
  board: ({ puzzle }) => {
    const { size, givens, inequalities, adjacentClues } = puzzle
    const clues = numberPuzzleEdgeClues(size, inequalities, adjacentClues)
    const lines = numberPuzzleLines(size, inequalities, puzzle)
    return {
      width: size,
      height: size,
      maxValue: size,
      lineClues: lines?.drawing,
      ruleNotes: [
        ...(inequalities.length ? ['The point of each inequality sign faces the smaller digit.'] : []),
        ...(adjacentClues ? adjacentClueNotes(adjacentClues) : []),
        ...(lines?.notes ?? []),
      ],
      extraTechniques: [
        ...(adjacentClues ? [adjacentClueTechnique] : []),
        ...(lines ? [...lines.techniques, latinContradictionTechnique] : []),
      ],
      cells: givens.map((given, cell) => ({
        given,
        label: [...(clues.get(cell)?.labels ?? []), ...(lines?.labels.get(cell) ?? [])].join(', '),
        decoration: clues.get(cell)?.signs,
      })),
      check: values => {
        const { complete, conflicts } = checkLatin(puzzle, values)
        return { complete, marked: conflicts.flatMap(rule => rule.cells) }
      },
      solve: () => {
        const result = solveLatin(puzzle)
        return result.status === 'unique' ? result.solution : null
      },
      hints: (values, limit) => findLatinHints(puzzle, values, limit).map(numberHint),
      solutionHints: values => findLatinSolutionHints(puzzle, values).map(numberHint),
    }
  },
} satisfies NumberGameConfig<FutoshikiEntry>

export function FutoshikiDifficultyPage() {
  return <NumberGameDifficulty config={futoshiki} />
}

export function FutoshikiImportPreview({ entry }: { entry: FutoshikiEntry }) {
  return <NumberPuzzlePreview board={futoshiki.board(entry)} game="futoshiki" label="Futoshiki puzzle preview"
    position={entry.initialPosition} annotations={entry.annotations} rules={futoshiki.rules} />
}

export function FutoshikiPlay({ entry }: { entry: FutoshikiEntry }) {
  return <NumberGamePlay config={futoshiki} entry={entry} />
}
