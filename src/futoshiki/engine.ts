import { latinAntiKingRules, latinAntiKnightRules } from '../latin/chess-rules.ts'
import { latinMinMaxRules } from '../latin/min-max.ts'
import { latinDiagonalRules } from '../latin/diagonals.ts'
import { adjacentClueRules } from '../latin/adjacent-clues.ts'
import { createLatinPuzzle, type LatinPuzzle } from '../latin/engine.ts'
import { latinExtraRegionRules, latinUnnumberedCageRules } from '../latin/extra-regions.ts'
import { latinGlobalEntropyRules } from '../latin/global-entropy.ts'
import { lineSubsetRules } from '../latin/line-subsets.ts'
import { latinParityRules } from '../latin/parity.ts'
import { latinPathRules, type LatinClues } from '../latin/path-clues.ts'
import { latinQuadrupleRules } from '../latin/quadruples.ts'
import { whispersRules } from '../latin/whispers.ts'
import { xWingRule } from '../latin/x-wing.ts'
import { inequalityRules, type Inequality } from './inequality-rules.ts'

export type { Inequality } from './inequality-rules.ts'
export type FutoshikiPuzzle = LatinPuzzle & LatinClues & { inequalities: readonly Inequality[] }

export function createFutoshiki(
  size: number, givens: readonly number[], inequalities: readonly Inequality[],
  { adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing, diagonals, minMax }: LatinClues = {},
): FutoshikiPuzzle {
  const puzzle = createLatinPuzzle(size, givens, [])
  const adjacent = adjacentClues ? adjacentClueRules(size, adjacentClues) : []
  const lines = whispers?.length ? whispersRules(size, whispers) : undefined
  const { basic, sharedBounds, lineRules, lineMatching } = inequalityRules(size, inequalities)
  return {
    ...puzzle,
    rules: [
      ...latinParityRules(size, parity), ...(antiKnight ? latinAntiKnightRules(size) : []), ...(antiKing ? latinAntiKingRules(size) : []), ...latinDiagonalRules(size, diagonals), ...latinMinMaxRules(size, minMax), ...basic, ...adjacent, ...(lines?.basic ?? []), ...latinPathRules(size, pathClues),
      ...latinExtraRegionRules(size, extraRegions), ...latinUnnumberedCageRules(size, unnumberedCages), ...latinGlobalEntropyRules(size, globalEntropy),
      ...latinQuadrupleRules(size, quadruples, extraRegions, unnumberedCages), ...puzzle.rules,
      ...(lines?.advanced ?? []), ...sharedBounds, ...lineSubsetRules(size), ...lineRules, xWingRule(size), ...lineMatching,
    ],
    inequalities, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing, diagonals, minMax,
  }
}
