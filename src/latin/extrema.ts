import { cellLabel, type LatinRule } from './engine.ts'

export type LatinExtremum = {
  type: 'minimum' | 'maximum'
  cells: readonly number[]
  ignoreMarkedNeighbors?: boolean
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function validLatinExtrema(value: unknown, size: number): value is readonly LatinExtremum[] {
  return Number.isInteger(size) && size >= 3 && size <= 9 && Array.isArray(value) && value.length <= 2 &&
    value.every((extremum: unknown) => {
      if (!record(extremum) || (extremum.type !== 'minimum' && extremum.type !== 'maximum') ||
        !Array.isArray(extremum.cells) || !extremum.cells.length || extremum.cells.length > size ** 2 ||
        !extremum.cells.every((cell: unknown) => Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) < size ** 2) ||
        new Set(extremum.cells).size !== extremum.cells.length ||
        (extremum.ignoreMarkedNeighbors !== undefined && typeof extremum.ignoreMarkedNeighbors !== 'boolean') ||
        Object.keys(extremum).some(key => !['type', 'cells', 'ignoreMarkedNeighbors'].includes(key))) return false
      return true
    })
}

function orderedRule(less: number, greater: number, size: number, kind: 'minimum' | 'maximum'): LatinRule {
  return {
    kind,
    cells: [less, greater],
    label: `${cellLabel(less, size)} must be lower than ${cellLabel(greater, size)} (${kind})`,
    support(domains) {
      const a = domains[less], b = domains[greater]
      if (!a || !b) return null
      let allowedA = 0, allowedB = 0
      for (let digitA = 1; digitA <= size; digitA++) if (a & (1 << (digitA - 1))) {
        for (let digitB = digitA + 1; digitB <= size; digitB++) if (b & (1 << (digitB - 1))) {
          allowedA |= 1 << (digitA - 1)
          allowedB |= 1 << (digitB - 1)
        }
      }
      return allowedA && allowedB ? [allowedA, allowedB] : null
    },
  }
}

export function compileLatinExtrema(extrema: readonly LatinExtremum[], size: number): LatinRule[] {
  if (!Number.isInteger(size) || size < 3 || size > 9 || !validLatinExtrema(extrema, size)) {
    throw new Error('This Latin puzzle has invalid Minimum or Maximum cells.')
  }
  const rules: LatinRule[] = []
  for (const extremum of extrema) {
    const marked = new Set(extremum.cells)
    for (const cell of extremum.cells) {
      const row = Math.floor(cell / size), column = cell % size
      const neighbors = [row ? cell - size : -1, row + 1 < size ? cell + size : -1,
        column ? cell - 1 : -1, column + 1 < size ? cell + 1 : -1].filter(other => other >= 0)
      for (const neighbor of neighbors) {
        if (extremum.ignoreMarkedNeighbors && marked.has(neighbor)) continue
        const [less, greater] = extremum.type === 'minimum' ? [cell, neighbor] : [neighbor, cell]
        rules.push(orderedRule(less, greater, size, extremum.type))
      }
    }
  }
  return rules
}
