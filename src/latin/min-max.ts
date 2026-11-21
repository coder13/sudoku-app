import { maxMinMaxCells, maxMinMaxTokenLength } from '../number-puzzles/import-token-limits.ts'
import { cellLabel, latinPairSupport, type LatinRule } from './engine.ts'

export type LatinMinMax = { cells: readonly number[]; maximum?: true }

export function minMaxName(maximum?: true) {
  return maximum ? 'Maximum' : 'Minimum'
}

export function minMaxNeighbors(size: number, cell: number, group: ReadonlySet<number>) {
  const adjacent = []
  if (cell >= size) adjacent.push(cell - size)
  if (cell % size > 0) adjacent.push(cell - 1)
  if (cell % size < size - 1) adjacent.push(cell + 1)
  if (cell < size * (size - 1)) adjacent.push(cell + size)
  return adjacent.filter(neighbor => !group.has(neighbor))
}

export function latinMinMaxRules(size: number, groups: readonly LatinMinMax[] = []): LatinRule[] {
  if (!groups.length) return []
  const greater = Array.from({ length: size + 1 }, (_, digit) => ((1 << size) - 1) & ~((1 << digit) - 1))
  let total = 0
  return groups.flatMap(({ cells, maximum }) => {
    total += cells.length
    const group = new Set(cells)
    const name = minMaxName(maximum)
    if (!cells.length || total > maxMinMaxCells || group.size !== cells.length ||
      cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2)) {
      throw new Error(`This puzzle has an invalid ${name} group.`)
    }
    return cells.flatMap(cell => minMaxNeighbors(size, cell, group).map((neighbor): LatinRule => {
      const [less, more] = maximum ? [neighbor, cell] : [cell, neighbor]
      return {
        kind: maximum ? 'maximum' : 'minimum',
        cells: [less, more],
        label: `${cellLabel(cell, size)} is a ${name} cell. Its digit must be ${maximum ? 'larger' : 'smaller'} than the digit in ${cellLabel(neighbor, size)}.`,
        support: domains => latinPairSupport(domains[less], domains[more], greater),
      }
    }))
  })
}

export function encodeLatinMinMax(groups?: readonly LatinMinMax[]) {
  if (!groups?.length) return ''
  const index = (number: number) => number.toString(36).padStart(2, '0')
  return '.b' + groups.map(({ cells, maximum }) => (maximum ? 'x' : 'n') + index(cells.length) +
    cells.map(index).join('')).join('')
}

export function readLatinMinMax(encoded: string): LatinMinMax[] {
  const invalid = () => new Error('This puzzle link has invalid Minimum or Maximum cells.')
  if (!encoded.length || encoded.length > maxMinMaxTokenLength || !/^[0-9a-z]+$/.test(encoded)) throw invalid()
  const groups: LatinMinMax[] = []
  for (let offset = 0; offset < encoded.length;) {
    const kind = encoded[offset++]
    const length = Number.parseInt(encoded.slice(offset, offset + 2), 36)
    offset += 2
    if (kind !== 'n' && kind !== 'x' || !length || length > 81 || offset + 2 * length > encoded.length) throw invalid()
    const cells = Array.from({ length }, (_, index) =>
      Number.parseInt(encoded.slice(offset + 2 * index, offset + 2 * index + 2), 36))
    groups.push({ cells, ...(kind === 'x' && { maximum: true }) })
    offset += 2 * length
  }
  return groups
}
