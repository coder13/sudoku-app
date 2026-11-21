import { emptyNumberPosition, type NumberPosition } from './progress.ts'

// Each populated cell uses its index, placed digit, center mask, and corner mask.
const cellLength = 7
export const numberPositionTokenLength = 81 * cellLength

export function withImportedNumberPosition(source: NumberPosition | undefined, givens: readonly number[], playerAnnotations = false) {
  if (!source && !playerAnnotations) return {}
  const position = source ?? emptyNumberPosition(givens.length)
  const values = position.values.slice()
  const notes = position.notes.slice()
  const cornerNotes = position.cornerNotes?.slice()
  for (const [cell, given] of givens.entries()) {
    if (!given) continue
    if (values[cell] && values[cell] !== given) {
      throw new Error('The Sudoku Coach progress has a placed digit that replaces a given.')
    }
    values[cell] = notes[cell] = 0
    if (cornerNotes) cornerNotes[cell] = 0
  }
  if (values.some(Boolean) || notes.some(Boolean) || cornerNotes?.some(Boolean) || playerAnnotations) {
    return { initialPosition: { values, notes, ...(cornerNotes?.some(Boolean) && { cornerNotes }),
      ...(playerAnnotations && { annotationsHidden: false }) } }
  }
  return {}
}

export function encodeNumberImportPosition(position?: NumberPosition) {
  if (!position) return ''
  const cells: string[] = []
  const pair = (value: number) => value.toString(36).padStart(2, '0')
  for (const [cell, value] of position.values.entries()) {
    const notes = position.notes[cell]
    const corner = position.cornerNotes?.[cell] ?? 0
    if (value || notes || corner) cells.push(pair(cell) + value + pair(notes) + pair(corner))
  }
  return cells.length ? '.p' + cells.join('') : ''
}

export function readNumberImportPosition(encoded: string, size: number) {
  if (!encoded.length || encoded.length % cellLength) throw new Error('Invalid number puzzle progress.')
  const { values, notes } = emptyNumberPosition(size ** 2)
  const cornerNotes = Array<number>(values.length).fill(0)
  let previous = -1
  for (let offset = 0; offset < encoded.length; offset += cellLength) {
    const cell = Number.parseInt(encoded.slice(offset, offset + 2), 36)
    const value = Number(encoded[offset + 2])
    const center = Number.parseInt(encoded.slice(offset + 3, offset + 5), 36)
    const corner = Number.parseInt(encoded.slice(offset + 5, offset + 7), 36)
    if (!(cell > previous && cell < values.length && Number.isInteger(value) && value <= size &&
      center < 2 ** size && corner < 2 ** size && (value || center || corner))) {
      throw new Error('Invalid number puzzle progress.')
    }
    previous = cell
    values[cell] = value
    notes[cell] = center
    cornerNotes[cell] = corner
  }
  return { values, notes, cornerNotes }
}
