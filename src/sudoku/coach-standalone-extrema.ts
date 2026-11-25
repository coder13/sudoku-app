import type { LatinExtremum } from '../latin/extrema.ts'

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

const empty = (value: unknown) => value === undefined || value === null || value === '' ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)

/** Read source layers separately so each marks its same-layer neighbors as exceptions. */
export function readCoachStandaloneExtrema(value: unknown, size: number): LatinExtremum[] {
  if (!Number.isInteger(size) || size < 3 || size > 9 || !Array.isArray(value) || value.length > 2) {
    throw new Error('This Sudoku Coach export has invalid Minimum or Maximum layers.')
  }
  const extrema: LatinExtremum[] = []
  for (const layer of value) {
    if (!record(layer) || !['minimum', 'maximum'].includes(String(layer.type)) ||
      Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !Array.isArray(layer.segments) || !layer.segments.length || !empty(layer.settings)) {
      throw new Error('This Sudoku Coach export has unsupported Minimum or Maximum settings.')
    }
    const cells = layer.segments.map(segment => {
      if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
        !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
        !Number.isInteger(segment.cells[0]) || segment.cells[0] < 0 || segment.cells[0] >= size ** 2 ||
        !empty(segment.parameters)) throw new Error(`This Sudoku Coach ${layer.type} layer has an invalid cell.`)
      return segment.cells[0] as number
    })
    if (new Set(cells).size !== cells.length) throw new Error(`This Sudoku Coach ${layer.type} layer repeats a cell.`)
    extrema.push({ type: layer.type as 'minimum' | 'maximum', cells, ignoreMarkedNeighbors: true })
  }
  return extrema
}
