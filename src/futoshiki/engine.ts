import { compileLatinLines, type LatinLine } from '../latin/lines.ts'
import { compileLatinDiagonals, type LatinDiagonal } from '../latin/diagonals.ts'
import { compileLatinExclusions, type LatinExclusion } from '../latin/exclusions.ts'
import { compileLatinExtrema, type LatinExtremum } from '../latin/extrema.ts'
import { compileLatinKropki, type LatinKropki } from '../latin/kropki.ts'
import { cellLabel, createLatinPuzzle, type LatinPuzzle } from '../latin/engine.ts'
import { latinParityRules, type LatinParity } from '../latin/parity.ts'

export type Inequality = { less: number; greater: number }
export type FutoshikiPuzzle = LatinPuzzle & { inequalities: readonly Inequality[]; parity: readonly LatinParity[]; lines?: readonly LatinLine[]; diagonals?: readonly LatinDiagonal[]; exclusions?: readonly LatinExclusion[]; extrema?: readonly LatinExtremum[]; kropki?: LatinKropki }

export function createFutoshiki(size: number, givens: readonly number[], inequalities: readonly Inequality[], parity: readonly LatinParity[] = [], lines: readonly LatinLine[] = [], diagonals: readonly LatinDiagonal[] = [], exclusions: readonly LatinExclusion[] = [], extrema: readonly LatinExtremum[] = [], kropki?: LatinKropki): FutoshikiPuzzle {
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
  const kropkiRules = kropki ? compileLatinKropki(kropki, size) : []
  return { ...createLatinPuzzle(size, givens, [...extra, ...latinParityRules(size, parity), ...compileLatinLines(lines, size), ...compileLatinDiagonals(diagonals, size), ...compileLatinExclusions(exclusions, size), ...compileLatinExtrema(extrema, size), ...kropkiRules]), inequalities, parity, ...(lines.length && { lines }), ...(diagonals.length && { diagonals }), ...(exclusions.length && { exclusions }), ...(extrema.length && { extrema }), ...(kropki && { kropki }) }
}
