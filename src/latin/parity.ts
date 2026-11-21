import { cellLabel, type LatinRule } from './engine.ts'

export type LatinParity = { cell: number; parity: 'odd' | 'even' }

export const latinParityTechnique = 'Odd/Even'

export function latinParityRules(size: number, clues: readonly LatinParity[] = []): LatinRule[] {
  const seen = new Set<number>()
  return clues.map(({ cell, parity }) => {
    if (!Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || seen.has(cell) ||
      (parity !== 'odd' && parity !== 'even')) throw new Error('This puzzle has invalid Odd/Even clues.')
    seen.add(cell)
    const allowed = parity === 'odd' ? 0b101010101 : 0b010101010
    return {
      kind: 'parity', cells: [cell],
      label: `The ${parity === 'odd' ? 'circle' : 'square'} at ${cellLabel(cell, size)} requires an ${parity} digit.`,
      support(domains) {
        const mask = domains[cell] & allowed
        return mask ? [mask] : null
      },
    }
  })
}

export function encodeLatinParity(size: number, clues?: readonly LatinParity[]) {
  if (!clues?.length) return ''
  const cells = Array<string>(size ** 2).fill('0')
  for (const { cell, parity } of clues) cells[cell] = parity === 'odd' ? '1' : '2'
  return '.y' + cells.join('')
}

export function readLatinParity(size: number, encoded: string): LatinParity[] {
  if (encoded.length !== size ** 2 || !/^[012]+$/.test(encoded)) throw new Error('This puzzle has invalid Odd/Even clues.')
  return Array.from(encoded).flatMap<LatinParity>((value, cell) =>
    value === '0' ? [] : [{ cell, parity: value === '1' ? 'odd' : 'even' }])
}
