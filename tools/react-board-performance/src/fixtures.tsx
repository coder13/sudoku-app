import type { ComponentProps } from 'react'
import { Board } from '../../../src/components/Board'
import type { SizedConstraintRule, VariantRule } from '../../../src/sudoku/engine'
import { MINI_GRID, SEVEN_BOXLESS_GRID, sevenJigsawForSeed, sixGridForBoxRows } from '../../../src/sudoku/grid'
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
  const ruleFocus: BoardProps = { ...dense, variantPuzzle: { version: 1, givens: dense.givens,
    rules: [rules[0], { type: 'diagonal', diagonal: 'anti' }, rules[2], rules[10], rules[13], rules[23]] } }
  result.push({ id: 'focused-rule-replacement-and-diagonal-geometry', states: [ruleFocus,
    { ...ruleFocus, highlightedRule: 'diagonal' },
    { ...ruleFocus, highlightedRule: 'thermometer' },
    { ...ruleFocus, highlightedRule: 'killer-cages' },
    { ...ruleFocus, highlightedRule: 'kropki' },
    { ...ruleFocus, highlightedRule: 'sandwich' },
    { ...ruleFocus, highlightedRule: 'diagonal', variantPuzzle: { version: 1, givens: dense.givens, rules: [rules[0]] } },
    { ...ruleFocus, highlightedRule: 'diagonal', variantPuzzle: { version: 1, givens: dense.givens, rules: [{ type: 'diagonal', diagonal: 'anti' }] } },
    { ...ruleFocus, highlightedRule: 'diagonal', variantPuzzle: { version: 1, givens: dense.givens, rules: [rules[13]] } },
    { ...ruleFocus, highlightedRule: 'classic' },
    { ...ruleFocus, highlightedRule: 'jigsaw', variantPuzzle: jigsaw },
    { ...ruleFocus, highlightedRule: 'diagonal', onCell: undefined },
    { ...ruleFocus, highlightedRule: null },
  ] })

  for (const grid of [MINI_GRID, sixGridForBoxRows(2), sixGridForBoxRows(3)]) {
    const count = grid.size ** 2
    const position = { center: Array(count).fill((1 << grid.size) - 1), corner: Array(count).fill(0), colors: Array(count).fill(0) }
    const basic: BoardProps = { givens: '0'.repeat(count), values: '0'.repeat(count), position, grid, showGuides: true,
      onCell: noopCell, selected: [0], active: 0 }
    result.push({ id: `sized-${grid.size}-${grid.boxRows}x${grid.boxColumns}`, states: [basic,
      { ...basic, sizedRules: [{ type: 'diagonal', diagonal: 'main' }, { type: 'parity', cells: [0, 2], parity: 'even' },
        { type: 'thermometer', cells: [0, 1, grid.size + 1] }, { type: 'renban', cells: [grid.size, grid.size + 1] },
        { type: 'kropki', consecutive: { pairs: [[2, 3]] } }, { type: 'difference', cells: [0, 1], difference: 2 }] },
      { ...basic, sizedRules: [
        { type: 'arrow', circle: 0, cells: [1, grid.size + 1] },
        { type: 'region-sum', cells: Array.from({ length: grid.size }, (_, cell) => cell) },
      ] },
      { ...basic, sizedRules: [{ type: 'region-sum', groupByRegion: true,
        cells: [0, 1, 2, grid.size + 2, grid.size + 1] }] },
      { ...basic, algebraicCages: [
        { type: 'algebraic-cage', cells: [0, 1], total: { type: 'fixed', value: 5 }, label: '5' },
        { type: 'algebraic-cage', cells: [grid.size, grid.size + 1], total: { type: 'variable', name: 'A', offset: 1 }, label: 'A+1' },
      ] },
      { ...basic, sizedRules: [
        { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [0, 1], value: 2 }, { cells: [grid.size, grid.size + 1], value: 1 }] },
        { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 3 }, { cells: [grid.size + 2, grid.size + 3], value: 2 }] },
      ] },
      { ...basic, sizedRules: [
        { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [0, 1], value: 1 }], negative: true },
        { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 2 }], negative: true },
      ] },
      { ...basic, sizedRules: [{ type: 'killer-cages', cages: [
        { cells: [0, 1, grid.size], sum: 6 }, { cells: [grid.size + 1, grid.size + 2], sum: 7 },
      ] }] },
      { ...basic, sizedRules: [{ type: 'killer-cages', cages: [
        { cells: [0, 1, grid.size], sum: 9 }, { cells: [grid.size + 1, grid.size + 2], sum: 5 },
      ] }] },
      basic,
    ] })
  }

  const firstJigsaw = sevenJigsawForSeed(0), secondJigsaw = sevenJigsawForSeed(1)
  const jigsawCount = firstJigsaw.size ** 2
  const smallJigsaw: BoardProps = {
    givens: '0'.repeat(jigsawCount), values: '0'.repeat(jigsawCount), grid: firstJigsaw,
    position: { center: Array(jigsawCount).fill(127), corner: Array(jigsawCount).fill(0), colors: Array(jigsawCount).fill(0) },
    showGuides: true, onCell: noopCell, selected: [0], active: 0,
  }
  const jigsawClues: readonly SizedConstraintRule[] = [
    { type: 'thermometer', cells: [0, 1, 8] },
    { type: 'region-sum', groupByRegion: true, cells: [0, 1, 2, 9, 16] },
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [2, 3], value: 2 }, { cells: [7, 14], value: 4 }] },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [2, 3], value: 3 }, { cells: [21, 22], value: 2 }] },
  ]
  result.push({ id: 'sized-7-explicit-jigsaw-regions-and-dots', states: [smallJigsaw,
    { ...smallJigsaw, sizedRules: jigsawClues, selected: [8], active: 8 },
    { ...smallJigsaw, sizedRules: jigsawClues, selected: [8], active: 8, grid: secondJigsaw },
    { ...smallJigsaw, sizedRules: jigsawClues, grid: secondJigsaw, selected: [], highlightedDigitMask: 65, highlightedDigitMatch: 'any' },
    { ...smallJigsaw, grid: secondJigsaw, candidates: Array(jigsawCount).fill(65), onCandidate: () => {} },
    { ...smallJigsaw, grid: secondJigsaw, candidatePreview: { cell: 8, digit: 7, mode: 'candidate' },
      region: { row: 1, column: 1, rows: 4, columns: 4 } },
    smallJigsaw,
  ] })
  const boxless: BoardProps = { ...smallJigsaw, grid: SEVEN_BOXLESS_GRID }
  const killerRules: readonly SizedConstraintRule[] = [
    { type: 'killer-cages', cages: [
      { cells: [0, 1, 7], sum: 12 }, { cells: [8, 9], sum: 9 },
    ] },
    { type: 'extra-house', cells: [2, 10, 18, 26, 34, 35, 43] },
  ]
  result.push({ id: 'sized-7-boxless-killer-and-extra-house', states: [smallJigsaw, boxless,
    { ...boxless, sizedRules: killerRules, selected: [1], active: 1 },
    { ...boxless, sizedRules: killerRules, values: '7' + boxless.values.slice(1), selected: [8], active: 8 },
    { ...boxless, sizedRules: [{ type: 'killer-cages', cages: [{ cells: [0, 1, 7], sum: 11 }] }],
      candidatePreview: { cell: 0, digit: 7, mode: 'candidate' } },
    { ...smallJigsaw, sizedRules: killerRules },
    boxless,
  ] })
  return result.map(scenario => ({ ...scenario, states: scenario.states.map(props => freezeInputs(props)) }))
}
