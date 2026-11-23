export type Quadruple = {
  topLeft: number
  digits: readonly number[]
}

export const quadrupleTechnique = 'Quadruple'
export const quadrupleNote = 'Each digit printed in a circle must appear in the four surrounding cells. A repeated printed digit needs that many separate cells.'

export function quadrupleCells(topLeft: number, size = 9) {
  return [topLeft, topLeft + 1, topLeft + size, topLeft + size + 1] as const
}

export function validQuadruple({ topLeft, digits }: Quadruple, size: number) {
  return Number.isInteger(topLeft) && topLeft >= 0 && topLeft < size * (size - 1) && topLeft % size < size - 1 &&
    digits.length >= 1 && digits.length <= 4 && digits.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= size)
}
