import { quadrupleCells } from './variants.ts'
import type { SizedConstraintRule } from './engine.ts'

type Quadruple = Extract<SizedConstraintRule, { type: 'quadruple' }>

export function validSizedQuadruple(rule: Quadruple, size: number) {
  const { topLeft, digits } = rule
  return Object.keys(rule).length === 3 &&
    Number.isInteger(topLeft) && topLeft >= 0 && topLeft < size * (size - 1) && topLeft % size < size - 1 &&
    Array.isArray(digits) && digits.length >= 1 && digits.length <= 4 &&
    Array.from(digits).every(digit => Number.isInteger(digit) && digit >= 1 && digit <= size)
}

export function sizedQuadrupleState(rules: readonly SizedConstraintRule[] | undefined, values: string, size: number) {
  const clues = rules?.filter(rule => rule.type === 'quadruple')
  if (!clues?.length) return
  const allowed = Array<number>(values.length).fill((1 << size) - 1)
  const conflicts = new Set<number>()
  for (const { topLeft, digits } of clues) {
    const cells = quadrupleCells(topLeft, size)
    const missing = [...digits]
    const blanks: number[] = []
    for (const cell of cells) {
      const digit = Number(values[cell])
      if (digit === 0) blanks.push(cell)
      else {
        const index = missing.indexOf(digit)
        if (index >= 0) missing.splice(index, 1)
      }
    }
    if (missing.length > blanks.length) {
      for (const cell of cells) if (values[cell] !== '0') conflicts.add(cell)
    } else if (missing.length === blanks.length) {
      const mask = missing.reduce((mask, digit) => mask | 1 << (digit - 1), 0)
      for (const cell of blanks) allowed[cell] &= mask
    }
  }
  return { allowed, conflicts }
}
