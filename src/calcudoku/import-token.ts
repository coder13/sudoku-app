import {
  maxAdjacentClueTokenLength, maxWhisperTokenLength, maxPathClueTokenLength, maxExtraRegionTokenLength,
  numberPositionTokenLength, numberAnnotationTokenLength,
} from '../number-puzzles/import-token-limits.ts'

const importToken = /^c1\.([A-Za-z0-9_-]{1,4093})(?:\.i((?:[0-9a-z]{4}){1,144}))?(?:\.d([0-9a-z]+))?(?:\.w([0-9a-z]+))?(?:\.l([0-9a-z]+))?(?:\.r([0-9a-z]+))?(\.e1)?(?:\.p([0-9a-z]+))?(?:\.a([A-Za-z0-9_-]+))?$/

const maxTokenLength = 4096 + 2 + 4 * 144 + 2 + maxAdjacentClueTokenLength + 2 + maxWhisperTokenLength +
  2 + maxPathClueTokenLength + 2 + maxExtraRegionTokenLength + 3 + 2 + numberPositionTokenLength + 2 + numberAnnotationTokenLength

export function matchImportedCalcudoku(value: unknown) {
  if (typeof value === 'string' && value.length <= maxTokenLength) return importToken.exec(value)
}

export function importedCalcudokuToken(value: unknown) {
  return typeof value === 'string' && matchImportedCalcudoku(value) ? value : undefined
}
