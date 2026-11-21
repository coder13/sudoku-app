import {
  maxAdjacentClueTokenLength, maxWhisperTokenLength, maxPathClueTokenLength, maxExtraRegionTokenLength, maxQuadrupleTokenLength,
  numberPositionTokenLength, numberAnnotationTokenLength,
} from '../number-puzzles/import-token-limits.ts'

export const difficultyBySize = { 3: 'easy', 4: 'easy', 5: 'medium', 6: 'hard', 7: 'hard', 8: 'hard', 9: 'hard' } as const
const importToken = /^(f[12])\.([0-9]{9,81})\.([0-9a-z]{0,576})(?:\.d([0-9a-z]+))?(?:\.w([0-9a-z]+))?(?:\.l([0-9a-z]+))?(?:\.r([0-9a-z]+))?(?:\.u([0-9a-z]+))?(\.e1)?(?:\.q([0-9a-z]+))?(?:\.y([012]{9,81}))?(\.k1)?(?:\.p([0-9a-z]+))?(?:\.a([A-Za-z0-9_-]+))?$/
const maxDefinitionLength = 3 + 81 + 1 + 576 + 2 + maxAdjacentClueTokenLength + 2 + maxWhisperTokenLength + 2 + maxPathClueTokenLength + 2 * (2 + maxExtraRegionTokenLength) + 3 + 2 + maxQuadrupleTokenLength + 2 + 81 + 3

export type FutoshikiSize = keyof typeof difficultyBySize

export function isFutoshikiSize(value: unknown): value is FutoshikiSize {
  return typeof value === 'number' && Object.hasOwn(difficultyBySize, value)
}

export function matchImportedFutoshiki(value: unknown) {
  if (typeof value !== 'string' ||
    value.length > maxDefinitionLength + 2 + numberPositionTokenLength + 2 + numberAnnotationTokenLength) return
  const match = importToken.exec(value)
  if (!match) return
  const [, version, givens, edges, adjacent, whispers, lines, regions, unnumbered, entropy, quadruples, parity, antiKnight, progress, marks] = match
  const size = Math.sqrt(givens.length)
  if (!isFutoshikiSize(size) || (entropy && size !== 9) || (version === 'f2') !== (size > 6) || [...givens].some(digit => Number(digit) > size)) return
  const indexLength = size > 6 ? 2 : 1
  const edgeLength = 2 * indexLength
  if (parity && parity.length !== givens.length) return
  if (edges.length % edgeLength || edges.length > 2 * size * (size - 1) * edgeLength) return
  return { size, givens, edges, indexLength, adjacent, whispers, lines, regions, unnumbered, entropy, quadruples, parity, antiKnight, progress, marks }
}

export function importedFutoshikiToken(value: unknown) {
  return typeof value === 'string' && matchImportedFutoshiki(value) ? value : undefined
}
