import { distinctLatinRule, type LatinRule } from './engine.ts'

export type LatinDiagonal = 'main' | 'anti'

export function validLatinDiagonals(value: unknown): value is readonly LatinDiagonal[] {
  return Array.isArray(value) && value.length <= 2 &&
    value.every((diagonal, index) => (diagonal === 'main' || diagonal === 'anti') && value.indexOf(diagonal) === index)
}

export function compileLatinDiagonals(diagonals: readonly LatinDiagonal[], size: number): LatinRule[] {
  if (!validLatinDiagonals(diagonals)) throw new Error('This Latin puzzle has invalid diagonal rules.')
  return diagonals.map(diagonal => {
    const cells = Array.from({ length: size }, (_, index) => diagonal === 'main'
      ? index * size + index : index * size + size - index - 1)
    return distinctLatinRule(cells, `${diagonal === 'main' ? 'Main' : 'Anti'} diagonal`, size)
  })
}
