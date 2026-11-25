import { validLatinLines, type LatinLine } from '../latin/lines.ts'
import { coachConnectedLines, coachEntropicGroups } from './coach-lines.ts'
import { isHexColor } from './imported-colors.ts'

export const isCoachStandaloneLine = (value: unknown) => value === 'thermometer' || value === 'renban' ||
  value === 'entropicLine' || value === 'modularLine' || value === 'betweenLine' || value === 'lockoutLine' || value === 'arrow'
const styling = new Set(['colour', 'colourSync', 'lineThickness', 'lineEndOffset', 'borderColour', 'borderThickness', 'opacity'])
const arrowStyling = new Set([...styling, 'bulbSize', 'bulbBorderThickness', 'bulbBorderColour', 'bulbFillColour', 'arrowHeadLength'])

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function readCoachStandaloneLine(layer: Record<string, unknown>, size: number): LatinLine[] {
  const { type, settings, segments } = layer
  const allowedStyling = type === 'arrow' ? arrowStyling : styling
  if (!isCoachStandaloneLine(type) || !Array.isArray(segments) || segments.length > 128 ||
    Object.keys(layer).some(key => !['type', 'id', 'segments', 'settings'].includes(key)) ||
    settings != null && (!record(settings) || Object.keys(settings).some(key => !allowedStyling.has(key)))) {
    throw new Error('This Sudoku Coach export has unsupported line settings.')
  }
  const paths = segments.map(segment => {
    if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
      !Array.isArray(segment.cells) || !segment.cells.length || segment.cells.length > 128 ||
      segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2) ||
      segment.parameters != null && (!record(segment.parameters) || Object.keys(segment.parameters).length)) {
      throw new Error('This Sudoku Coach export has an invalid line path.')
    }
    return segment.cells as number[]
  })
  if (!paths.length) throw new Error('This Sudoku Coach export has no line paths.')
  const color = record(settings) && isHexColor(settings.colour) ? settings.colour : undefined
  const lines: LatinLine[] = type === 'thermometer' ? paths.map(cells => ({ type, cells, ...(color && { color }) }))
    : type === 'entropicLine' ? paths.map(cells => ({ type: 'entropic' as const, cells, groups: coachEntropicGroups(size) }))
      : type === 'modularLine' ? paths.map(cells => ({ type: 'modular' as const, cells }))
        : type === 'betweenLine' ? paths.map(cells => ({ type: 'between' as const, cells }))
          : type === 'lockoutLine' ? paths.map(cells => ({ type: 'lockout' as const, cells, minDifference: 4 as const }))
            : type === 'arrow' ? paths.map(([circle, ...cells]) => ({ type: 'arrow' as const, circle, cells }))
              : coachConnectedLines(paths).map(line => ({ type: 'renban' as const, ...line }))
  if (!validLatinLines(lines, size)) throw new Error('This Sudoku Coach export has an invalid Thermometer or Renban line.')
  return lines
}
