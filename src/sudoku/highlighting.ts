import { placedDigitCounts } from './game.ts'

export type DigitHighlightMatch = 'all' | 'any'

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
