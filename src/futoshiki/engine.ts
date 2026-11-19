import { cellLabel, createLatinPuzzle, type LatinPuzzle } from '../latin/engine.ts'

export type Inequality = { less: number; greater: number }
export type FutoshikiPuzzle = LatinPuzzle & { inequalities: readonly Inequality[] }

export function createFutoshiki(size: number, givens: readonly number[], inequalities: readonly Inequality[]): FutoshikiPuzzle {
  const edges = new Set<string>()
  const extra = inequalities.map(({ less, greater }) => {
    const valid = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < size * size
    const distance = Math.abs(less % size - greater % size)
      + Math.abs(Math.floor(less / size) - Math.floor(greater / size))
    if (!valid(less) || !valid(greater) || distance !== 1) throw new Error('An inequality must join two adjacent cells.')
    const edge = `${Math.min(less, greater)}-${Math.max(less, greater)}`
    if (edges.has(edge)) throw new Error('Use one inequality per cell edge.')
    edges.add(edge)

    return {
      label: `${cellLabel(less, size)} is less than ${cellLabel(greater, size)}`,
      cells: [less, greater],
      support(domains: readonly number[]) {
        const a = domains[less]
        const b = domains[greater]
        if (!a || !b) return null
        const lastB = 1 << (31 - Math.clz32(b))
        const firstA = a & -a
        const allowedA = a & (lastB - 1)
        const allowedB = b & ~(2 * firstA - 1)
        return allowedA && allowedB ? [allowedA, allowedB] : null
      },
    }
  })
  return { ...createLatinPuzzle(size, givens, extra), inequalities }
}
