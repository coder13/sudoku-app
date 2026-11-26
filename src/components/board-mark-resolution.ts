import { COLORS } from '../sudoku/game'
import { importedColorLabel } from '../sudoku/imported-colors'
import type { CandidateAnnotation } from './BoardAnnotations'

type CandidateMarks = {
  annotation?: CandidateAnnotation
  color?: number
  imported?: string
}

/** Return the visible paint and annotation names for every rendering of a candidate. */
export function candidateMarkDescriptions({ annotation, color, imported }: CandidateMarks) {
  const colorName = Number.isInteger(color) && color! > 0 && color! <= COLORS.length
    ? COLORS[color! - 1].toLowerCase()
    : imported ? importedColorLabel(imported) : undefined
  return [annotation?.label, colorName && `${colorName} color`].filter((label): label is string => Boolean(label))
}
