import type { Deduction, Difficulty } from './engine'

export type PuzzleHint = { title: string; text: string }

export const CELL_REFERENCE_LABELS = {
  automatic: 'Automatic',
  concise: 'Concise',
  verbose: 'Verbose',
}
export type CellReferenceStyle = keyof typeof CELL_REFERENCE_LABELS
export const DEFAULT_CELL_REFERENCE_STYLE: CellReferenceStyle = 'automatic'

export function isCellReferenceStyle(value: unknown): value is CellReferenceStyle {
  return typeof value === 'string' && Object.hasOwn(CELL_REFERENCE_LABELS, value)
}

export const NO_HINT: PuzzleHint = {
  title: 'No hint available', text: 'No supported logical step is available for the current grid.',
}
export const HINT_ERROR: PuzzleHint = {
  title: 'Hint unavailable', text: 'Resolve any conflicts in the grid, then try again.',
}
export const HINT_CANDIDATES_ERROR: PuzzleHint = {
  title: 'Review your candidates',
  text: 'The current candidates rule out the solution. Restore any candidates you removed by mistake, or generate all candidates again.',
}

const TECHNIQUE_LABELS: Record<string, string> = {
  'aic': 'Alternating inference chain',
  'als-chain': 'ALS chain',
  'als-xz': 'ALS-XZ',
  'bug-plus-one': 'BUG+1',
  'empty-rectangle': 'Empty rectangle',
  'grouped-aic': 'Grouped alternating inference chain',
  'multi-sector-locked-sets': 'Multi-sector locked sets',
  'sk-loop': 'SK loop',
  'sue-de-coq': 'Sue de Coq',
  'w-wing': 'W-wing',
  'wxyz-wing': 'WXYZ-wing',
  'x-chain': 'X-chain',
  'x-wing': 'X-wing',
  'xy-chain': 'XY-chain',
  'xy-wing': 'XY-wing',
  'xyz-wing': 'XYZ-wing',
}

const locationList = new Intl.ListFormat('en')

export function techniqueLabel(technique: string): string {
  const known = TECHNIQUE_LABELS[technique]
  if (known) return known
  const words = technique.replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function cellReference(cell: number, style: CellReferenceStyle, difficulty?: Difficulty) {
  const row = Math.floor(cell / 9) + 1
  const column = cell % 9 + 1
  const advanced = difficulty === 'hard' || difficulty === 'unfair' || difficulty === 'extreme'
  const concise = style === 'concise' || (style === 'automatic' && advanced)
  return concise ? `r${row}c${column}` : `row ${row}, column ${column}`
}

export function describeHint(deduction: Deduction, {
  difficulty, cellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE,
}: { difficulty?: Difficulty; cellReferenceStyle?: CellReferenceStyle } = {}): PuzzleHint {
  const title = techniqueLabel(deduction.technique)
  const action = deduction.actions[0]
  if (!action) return { title, text: 'Study the current grid for this technique.' }

  const location = (cell: number) => cellReference(cell, cellReferenceStyle, difficulty)
  if ('place' in action) {
    const { cell, digit } = action.place
    return { title, text: `Place digit ${digit} in ${location(cell)}.` }
  }

  const removals = new Map<number, string[]>()
  for (const result of deduction.actions) {
    if (!('eliminate' in result)) continue
    const { cell, digit } = result.eliminate
    const cells = removals.get(digit) ?? []
    cells.push(location(cell))
    removals.set(digit, cells)
  }
  const text = [...removals].map(([digit, cells]) =>
    `Remove digit ${digit} from the candidates in ${locationList.format(cells)}.`).join(' ')
  return { title, text }
}

export function describeSingleHint([cell, digit]: [number, number], style: CellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE): PuzzleHint {
  return {
    title: 'Single',
    text: `Place digit ${digit} in ${cellReference(cell, style, 'easy')}.`,
  }
}
