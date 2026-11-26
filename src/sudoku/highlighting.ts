import { placedDigitCounts } from './game.ts'

export type DigitHighlightMatch = 'all' | 'any'
export type DigitHighlight = { mask: number; match: DigitHighlightMatch; pinnedMask?: number; previewDigit?: number }
export const defaultDigitHighlight: DigitHighlight = { mask: 0, match: 'all' }

function highlightWithPins(pinnedMask: number, previewDigit: number | undefined, match: DigitHighlightMatch): DigitHighlight {
  const mask = pinnedMask | (previewDigit ? 1 << (previewDigit - 1) : 0)
  return { mask, match, ...(pinnedMask ? { pinnedMask, ...(previewDigit ? { previewDigit } : {}) } : {}) }
}

export function togglePinnedDigit(current: DigitHighlight, digit: number, activeDigit?: number | null, match = current.match) {
  const bit = 1 << (digit - 1)
  const pinnedMask = (current.pinnedMask ?? 0) ^ bit
  const previous = current.pinnedMask ? current.previewDigit : activeDigit ?? undefined
  return highlightWithPins(pinnedMask, previous === digit ? undefined : previous, match)
}

export function previewPinnedDigit(current: DigitHighlight, digit: number) {
  if (!current.pinnedMask) return current
  const preview = current.pinnedMask & (1 << (digit - 1)) ? undefined : digit
  return preview === current.previewDigit ? current : highlightWithPins(current.pinnedMask, preview, current.match)
}

export function readDigitHighlight(value: DigitHighlight | undefined): DigitHighlight {
  if (!value || !Number.isInteger(value.mask) || value.mask < 0 || value.mask > 0x1ff) return defaultDigitHighlight
  const { pinnedMask, previewDigit } = value
  const match = value.match === 'any' ? 'any' : 'all'
  if (pinnedMask && Number.isInteger(pinnedMask) && pinnedMask > 0 && pinnedMask <= 0x1ff) {
    const preview = previewDigit && Number.isInteger(previewDigit) && previewDigit >= 1 && previewDigit <= 9 ? previewDigit : undefined
    return highlightWithPins(pinnedMask, preview, match)
  }
  return { mask: value.mask, match }
}

export function activeHighlightDigit(
  values: string,
  selected: readonly number[],
  active: number,
  selectedDigit?: number | null,
) {
  const cellDigit = selected.includes(active) ? Number(values[active]) : 0
  return selectedDigit || cellDigit || null
}

export function nextIncompleteDigit(values: string, current: number | null, gridSize = 9) {
  const counts = placedDigitCounts(values)
  for (let offset = 0; offset < gridSize; offset++) {
    const digit = ((current ?? 0) + offset) % gridSize + 1
    if (counts[digit] < gridSize) return digit
  }
  return null
}

export function functionKeyDigit(key: string) {
  const match = /^F([1-9])$/i.exec(key)
  return match ? Number(match[1]) : null
}

export function givenDigitAt(givens: string, index: number) {
  const digit = Number(givens[index])
  return digit || null
}

export function onlyGivensSelected(givens: string, selected: readonly number[]) {
  return selected.length > 0 && selected.every((index) => givens[index] !== '0')
}
