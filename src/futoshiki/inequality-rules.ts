import { cellLabel, type LatinRule } from '../latin/engine.ts'
import { inequalityBoundRules, inequalityLineMatchingRules, lineDigitBoundRules, sharedBoundSupport } from './inequality-bounds.ts'
import { inequalityLineRules } from './inequality-lines.ts'
import { inequalityPaths } from './inequality-paths.ts'

export type Inequality = { less: number; greater: number }

// The two neighbors share a line, so they need distinct values.
function sharedBoundRule(
  size: number, first: number, middle: number, last: number, neighborsAreSmaller: boolean,
): LatinRule {
  const line = last - first === 2 ? 'row' : 'column'
  const comparison = neighborsAreSmaller ? 'less' : 'greater'
  const firstEnd = { cell: first, distance: 1 }
  const lastEnd = { cell: last, distance: 1 }
  return {
    kind: 'inequality',
    label: `${cellLabel(first, size)} and ${cellLabel(last, size)} share a ${line} and must contain different numbers. Both numbers are ${comparison} than ${cellLabel(middle, size)}.`,
    cells: [first, middle, last],
    support: domains => sharedBoundSupport(domains, middle, firstEnd, lastEnd, neighborsAreSmaller),
  }
}

export function inequalityRules(size: number, inequalities: readonly Inequality[]) {
  const smallerByEdge = new Map<string, number>()
  const basic = inequalities.map<LatinRule>(({ less, greater }) => {
    const valid = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < size * size
    const distance = Math.abs(less % size - greater % size)
      + Math.abs(Math.floor(less / size) - Math.floor(greater / size))
    if (!valid(less) || !valid(greater) || distance !== 1) throw new Error('An inequality must join two adjacent cells.')
    const edge = `${Math.min(less, greater)}-${Math.max(less, greater)}`
    if (smallerByEdge.has(edge)) throw new Error('Use one inequality per cell edge.')
    smallerByEdge.set(edge, less)

    return {
      kind: 'inequality',
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
  const sharedBounds: LatinRule[] = []
  function addSharedBound(first: number, middle: number, last: number) {
    const smallerBefore = smallerByEdge.get(`${first}-${middle}`)
    const smallerAfter = smallerByEdge.get(`${middle}-${last}`)
    if (smallerBefore === first && smallerAfter === last) {
      sharedBounds.push(sharedBoundRule(size, first, middle, last, true))
    } else if (smallerBefore === middle && smallerAfter === middle) {
      sharedBounds.push(sharedBoundRule(size, first, middle, last, false))
    }
  }
  for (let middle = 0; middle < size * size; middle++) {
    const column = middle % size
    if (column > 0 && column < size - 1) addSharedBound(middle - 1, middle, middle + 1)
    if (middle >= size && middle < size * size - size) addSharedBound(middle - size, middle, middle + size)
  }
  const paths = inequalities.length >= 3 ? inequalityPaths(size, inequalities) : undefined
  const { direct, chains } = inequalityLineRules(size, smallerByEdge, paths?.successors)
  return {
    basic,
    sharedBounds,
    lineRules: [
      ...direct, ...(paths ? inequalityBoundRules(size, paths) : []), ...chains,
      ...(paths ? lineDigitBoundRules(size, paths) : []),
    ],
    lineMatching: paths ? inequalityLineMatchingRules(size, paths) : [],
  }
}
