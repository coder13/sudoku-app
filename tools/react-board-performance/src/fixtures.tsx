import type { ComponentProps } from 'react'
import { Board } from '../../../src/components/Board'
import type { VariantRule } from '../../../src/sudoku/engine'
import { MINI_GRID, sixGridForBoxRows } from '../../../src/sudoku/grid'
import { createFixture, type BoardState } from './model'

export type BoardProps = ComponentProps<typeof Board>
export type Scenario = { id: string; states: BoardProps[] }
export const noopCell = () => {}

export function propsFromState(state: BoardState): BoardProps {
  return {
    givens: state.givens, values: state.values,
    position: { center: state.center, corner: state.corner, colors: state.colors, candidateColors: state.candidateColors },
    selected: state.selected, active: state.active, highlightedDigit: state.highlightedDigit,
    showGuides: true, onCell: noopCell, dragSelect: true,
  }
}

/** Freeze input data to catch mutations. Refs and callbacks are supplied separately by interaction tests. */
export function freezeInputs<T>(value: T, visited = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object' || visited.has(value)) return value
  visited.add(value)
  if (value instanceof Map) {
    for (const [key, item] of value) { freezeInputs(key, visited); freezeInputs(item, visited) }
    if (!Object.isFrozen(value)) for (const method of ['set', 'delete', 'clear']) {
      Object.defineProperty(value, method, { value: () => { throw new Error('A renderer mutated a fixture Map.') } })
    }
  } else if (value instanceof Set) {
    for (const item of value) freezeInputs(item, visited)
    if (!Object.isFrozen(value)) for (const method of ['add', 'delete', 'clear']) {
      Object.defineProperty(value, method, { value: () => { throw new Error('A renderer mutated a fixture Set.') } })
    }
  }
  else for (const item of Object.values(value)) freezeInputs(item, visited)
  return Object.freeze(value)
}

export function scenarios(): Scenario[] {
  const regular = propsFromState(createFixture('puzzle'))
  const dense = propsFromState(createFixture('dense'))
  const center = Array(81).fill(0), corner = Array(81).fill(0), colors = Array(81).fill(0)
  center[2] = 5; corner[2] = 10; center[3] = 21; corner[3] = 34; colors[2] = 2
  const notes: BoardProps = { ...regular, candidateLayout: 'center-corner',
    position: { center, corner, colors, candidateColors: { 2: { 1: 3, 2: 4, 4: 5 } } } }
  const annotations: BoardProps['annotations'] = {
    cells: new Map([[2, { fill: '#b8e3cf', ink: '#163d28', label: 'Highlighted premise' }]]),
    candidates: new Map([[2, new Map([
      [1, { color: '#e45d77', mark: 'ring' as const, label: 'First branch' }],
      [2, { color: '#5d72e4', mark: 'emphasized' as const, label: 'Second branch' }],
      [8, { color: '#9d4bce', mark: 'strike' as const, strike: true, label: 'Eliminated' }],
    ])]]),
    links: [
      { from: { cell: 2, digit: 1 }, to: { cell: 3, digit: 1 }, color: '#e45d77', arrow: true, selectFrom: { cell: 2, digit: 1 } },
      { from: { cells: [2, 11], digit: 2 }, to: { candidates: [{ cell: 3, digit: 2 }, { cell: 12, digit: 2 }] },
        color: '#5d72e4', dashed: true, muted: true, colorBreak: true },
    ],
  }
  const result: Scenario[] = [
    { id: 'classic-selection-errors', states: [regular,
      { ...regular, selected: [2, 3, 11], active: 3, errors: new Set([2, 3]), pointerFocusedCell: 3 },
      { ...regular, selected: [], active: 0, errors: new Set() }] },
    { id: 'center-corner-previews', states: [notes,
      { ...notes, candidatePreview: { cell: 2, digit: 1, mode: 'center' } },
      { ...notes, candidatePreview: { cell: 2, digit: 9, mode: 'center' } },
      { ...notes, candidatePreview: { cell: 2, digit: 2, mode: 'corner' } },
      { ...notes, candidatePreview: { cell: 2, digit: 8, mode: 'corner' } },
      { ...notes, candidateLayout: 'grid', candidatePreview: { cell: 2, digit: 9, mode: 'candidate' } }] },
    { id: 'external-candidates-colors', states: [notes,
      { ...notes, candidates: Array(81).fill(511) },
      { ...notes, candidates: Array(81).fill(7), onCandidate: () => {} },
      { ...notes, showPlayerColors: false }, { ...notes, showPlayerColors: true }] },
    { id: 'candidate-highlight-modes', states: [dense,
      { ...dense, highlightedDigit: 3 },
      { ...dense, highlightedDigit: 3, highlightCandidateCells: true },
      { ...dense, highlightedDigitMask: 5, highlightedDigitMatch: 'all' },
      { ...dense, highlightedDigitMask: 5, highlightedDigitMatch: 'any', highlightCandidateCells: true },
      { ...dense, highlightCandidateCount: 9 },
      { ...dense, highlightCandidateCount: 9, highlightCandidateCells: true },
      { ...dense, highlightedDigit: 1, highlighting: { relatedCells: false, matchingDigits: false, matchingCandidates: false } }] },
    { id: 'annotations-links-insets', states: [{ ...notes, annotations, showAnnotatedCandidates: true },
      { ...notes, annotations, showAnnotatedCandidates: true, candidatePreview: { cell: 2, digit: 8, mode: 'center' } },
      { ...notes, annotations: { ...annotations, links: annotations.links!.slice(1) }, showAnnotatedCandidates: true },
      { ...notes, annotations: { cells: new Map(), candidates: new Map(), links: [] } }] },
    { id: 'region-guides-overlay-mode', states: [regular,
      { ...regular, region: { row: 0, column: 1, rows: 3, columns: 4 }, showGuides: false },
      { ...regular, descriptionId: 'board-description', modeBorder: 'pencil', modeBadge: <span className="test-mode-badge">Pencil</span> },
      { ...regular, overlay: { content: <span>Paused</span>, visible: true } },
      { ...regular, overlay: { content: <span>Paused</span>, visible: false } },
      { ...regular, onCell: undefined }] },
  ]

  const rules: VariantRule[] = [
    { type: 'diagonal', diagonal: 'main' },
    { type: 'extra-house', cells: [0, 3, 6, 27, 30, 33, 54, 57, 60] },
    { type: 'killer-cages', cages: [{ cells: [0, 1, 9], sum: 12 }, { cells: [2, 3], sum: 8 }] },
    { type: 'quadruple', topLeft: 10, digits: [1, 2, 3] },
    { type: 'parity', cells: [0, 11, 22], parity: 'odd' },
    { type: 'clone', groups: [[0, 1, 9], [40, 41, 49]] },
    { type: 'anti-knight' }, { type: 'anti-king' }, { type: 'non-consecutive', except: [[0, 1]] },
    { type: 'inequality', less: 0, greater: 1 },
    { type: 'kropki', consecutive: { pairs: [[0, 1]], negative: true }, ratioTwo: { pairs: [[10, 11]] } },
    { type: 'xv', five: { pairs: [[0, 1]], negative: true }, ten: { pairs: [[10, 11]] } },
    { type: 'adjacent-total', cells: [0, 1], sum: 8 },
    { type: 'thermometer', cells: [0, 1, 11, 20] },
    { type: 'between', cells: [0, 10, 20, 30] },
    { type: 'palindrome', cells: [0, 10, 20, 30] },
    { type: 'renban', cells: [0, 10, 20, 30] },
    { type: 'entropic', cells: [0, 10, 20, 30] },
    { type: 'modular', cells: [0, 10, 20, 30] }, { type: 'global-entropy' },
    { type: 'whispers', cells: [0, 10, 20, 30], minDifference: 5 },
    { type: 'arrow', circle: 0, cells: [1, 11, 20] },
    { type: 'region-sum', cells: [0, 1, 2, 3, 4, 5], groupByRegion: true },
    { type: 'sandwich', direction: 'north', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72], sum: 15 },
    { type: 'x-sum', direction: 'west', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], sum: 12 },
    { type: 'little-killer', direction: 'south-east', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80], sum: 45 },
    { type: 'skyscrapers', direction: 'east', cells: [8, 7, 6, 5, 4, 3, 2, 1, 0], count: 3 },
  ]
  for (const rule of rules) {
    const variantPuzzle = { version: 1 as const, givens: dense.givens, rules: [rule] }
    result.push({ id: `variant-${rule.type}`, states: [
      { ...dense, variantPuzzle, annotations, showAnnotatedCandidates: true },
      { ...dense, variantPuzzle, selected: [10, 11], active: 10, highlightedDigit: 2 },
      { ...dense, variantPuzzle: { ...variantPuzzle, rules: [] } },
    ] })
  }
  const jigsaw = { version: 1 as const, givens: dense.givens,
    regions: { type: 'jigsaw' as const, regions: Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)) } }
  result.push({ id: 'jigsaw-and-combined-rules', states: [{ ...dense, variantPuzzle: jigsaw },
    { ...dense, variantPuzzle: { ...jigsaw, rules: [rules[2], rules[5], rules[13], rules[22]] }, selected: [10], active: 10 },
    { ...dense, variantPuzzle: { version: 1, givens: dense.givens, regions: { type: 'boxes' }, rules: [rules[0]] } }] })
  result.push({ id: 'stacked-outside-clues-ignore-region', states: [{ ...dense,
    variantPuzzle: { version: 1, givens: dense.givens, rules: rules.slice(23) }, region: { row: 2, column: 2, rows: 3, columns: 3 } }] })

  for (const grid of [MINI_GRID, sixGridForBoxRows(2), sixGridForBoxRows(3)]) {
    const count = grid.size ** 2
    const position = { center: Array(count).fill((1 << grid.size) - 1), corner: Array(count).fill(0), colors: Array(count).fill(0) }
    const basic: BoardProps = { givens: '0'.repeat(count), values: '0'.repeat(count), position, grid, showGuides: true,
      onCell: noopCell, selected: [0], active: 0 }
    result.push({ id: `sized-${grid.size}-${grid.boxRows}x${grid.boxColumns}`, states: [basic,
      { ...basic, sizedRules: [{ type: 'diagonal', diagonal: 'main' }, { type: 'parity', cells: [0, 2], parity: 'even' },
        { type: 'thermometer', cells: [0, 1, grid.size + 1] }, { type: 'renban', cells: [grid.size, grid.size + 1] },
        { type: 'kropki', consecutive: { pairs: [[2, 3]] } }, { type: 'difference', cells: [0, 1], difference: 2 }] },
      { ...basic, algebraicCages: [
        { type: 'algebraic-cage', cells: [0, 1], total: { type: 'fixed', value: 5 }, label: '5' },
        { type: 'algebraic-cage', cells: [grid.size, grid.size + 1], total: { type: 'variable', name: 'A', offset: 1 }, label: 'A+1' },
      ] },
    ] })
  }
  return result.map(scenario => ({ ...scenario, states: scenario.states.map(props => freezeInputs(props)) }))
}
