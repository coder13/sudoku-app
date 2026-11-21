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
export type CellReferenceOptions = { difficulty?: Difficulty; cellReferenceStyle?: CellReferenceStyle; gridSize?: number }
export const DEFAULT_CELL_REFERENCE_STYLE: CellReferenceStyle = 'automatic'

export function isCellReferenceStyle(value: unknown): value is CellReferenceStyle {
  return typeof value === 'string' && Object.hasOwn(CELL_REFERENCE_LABELS, value)
}

export const NO_HINT: PuzzleHint = {
  title: 'No hint available', text: 'The solver found no logical move with the current settings and candidates.',
}
export const HINT_ERROR: PuzzleHint = {
  title: 'Hint unavailable', text: 'Check the grid for conflicting digits, then try the hint again.',
}
export const HINT_CANDIDATES_ERROR: PuzzleHint = {
  title: 'Review your candidates',
  text: 'A digit the solution needs is missing from your candidates. Restore the missing candidate or generate candidates again.',
}

const TECHNIQUE_LABELS: Record<string, string> = {
  'consecutive-run': 'Consecutive Line',
  'distinct-cells': 'Shaded group',
  'algebraic-cage-bounds': 'Algebraic cage bounds',
  'sized-contradiction': 'Candidate contradiction',
  'sized-diagonal': 'Diagonal',
  'sized-parity': 'Odd and even',
  'sized-thermometer': 'Thermometer',
  'sized-quadruple': 'Quadruple',
  'sized-renban': 'Renban',
  'sized-kropki': 'Kropki',
  'sized-killer-cages': 'Killer Cages',
  'sized-extra-house': 'Extra Region',
  'sized-labeled-dots': 'Difference and Ratio dots',
  'sized-difference': 'Difference',
  'sized-anti-sum': 'Anti-Sum',
  'sized-row-column-sum': 'Row and Column Sum Diamonds',
  'sized-arrow': 'Arrow',
  'sized-double-arrow': 'Double Arrow',
  'sized-region-sum': 'Region Sum',
  'whispers-house-support': 'Whispers and shared houses',
  'renban-locked-digit': 'Renban locked digit',
  'renban-house-support': 'Renban in one house',
  'renban-group-counts': 'Renban and group counts',
  'renban-sum': 'Renban and Little Killer',
  'little-killer-house-support': 'Little Killer and shared houses',
  'renban-sum-ray-houses': 'Renban sum and shared houses',
  'renban-sum-house': 'Renban and Little Killer with a shared house',
  '3d-medusa': '3D Medusa',
  'non-consecutive-locked-candidates-2': 'Non-Consecutive locked candidates (2 cells)',
  'non-consecutive-locked-candidates-3': 'Non-Consecutive locked candidates (3 cells)',
  'non-consecutive-bivalue': 'Non-Consecutive bivalue',
  'non-consecutive-trivalue': 'Non-Consecutive trivalue',
  'aic': 'Alternating inference chain',
  'als-chain': 'ALS chain',
  'als-aic': 'ALS alternating inference chain',
  'als-discontinuous-nice-loop': 'ALS discontinuous Nice Loop',
  'als-continuous-nice-loop': 'ALS continuous Nice Loop',
  'als-xz': 'ALS-XZ',
  'als-xy-wing': 'ALS-XY-Wing',
  'bug-plus-one': 'BUG+1',
  'death-blossom': 'Death Blossom',
  'empty-rectangle': 'Empty rectangle',
  'finned-x-wing': 'Finned X-wing',
  'firework-aic': 'Firework AIC',
  'firework-als-wing': 'Firework ALS-Wing',
  'firework-l-wing': 'Firework L-Wing',
  'firework-w-wing': 'Firework W-Wing',
  'grouped-aic': 'Grouped alternating inference chain',
  'hidden-single-box': 'Hidden single in a box',
  'multi-sector-locked-sets': 'Multi-sector locked sets',
  'sk-loop': 'SK loop',
  'sashimi-x-wing': 'Sashimi X-wing',
  'sue-de-coq': 'Sue de Coq',
  'pattern-overlay': 'Pattern Overlay',
  'pairwise-pattern-overlay': 'Two-digit Pattern Overlay',
  'triple-pattern-overlay': 'Three-digit Pattern Overlay',
  'quadruple-pattern-overlay': 'Four-digit Pattern Overlay',
  'quintuple-pattern-overlay': 'Five-digit Pattern Overlay',
  'tridagon-aic': 'Tridagon AIC',
  'unique-rectangle-aic': 'Unique Rectangle alternating inference chain',
  'unique-rectangle-discontinuous-nice-loop': 'Unique Rectangle discontinuous Nice Loop',
  'unique-rectangle-continuous-nice-loop': 'Unique Rectangle continuous Nice Loop',
  'w-wing': 'W-wing',
  'wxyz-wing': 'WXYZ-Wing',
  'x-chain': 'X-chain',
  'xv': 'XV pairs',
  'entropy-quadruple': 'Quadruples and Global Entropy',
  'adjacent-total': 'Two-cell sums',
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

export function cellReference(cell: number, style: CellReferenceStyle, difficulty?: Difficulty, gridSize = 9) {
  const row = Math.floor(cell / gridSize) + 1
  const column = cell % gridSize + 1
  const advanced = difficulty !== undefined && ['tricky', 'hard', 'very-hard', 'expert', 'master', 'unfair', 'extreme', 'impossible'].includes(difficulty)
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
  difficulty, cellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE, gridSize,
}: CellReferenceOptions = {}): HintRemoval[] {
  const removals = new Map<number, Set<string>>()
  for (const action of deduction.actions) {
    if (!('eliminate' in action)) continue
    const { cell, digit } = action.eliminate
    const cells = removals.get(digit) ?? new Set<string>()
    cells.add(cellReference(cell, cellReferenceStyle, difficulty, gridSize))
    removals.set(digit, cells)
  }
  return [...removals].map(([digit, cells]) => ({ digit, cells: [...cells] }))
}

export function describeHint(deduction: Deduction, {
  difficulty, cellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE, gridSize,
}: CellReferenceOptions = {}): PuzzleHint {
  const title = techniqueLabel(deduction.technique)
  const action = deduction.actions[0]
  if (!action) return { title, text: 'Look for this technique in the current grid.' }

  const location = (cell: number) => cellReference(cell, cellReferenceStyle, difficulty, gridSize)
  if ('place' in action) {
    const { cell, digit } = action.place
    return { title, text: `Place ${digit} in ${location(cell)}.` }
  }

  const text = describeHintRemovals(deduction, { difficulty, cellReferenceStyle, gridSize }).map(({ digit, cells }) =>
    `Remove ${digit} from ${locationList.format(cells)}.`).join(' ')
  return { title, text }
}

export function describeSingleHint([cell, digit]: [number, number], style: CellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE, gridSize = 9): PuzzleHint {
  return {
    title: 'Single',
    text: `Place ${digit} in ${cellReference(cell, style, 'easy', gridSize)}.`,
  }
}
