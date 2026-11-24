import { bit, cellLabel, type LatinRule } from './engine.ts'

export type LatinParity = { cell: number; parity: 'odd' | 'even' }

export function latinParityRules(size: number, clues: readonly LatinParity[] = []): LatinRule[] {
  const seen = new Set<number>()
  return clues.map(({ cell, parity }) => {
    if (!Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || seen.has(cell) ||
      (parity !== 'odd' && parity !== 'even')) throw new Error('This puzzle has invalid Odd/Even clues.')
    seen.add(cell)
    let allowed = 0
    for (let digit = parity === 'odd' ? 1 : 2; digit <= size; digit += 2) allowed |= bit(digit)
    return {
      kind: 'parity', cells: [cell],
      label: `The ${parity === 'odd' ? 'circle' : 'square'} at ${cellLabel(cell, size)} requires an ${parity} digit.`,
      support(domains: readonly number[]) {
        const mask = domains[cell] & allowed
        return mask ? [mask] : null
      },
    }
  })
}
