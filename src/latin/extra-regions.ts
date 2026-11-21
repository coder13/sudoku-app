import { maxExtraRegionCells, maxExtraRegionTokenLength } from '../number-puzzles/import-token-limits.ts'
import { distinctCellSupport, type LatinRule } from './engine.ts'

export const extraRegionTechnique = 'Extra region'
export const extraRegionNote = 'Digits cannot repeat in an outlined extra region.'

export function latinExtraRegionRules(size: number, regions: readonly (readonly number[])[] = []): LatinRule[] {
  let total = 0
  return regions.map((cells, index) => {
    total += cells.length
    if (!cells.length || cells.length > size || total > maxExtraRegionCells || new Set(cells).size !== cells.length ||
      cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2)) {
      throw new Error('This puzzle has an invalid extra region.')
    }
    // Only a full-size region must contain every digit. Smaller regions only forbid repeats.
    const requiredDigits = cells.length === size ? (1 << size) - 1 : 0
    return {
      kind: 'extra-region', cells,
      label: `Digits cannot repeat in extra region ${index + 1}.`,
      support: domains => distinctCellSupport(cells, domains, requiredDigits),
    }
  })
}

export function encodeLatinExtraRegions(regions?: readonly (readonly number[])[]) {
  if (!regions?.length) return ''
  return '.r' + regions.map(cells => cells.length.toString(36) +
    cells.map(cell => cell.toString(36).padStart(2, '0')).join('')).join('')
}

export function readLatinExtraRegions(encoded: string): number[][] {
  const invalid = () => new Error('This puzzle link has invalid extra regions.')
  if (!encoded.length || encoded.length > maxExtraRegionTokenLength || !/^[0-9a-z]+$/.test(encoded)) throw invalid()
  const regions: number[][] = []
  for (let offset = 0; offset < encoded.length;) {
    const length = Number.parseInt(encoded[offset++], 36)
    if (length < 1 || length > 9 || offset + 2 * length > encoded.length) throw invalid()
    const cells = Array.from({ length }, (_, index) => Number.parseInt(encoded.slice(offset + 2 * index, offset + 2 * index + 2), 36))
    regions.push(cells)
    offset += 2 * length
  }
  return regions
}
