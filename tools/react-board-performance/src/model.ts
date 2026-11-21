import { COLORS, DIGITS, marksOf, peer } from '../../../src/sudoku/game'
import { activeHighlightDigit } from '../../../src/sudoku/highlighting'

export { DIGITS }
export type Implementation = 'baseline' | 'optimized'
export type Fixture = 'puzzle' | 'dense'
export type InputMode = 'pen' | 'pencil' | 'highlight' | 'color'

export interface BoardState {
  givens: string
  values: string
  center: number[]
  corner: number[]
  colors: number[]
  candidateColors: Record<number, Record<number, number>>
  selected: number[]
  active: number
  highlightedDigit: number | null
}

export type Action =
  | { type: 'select'; cell: number; extend?: boolean }
  | { type: 'value'; cell: number; digit: number }
  | { type: 'candidate'; cell: number; digit: number }
  | { type: 'highlight'; digit: number | null }
  | { type: 'color'; cell: number; color: number }
  | { type: 'candidate-color'; cell: number; digit: number; color: number }

export interface BoardAdapter {
  update(state: BoardState): void
  dispose(): void
}

/** These projections are readiness probes for classic timing fixtures, never a replacement renderer. */
export interface CellInput {
  index: number
  value: number
  given: boolean
  mask: number
  color: number
  candidateColors: Record<number, number> | undefined
  selected: boolean
  active: boolean
  related: boolean
  focusDigit: number | null
}

export interface CellDescription {
  className: string
  label: string
  digits: number[]
}

export const GIVEN_PUZZLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

export function createFixture(fixture: Fixture = 'puzzle'): BoardState {
  const givens = fixture === 'dense' ? '0'.repeat(81) : GIVEN_PUZZLE
  const center = Array.from({ length: 81 }, (_, cell) => {
    if (givens[cell] !== '0') return 0
    return DIGITS.reduce((mask, digit) => [...givens].some((value, index) =>
      Number(value) === digit && peer(cell, index)) ? mask : mask | (1 << (digit - 1)), 0)
  })
  const active = givens.indexOf('0')
  return { givens, values: givens, center, corner: Array(81).fill(0), colors: Array(81).fill(0),
    candidateColors: {}, selected: [active], active, highlightedDigit: null }
}

export function reduceAction(state: BoardState, action: Action): BoardState {
  if (action.type === 'highlight') return { ...state, highlightedDigit: action.digit }
  const cell = action.cell
  if (!Number.isInteger(cell) || cell < 0 || cell >= 81) return state
  if (action.type === 'select') {
    const selected = action.extend ? [...new Set([...state.selected, cell])] : [cell]
    return { ...state, selected, active: cell }
  }
  if (action.type === 'color') {
    const colors = state.colors.slice()
    colors[cell] = action.color
    return { ...state, colors }
  }
  if (action.type === 'candidate-color') {
    return { ...state, candidateColors: { ...state.candidateColors,
      [cell]: { ...state.candidateColors[cell], [action.digit]: action.color } } }
  }
  if (state.givens[cell] !== '0') return state
  if (action.type === 'candidate') {
    if (state.values[cell] !== '0' || action.digit < 1 || action.digit > 9) return state
    const center = state.center.slice()
    center[cell] ^= 1 << (action.digit - 1)
    return { ...state, center }
  }
  if (action.digit < 0 || action.digit > 9) return state
  const values = state.values.slice(0, cell) + action.digit + state.values.slice(cell + 1)
  return { ...state, values }
}

/** Shared readiness projection for the four classic timing workloads. */
export function cellInputs(state: BoardState): CellInput[] {
  const focusDigit = activeHighlightDigit(state.values, state.selected, state.active, state.highlightedDigit)
  return Array.from({ length: 81 }, (_, index) => ({
    index, value: Number(state.values[index]), given: state.givens[index] !== '0',
    mask: state.center[index] | state.corner[index], color: state.colors[index],
    candidateColors: state.candidateColors[index], selected: state.selected.includes(index),
    active: state.active === index, related: state.selected.some(cell => peer(index, cell)), focusDigit,
  }))
}

export function describeCell(cell: CellInput): CellDescription {
  const digits = marksOf(cell.mask)
  const candidateMatches = !cell.value && cell.focusDigit != null && Boolean(cell.mask & (1 << (cell.focusDigit - 1)))
  const candidateLabel = cell.candidateColors && digits.map(digit => {
    const color = cell.candidateColors?.[digit]
    return color ? `${digit} ${COLORS[color - 1].toLowerCase()}` : ''
  }).filter(Boolean).join(', ')
  return {
    digits,
    className: ['cell', cell.given ? 'given' : 'entry', cell.related ? 'peer' : '',
      cell.value === cell.focusDigit ? 'matching' : '', cell.color ? `colored color-${cell.color}` : '',
      cell.selected ? 'selected' : ''].filter(Boolean).join(' '),
    label: [`Row ${Math.floor(cell.index / 9) + 1}, column ${cell.index % 9 + 1}`,
      cell.value ? (cell.given ? `given ${cell.value}` : `digit ${cell.value}`) : 'empty',
      !cell.value && digits.length ? `candidates ${digits.join(' ')}` : '',
      cell.color ? COLORS[cell.color - 1] : '', !cell.value && candidateLabel,
      candidateMatches ? `candidate ${cell.focusDigit} highlighted` : '',
    ].filter(Boolean).join(', '),
  }
}

export function candidateClass(cell: CellInput, digit: number) {
  const color = cell.candidateColors?.[digit]
  return ['board-candidate', color ? `candidate-color color-${color}` : '',
    digit === cell.focusDigit ? 'candidate-match' : ''].filter(Boolean).join(' ')
}

export function candidateGridArea(digit: number) {
  return `${Math.floor((digit - 1) / 3) + 1} / ${(digit - 1) % 3 + 1}`
}

/** Host interaction is shared; renderers keep native cell buttons and semantics. */
export const noopCell = () => {}
