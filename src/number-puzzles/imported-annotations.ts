import { validAuthoredCornerPaths, type AuthoredCornerPath } from '../sudoku/authored-artwork.ts'
import { isImportedColor, validImportedCellColors, type CandidateColors, type ImportedCellColors } from '../sudoku/imported-colors.ts'
import { validImportedDrawings, type ImportedDrawing } from '../sudoku/imported-drawings.ts'
import { numberAnnotationTokenLength } from './import-token-limits.ts'

export type NumberImportAnnotations = {
  givenColors?: ImportedCellColors
  givenDrawings?: readonly ImportedDrawing[]
  authoredPaths?: readonly AuthoredCornerPath[]
  cellColors?: ImportedCellColors
  candidateColors?: CandidateColors<string>
  drawings?: readonly ImportedDrawing[]
}

export function hasPlayerNumberAnnotations(annotations?: NumberImportAnnotations) {
  return Boolean(annotations?.cellColors || annotations?.candidateColors || annotations?.drawings)
}

export function encodeNumberImportAnnotations(annotations?: NumberImportAnnotations) {
  if (!annotations) return ''
  const { givenColors, givenDrawings, cellColors, candidateColors, drawings, authoredPaths } = annotations
  if (!givenColors && !givenDrawings && !cellColors && !candidateColors && !drawings && !authoredPaths) return ''
  // Keep the existing five-slot format for links without authored paths.
  const fields = [givenColors, givenDrawings, cellColors, candidateColors, drawings, ...(authoredPaths ? [authoredPaths] : [])]
  const encoded = btoa(JSON.stringify(fields))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  if (encoded.length > numberAnnotationTokenLength) throw new Error('This puzzle has too many annotations to save in a play link.')
  return '.a' + encoded
}

function validCells(colors: unknown, size: number): colors is ImportedCellColors {
  return validImportedCellColors(colors) && Object.keys(colors).length > 0 &&
    Object.keys(colors).every(cell => Number(cell) < size ** 2)
}

function validCandidates(colors: unknown, size: number): colors is CandidateColors<string> {
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return false
  const cells = Object.entries(colors)
  return cells.length > 0 && cells.every(([cell, marks]) =>
    /^(?:0|[1-9][0-9]?)$/.test(cell) && Number(cell) < size ** 2 &&
    marks && typeof marks === 'object' && !Array.isArray(marks) &&
    Object.keys(marks).length > 0 && Object.entries(marks).every(([digit, color]) =>
      /^[1-9]$/.test(digit) && Number(digit) <= size && isImportedColor(color)))
}

export function readNumberImportAnnotations(encoded: string, size: number): NumberImportAnnotations {
  if (!encoded.length || encoded.length > numberAnnotationTokenLength) throw new Error('Invalid puzzle annotations.')
  const data: unknown = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')))
  if (!Array.isArray(data) || data.length !== 5 && data.length !== 6) throw new Error('Invalid puzzle annotations.')
  const [givenColors, givenDrawings, cellColors, candidateColors, drawings, authoredPaths] = data
  if (givenColors !== null && !validCells(givenColors, size) ||
    givenDrawings !== null && !validImportedDrawings(givenDrawings, size) ||
    cellColors !== null && !validCells(cellColors, size) ||
    candidateColors !== null && !validCandidates(candidateColors, size) ||
    drawings !== null && !validImportedDrawings(drawings, size) ||
    data.length === 6 && !validAuthoredCornerPaths(authoredPaths, size)) throw new Error('Invalid puzzle annotations.')
  return { ...(givenColors && { givenColors }), ...(givenDrawings && { givenDrawings }), ...(cellColors && { cellColors }),
    ...(candidateColors && { candidateColors }), ...(drawings && { drawings }), ...(authoredPaths && { authoredPaths }) }
}
