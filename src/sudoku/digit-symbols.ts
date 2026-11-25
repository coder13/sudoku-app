const POSITION_DIGITS = '0123456789ABCDEFG'

export type DigitNotation = 'decimal' | 'zero-based'

/** Rank zero is blank; rank one can display as zero on zero-based grids. */
export function positionDigit(value: string | undefined) {
  return value === undefined ? -1 : POSITION_DIGITS.indexOf(value.toUpperCase())
}

export function positionSymbol(digit: number) {
  return POSITION_DIGITS[digit] ?? ''
}

export function positionText(digits: readonly number[]) {
  return digits.map(positionSymbol).join('')
}

export function validPositionDigits(text: string, size: number) {
  for (const character of text) {
    const digit = positionDigit(character)
    if (digit < 0 || digit > size) return false
  }
  return true
}

export function digitValueOffset(notation?: DigitNotation): 0 | 1 {
  return notation === 'zero-based' ? 1 : 0
}
