import { isImportedColor } from './imported-colors.ts'

type Point = readonly [x: number, y: number]
type Symbol = 'circle' | 'square' | 'cross'
export type ImportedDrawing = { shape: 'line'; from: Point; to: Point; color: string }
  | { shape: Symbol; at: Point; color: string }

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate =>
    typeof coordinate === 'number' && Number.isSafeInteger(coordinate * 2))
}

function samePoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function isCellCenter([x, y]: Point, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size && !Number.isInteger(x) && !Number.isInteger(y)
}

function isEdgeMidpoint([x, y]: Point): boolean {
  return Number.isInteger(x) !== Number.isInteger(y)
}

export function validImportedDrawings(value: unknown, size = 9): value is readonly ImportedDrawing[] {
  return Array.isArray(value) && value.length > 0 && value.every(drawing => {
    if (!record(drawing) || !isImportedColor(drawing.color)) return false
    if (drawing.shape === 'line') return isPoint(drawing.from) && isPoint(drawing.to) && !samePoint(drawing.from, drawing.to)
    if (!isPoint(drawing.at)) return false
    return drawing.shape === 'cross' ? isCellCenter(drawing.at, size) || isEdgeMidpoint(drawing.at)
      : (drawing.shape === 'circle' || drawing.shape === 'square') && isCellCenter(drawing.at, size)
  })
}

export function sameImportedDrawings(a?: readonly ImportedDrawing[], b?: readonly ImportedDrawing[]): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((drawing, index) => {
    const other = b[index]
    if (drawing.color !== other.color || drawing.shape !== other.shape) return false
    if (drawing.shape === 'line' && other.shape === 'line') {
      return (samePoint(drawing.from, other.from) && samePoint(drawing.to, other.to)) ||
        (samePoint(drawing.from, other.to) && samePoint(drawing.to, other.from))
    }
    return drawing.shape !== 'line' && other.shape !== 'line' && samePoint(drawing.at, other.at)
  })
}

function readPoint(key: string): Point | undefined {
  const match = /^(-?\d+(?:\.5)?)\/(-?\d+(?:\.5)?)$/.exec(key)
  if (!match) return
  const point: Point = [Number(match[1]), Number(match[2])]
  return isPoint(point) ? point : undefined
}

/** Coach uses grid coordinates for lines and edge crosses, and cell indices for cell symbols. */
export function readCoachQuickDraw(data: Record<string, unknown>, size = 9): readonly ImportedDrawing[] | undefined {
  const result: ImportedDrawing[] = []
  const invalid = () => new Error('This Sudoku Coach progress has invalid or unsupported Quick Draw annotations.')
  for (const field of ['quickDrawLineSegments', 'quickDrawSymbols', 'cells']) {
    const marks = data[field]
    if (marks === undefined) continue
    if (!record(marks)) throw invalid()
    for (const [key, value] of Object.entries(marks)) {
      if (!record(value)) throw invalid()
      // Coach can save a pencil mask with no grid coordinate. It has no cell to annotate.
      if (field === 'cells' && key === 'NaN,NaN' && Object.keys(value).length === 1 &&
        typeof value.cellCandidates === 'number' && Number.isInteger(value.cellCandidates) &&
        value.cellCandidates >= 0 && value.cellCandidates < (1 << size)) continue
      if (field === 'quickDrawLineSegments') {
        const ends = key.split('=>')
        const from = readPoint(ends[0]), to = readPoint(ends[1] ?? '')
        if (ends.length !== 2 || !from || !to || samePoint(from, to) ||
          Object.keys(value).length !== 1 || !isImportedColor(value.colour)) throw invalid()
        result.push({ shape: 'line', from, to, color: value.colour })
      } else {
        const symbol = field === 'cells' ? value.quickSymbol : value
        if (!record(symbol) || Object.keys(symbol).length !== 2 || !isImportedColor(symbol.colour)) throw invalid()
        if (field === 'quickDrawSymbols') {
          const at = readPoint(key)
          if (!at || !isEdgeMidpoint(at) || symbol.shape !== 'cross') throw invalid()
          result.push({ shape: 'cross', at, color: symbol.colour })
        } else {
          if (Object.keys(value).length !== 1 || !/^(?:0|[1-9][0-9]?)$/.test(key) || Number(key) >= size ** 2 ||
            (symbol.shape !== 'circle' && symbol.shape !== 'square' && symbol.shape !== 'cross')) throw invalid()
          const cell = Number(key)
          result.push({ shape: symbol.shape, at: [cell % size + .5, Math.floor(cell / size) + .5], color: symbol.colour })
        }
      }
    }
  }
  return result.length ? result : undefined
}
