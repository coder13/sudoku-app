import { encodeLatinMinMax, readLatinMinMax } from '../latin/min-max.ts'
import { encodeLatinDiagonals, readLatinDiagonals } from '../latin/diagonals.ts'
import { encodeAdjacentClues, readAdjacentClues } from '../latin/adjacent-clues.ts'
import { encodeNumberImportAnnotations, hasPlayerNumberAnnotations, readNumberImportAnnotations, type NumberImportAnnotations } from '../number-puzzles/imported-annotations.ts'
import { encodeNumberImportPosition, readNumberImportPosition, withImportedNumberPosition } from '../number-puzzles/imported-position.ts'
import type { NumberPosition } from '../number-puzzles/progress.ts'
import { encodeWhispers, readWhispers } from '../latin/whispers.ts'
import { encodeLatinParity, readLatinParity } from '../latin/parity.ts'
import { encodeLatinQuadruples, readLatinQuadruples } from '../latin/quadruples.ts'
import { encodeLatinCellGroups, readLatinCellGroups } from '../latin/extra-regions.ts'
import { encodeLatinPathClues, readLatinPathClues, type LatinClues } from '../latin/path-clues.ts'
import { solveLatin } from '../latin/engine.ts'
import { createFutoshiki, type Inequality } from './engine.ts'
import type { FutoshikiEntry } from './catalog.ts'
import { difficultyBySize, matchImportedFutoshiki, type FutoshikiSize } from './import-token.ts'

export { importedFutoshikiToken, isFutoshikiSize, type FutoshikiSize } from './import-token.ts'

export function createImportedFutoshiki(
  size: FutoshikiSize, givens: string, inequalities: readonly Inequality[],
  { position, annotations, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing, diagonals, minMax }: LatinClues & { position?: NumberPosition; annotations?: NumberImportAnnotations } = {},
): FutoshikiEntry {
  const puzzle = createFutoshiki(size, Array.from(givens, Number), inequalities, { adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing, diagonals, minMax })
  // Keep the one-character indices in existing links. Larger boards need two.
  const wide = size > 6
  const encoded = inequalities
    .map(({ less, greater }) => [less, greater].map(cell => cell.toString(36).padStart(wide ? 2 : 1, '0')).join(''))
    .sort().join('')
  const progress = withImportedNumberPosition(position, puzzle.givens, hasPlayerNumberAnnotations(annotations))
  return { id: `f${wide ? 2 : 1}.${givens}.${encoded}${encodeAdjacentClues(adjacentClues)}${encodeWhispers(whispers)}${encodeLatinPathClues(pathClues)}${encodeLatinCellGroups('r', extraRegions)}${encodeLatinCellGroups('u', unnumberedCages)}${globalEntropy ? '.e1' : ''}${encodeLatinQuadruples(quadruples)}${encodeLatinParity(size, parity)}${antiKnight ? '.k1' : ''}${antiKing ? '.j1' : ''}${encodeLatinDiagonals(diagonals)}${encodeLatinMinMax(minMax)}${encodeNumberImportPosition(progress.initialPosition)}${encodeNumberImportAnnotations(annotations)}`,
    puzzle, number: 0, difficulty: difficultyBySize[size], imported: true, annotations, ...progress }
}

export function verifiedImportedFutoshiki(entry: FutoshikiEntry) {
  const result = solveLatin(entry.puzzle)
  if (result.status === 'unsolvable') throw new Error('This Futoshiki puzzle has no solution.')
  if (result.status === 'multiple') throw new Error('This Futoshiki puzzle has more than one solution.')
  if (result.status === 'search-limit') throw new Error('The app could not check whether this Futoshiki puzzle has one solution.')
  return entry
}

export function readImportedFutoshiki(token: string): FutoshikiEntry | undefined {
  const data = matchImportedFutoshiki(token)
  if (!data) return
  const { size, givens, edges, indexLength, adjacent, whispers, lines, regions, unnumbered, entropy, quadruples: quadClues, parity: parityMarks, antiKnight, antiKing, diagonalMask, extrema, progress, marks } = data
  const inequalities: Inequality[] = []
  for (let index = 0; index < edges.length; index += 2 * indexLength) {
    inequalities.push({
      less: Number.parseInt(edges.slice(index, index + indexLength), 36),
      greater: Number.parseInt(edges.slice(index + indexLength, index + 2 * indexLength), 36),
    })
  }
  try {
    const position = progress ? readNumberImportPosition(progress, size) : undefined
    const annotations = marks ? readNumberImportAnnotations(marks, size) : undefined
    const adjacentClues = adjacent ? readAdjacentClues(adjacent) : undefined
    const entry = createImportedFutoshiki(size, givens, inequalities, {
      position, annotations, adjacentClues, whispers: whispers ? readWhispers(whispers) : undefined,
      pathClues: lines ? readLatinPathClues(lines) : undefined,
      extraRegions: regions ? readLatinCellGroups(regions) : undefined,
      unnumberedCages: unnumbered ? readLatinCellGroups(unnumbered) : undefined,
      globalEntropy: entropy ? true : undefined,
      quadruples: quadClues ? readLatinQuadruples(quadClues) : undefined,
      parity: parityMarks ? readLatinParity(size, parityMarks) : undefined,
      antiKnight: antiKnight ? true : undefined,
      antiKing: antiKing ? true : undefined,
      diagonals: readLatinDiagonals(diagonalMask),
      minMax: extrema ? readLatinMinMax(extrema) : undefined,
    })
    if (entry.id === token) return entry
  } catch { /* Invalid import link. */ }
}
