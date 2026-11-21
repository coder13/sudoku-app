import { encodeNumberImportAnnotations, hasPlayerNumberAnnotations, numberAnnotationTokenLength, readNumberImportAnnotations, type NumberImportAnnotations } from '../number-puzzles/imported-annotations.ts'
import { encodeNumberImportPosition, numberPositionTokenLength, readNumberImportPosition, withImportedNumberPosition } from '../number-puzzles/imported-position.ts'
import type { NumberPosition } from '../number-puzzles/progress.ts'
import { solveLatin } from '../latin/engine.ts'
import { createFutoshiki, type Inequality } from './engine.ts'
import type { FutoshikiEntry } from './catalog.ts'

const difficultyBySize = { 3: 'easy', 4: 'easy', 5: 'medium', 6: 'hard', 7: 'hard', 8: 'hard', 9: 'hard' } as const
const importToken = /^(f[12])\.([0-9]{9,81})\.([0-9a-z]{0,576})(?:\.p([0-9a-z]+))?(?:\.a([A-Za-z0-9_-]+))?$/
const maxDefinitionLength = 3 + 81 + 1 + 576

export type FutoshikiSize = keyof typeof difficultyBySize

export function isFutoshikiSize(value: unknown): value is FutoshikiSize {
  return typeof value === 'number' && Object.hasOwn(difficultyBySize, value)
}

export function createImportedFutoshiki(size: FutoshikiSize, givens: string, inequalities: readonly Inequality[], position?: NumberPosition, annotations?: NumberImportAnnotations): FutoshikiEntry {
  const puzzle = createFutoshiki(size, Array.from(givens, Number), inequalities)
  // Keep the one-character indices in existing links. Larger boards need two.
  const wide = size > 6
  const encoded = inequalities
    .map(({ less, greater }) => [less, greater].map(cell => cell.toString(36).padStart(wide ? 2 : 1, '0')).join(''))
    .sort().join('')
  const progress = withImportedNumberPosition(position, puzzle.givens, hasPlayerNumberAnnotations(annotations))
  return { id: `f${wide ? 2 : 1}.${givens}.${encoded}${encodeNumberImportPosition(progress.initialPosition)}${encodeNumberImportAnnotations(annotations)}`,
    puzzle, number: 0, difficulty: difficultyBySize[size], imported: true, annotations, ...progress }
}

export function verifiedImportedFutoshiki(entry: FutoshikiEntry) {
  const result = solveLatin(entry.puzzle)
  if (result.status === 'unsolvable') throw new Error('This Futoshiki puzzle has no solution.')
  if (result.status === 'multiple') throw new Error('This Futoshiki puzzle has more than one solution.')
  if (result.status === 'search-limit') throw new Error('The app could not check whether this Futoshiki puzzle has one solution.')
  return entry
}

function matchImportedFutoshiki(value: unknown) {
  if (typeof value !== 'string' ||
    value.length > maxDefinitionLength + 2 + numberPositionTokenLength + 2 + numberAnnotationTokenLength) return
  const match = importToken.exec(value)
  if (!match) return
  const [, version, givens, edges, progress, marks] = match
  const size = Math.sqrt(givens.length)
  if (!isFutoshikiSize(size) || (version === 'f2') !== (size > 6) || [...givens].some(digit => Number(digit) > size)) return
  const indexLength = size > 6 ? 2 : 1
  const edgeLength = 2 * indexLength
  if (edges.length % edgeLength || edges.length > 2 * size * (size - 1) * edgeLength) return
  return { size, givens, edges, indexLength, progress, marks }
}

export function importedFutoshikiToken(value: unknown) {
  return typeof value === 'string' && matchImportedFutoshiki(value) ? value : undefined
}

export function readImportedFutoshiki(token: string): FutoshikiEntry | undefined {
  const data = matchImportedFutoshiki(token)
  if (!data) return
  const { size, givens, edges, indexLength, progress, marks } = data
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
    const entry = createImportedFutoshiki(size, givens, inequalities, position, annotations)
    if (entry.id === token) return entry
  } catch { /* Invalid givens or inequality edges. */ }
}
