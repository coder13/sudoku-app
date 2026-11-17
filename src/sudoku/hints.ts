import type { Deduction, Difficulty, HintChoice } from './engine'

export type PuzzleHint = { title: string; text: string }
export type HintRemoval = { digit: number; cells: string[] }

const hintStages = ['technique', 'digits', 'location', 'explanation'] as const
const recoveryStages = ['technique', 'location', 'explanation'] as const
export type HintStage = typeof hintStages[number]

export function moveHintStage(stage: HintStage, offset: -1 | 1, recovery = false): HintStage {
  const stages: readonly HintStage[] = recovery ? recoveryStages : hintStages
  const index = stages.indexOf(stage)
  return index === -1 ? stage : stages[index + offset] ?? stage
}

export function moveHintIndex(index: number, count: number, offset: -1 | 1): number {
  if (count < 1) return 0
  return offset === 1 ? (index + 1) % count : Math.max(0, index - 1)
}

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
  'als-aic': 'ALS alternating inference chain',
  'als-discontinuous-nice-loop': 'ALS discontinuous Nice Loop',
  'als-continuous-nice-loop': 'ALS continuous Nice Loop',
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

export function describeHintDigits({ pattern, actions }: HintChoice): string {
  const candidates = pattern?.candidates.length ? pattern.candidates
    : actions.map((action) => 'place' in action ? action.place : action.eliminate)
  const digits = [...new Set(candidates.map(({ digit }) => digit))].sort((left, right) => left - right)
  return `Look for ${digits.length === 1 ? 'digit ' : 'digits '}${locationList.format(digits.map(String))}.`
}

export function describeHintRemovals(deduction: Deduction, {
  difficulty, cellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE,
}: { difficulty?: Difficulty; cellReferenceStyle?: CellReferenceStyle } = {}): HintRemoval[] {
  const removals = new Map<number, Set<string>>()
  for (const action of deduction.actions) {
    if (!('eliminate' in action)) continue
    const { cell, digit } = action.eliminate
    const cells = removals.get(digit) ?? new Set<string>()
    cells.add(cellReference(cell, cellReferenceStyle, difficulty))
    removals.set(digit, cells)
  }
  return [...removals].map(([digit, cells]) => ({ digit, cells: [...cells] }))
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

  const text = describeHintRemovals(deduction, { difficulty, cellReferenceStyle }).map(({ digit, cells }) =>
    `Remove digit ${digit} from the candidates in ${locationList.format(cells)}.`).join(' ')
  return { title, text }
}

export function describeSingleHint([cell, digit]: [number, number], style: CellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE): PuzzleHint {
  return {
    title: 'Single',
    text: `Place digit ${digit} in ${cellReference(cell, style, 'easy')}.`,
  }
}
