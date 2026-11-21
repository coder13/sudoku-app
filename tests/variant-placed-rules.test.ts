import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { regionIndex } from '../src/sudoku/region-sum.ts'
import { jigsawLayout } from '../src/sudoku/variant-generation.ts'
import { variantPlacedRuleState } from '../src/sudoku/variant-placed-rules.ts'
import { whispersState } from '../src/sudoku/whispers.ts'

const empty = '0'.repeat(81)
const position = (cells: readonly number[], digits: readonly number[]) => {
  const values = [...empty]
  cells.forEach((cell, i) => { values[cell] = String(digits[i]) })
  return values.join('')
}

test('replacing a rule list replaces its pair exclusions in both Pencil modes and conflicts', () => {
  const negative: VariantRule = { type: 'xv', five: { negative: true }, ten: { negative: true } }
  const five: VariantPuzzle = { version: 1, givens: empty, rules: [negative, { type: 'adjacent-total', cells: [0, 1], sum: 5 }] }
  const six: VariantPuzzle = { ...five, rules: [negative, { type: 'adjacent-total', cells: [0, 1], sum: 6 }] }
  const game = makeGame('rule-list', 'Pair totals', empty, 'imported')
  game.position.center[1] = game.position.corner[1] = (1 << 2) | (1 << 3)
  for (const [puzzle, digit] of [[five, 3], [six, 4], [five, 3]] as const) {
    const attempt = { ...game, variant: { id: 'mixed' as const, puzzle } }
    const placed = enter(attempt, [0], 'value', 2)
    assert.equal(placed.position.center[1], 1 << (digit - 1))
    assert.equal(placed.position.corner[1], 1 << (digit - 1))
    assert.deepEqual(undo(placed).position, attempt.position)
    assert.equal(conflictsOf(position([0, 1], [2, digit]), puzzle).size, 0)
    assert.deepEqual([...conflictsOf(position([0, 1], [2, digit === 3 ? 4 : 3]), puzzle)], [0, 1])
  }
})

test('mixed 9×9 play shows parity, Thermometer, Arrow, Killer and Quadruple conflicts', () => {
  const rules: VariantRule[] = [
    { type: 'parity', cells: [0], parity: 'odd' },
    { type: 'thermometer', cells: [18, 19, 20] },
    { type: 'arrow', circle: 27, cells: [28, 29] },
    { type: 'killer-cages', cages: [{ cells: [36, 37], sum: 11 }] },
    { type: 'quadruple', topLeft: 50, digits: [2, 2] },
  ]
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules }
  const cases = [
    { cells: [0], bad: [2], good: [3] },
    { cells: [18], bad: [8], good: [7] },
    { cells: [18, 20], bad: [5, 6], good: [5, 7] },
    { cells: [27, 28], bad: [3, 4], good: [3, 2] },
    { cells: [36, 37], bad: [5, 7], good: [5, 6] },
    { cells: [50, 60], bad: [2, 9], good: [2, 2] },
  ]
  for (const { cells, bad, good } of cases) {
    assert.deepEqual(conflictsOf(position(cells, bad), puzzle), new Set(cells))
    assert.deepEqual(conflictsOf(position(cells, good), puzzle), new Set())
  }
})

test('both Pencil modes keep placed-rule candidates consistent across manual entry, bulk entry and history', () => {
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'parity', cells: [4], parity: 'odd' },
    { type: 'thermometer', cells: [18, 19, 20] },
    { type: 'arrow', circle: 32, cells: [31, 33] },
    { type: 'killer-cages', cages: [{ cells: [36, 37], sum: 11 }] },
    { type: 'quadruple', topLeft: 50, digits: [2, 2] },
  ] }
  let game = { ...makeGame('mixed-feedback', 'Mixed Sudoku', empty, 'generated'), variant: { id: 'mixed' as const, puzzle, solution } }
  const sites = [4, 18, 20, 33, 37, 60]
  const placed = [19, 32, 36, 50]
  const digits = [4, 6, 5, 2]
  const expected = [0b101010101, 0b111, 0b111110000, 0b11111, 1 << 5, 1 << 1]
  for (const mode of ['center', 'corner'] as const) {
    for (let digit = 1; digit <= 9; digit++) game = enter(game, sites, mode, digit) as typeof game
  }
  const edited = placed.reduce((current, cell, i) => enter(current, [cell], 'value', digits[i]), game)
  const filled = fillEntries(game, position(placed, digits))
  for (const mode of ['center', 'corner'] as const) for (const result of [edited, filled]) {
    assert.deepEqual(sites.map(cell => result.position[mode][cell]), expected)
  }
  assert.equal(valuesOf(edited), valuesOf(filled))
  assert.deepEqual(undo(filled).position, game.position)
  assert.deepEqual(redo(undo(filled)).position, filled.position)
  const disabled = fillEntries(game, position(placed, digits), false)
  for (const mode of ['center', 'corner'] as const) assert.ok(sites.every(cell => disabled.position[mode][cell] === 511))
})

test('Thermometer bounds match independent exact assignments in both path directions', () => {
  for (const cells of [[0, 1, 2, 3], [3, 2, 1, 0]]) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'thermometer', cells }] }
    const assignments: number[][] = []
    for (let a = 1; a <= 9; a++) for (let b = a + 1; b <= 9; b++) {
      for (let c = b + 1; c <= 9; c++) for (let d = c + 1; d <= 9; d++) assignments.push([a, b, c, d])
    }
    for (let first = 0; first <= 9; first++) for (let last = 0; last <= 9; last++) {
      const placed = [first, 0, 0, last]
      const state = variantPlacedRuleState(puzzle, position(cells, placed))!
      const valid = assignments.filter(([a, , , d]) => (!first || a === first) && (!last || d === last))
      assert.deepEqual(state.conflicts, new Set(valid.length ? [] : cells.filter((_, i) => placed[i])))
      if (!valid.length) continue
      for (const [i, cell] of cells.entries()) if (!placed[i]) {
        assert.equal(state.allowed[cell], valid.reduce((mask, tuple) => mask | 1 << (tuple[i] - 1), 0))
      }
    }
  }
})

test('Quadruple counts repeated digits in separate cells and uses the actual Jigsaw regions', () => {
  const jigsaw = jigsawLayout('000111222000112222000111122334444445333444555333355555666777888666777788666778888')
  const corner = 29
  assert.notEqual(regionIndex(corner), regionIndex(corner + 10))
  assert.equal(regionIndex(corner, jigsaw), regionIndex(corner + 10, jigsaw))
  const cells = [corner, corner + 1, corner + 9, corner + 10]
  const rule = { type: 'quadruple', topLeft: corner, digits: [2, 2] } as const
  const values = position(cells, [2, 0, 0, 0])
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [rule] }
  const boxes = variantPlacedRuleState(puzzle, values)!
  assert.deepEqual(boxes.conflicts, new Set())
  assert.equal(boxes.allowed[cells[3]], 1 << 1)
  const irregular = variantPlacedRuleState({ ...puzzle, regions: jigsaw }, values)!
  assert.deepEqual(irregular.conflicts, new Set([corner]))
})

test('Quadruple candidates match independent four-digit enumeration on legal and impossible partial circles', () => {
  const topLeft = 29
  const cells = [29, 30, 38, 39]
  const jigsaw = jigsawLayout('000111222000112222000111122334444445333444555333355555666777888666777788666778888')
  for (const regions of [undefined, jigsaw]) for (const digits of [[2], [2, 2], [2, 4, 7], [2, 3, 4, 9]]) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, regions, rules: [{ type: 'quadruple', topLeft, digits }] }
    const assignments: number[][] = []
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) for (let d = 1; d <= 9; d++) {
      if (a === b || a === c || b === d || c === d) continue
      if (a === d && regionIndex(cells[0], regions) === regionIndex(cells[3], regions)) continue
      if (b === c && regionIndex(cells[1], regions) === regionIndex(cells[2], regions)) continue
      const tuple = [a, b, c, d]
      if (digits.every(digit => tuple.filter(value => value === digit).length >= digits.filter(value => value === digit).length)) {
        assignments.push(tuple)
      }
    }
    const expected = new Map<string, number[]>()
    for (const tuple of assignments) for (let present = 0; present < 16; present++) {
      const key = tuple.map((digit, i) => present & 1 << i ? digit : 0).join('')
      const masks = expected.get(key) ?? [0, 0, 0, 0]
      for (let i = 0; i < 4; i++) masks[i] |= 1 << (tuple[i] - 1)
      expected.set(key, masks)
    }
    for (let partial = 0; partial < 10_000; partial++) {
      const key = String(partial).padStart(4, '0')
      const placed = Array.from(key, Number)
      const state = variantPlacedRuleState(puzzle, position(cells, placed))!
      const masks = expected.get(key)
      assert.deepEqual(state.conflicts, new Set(masks ? [] : cells.filter((_, i) => placed[i])))
      if (masks) for (let i = 0; i < 4; i++) if (!placed[i]) assert.equal(state.allowed[cells[i]], masks[i])
    }
  }
})

test('Whispers support matches direct assignments on paths and a single loop and stays sound on linked loops', () => {
  const cells = [0, 10, 20, 30]
  const line = (cells: number[], minDifference: number) => ({ type: 'whispers' as const, cells, minDifference })
  const exactCases = [
    ...Array.from({ length: 8 }, (_, i) => [line(cells, i + 1)]),
    [line([0, 10, 0, 20], 4), line([10, 0], 5), line([20, 30], 2)],
    [line([0, 10, 20, 0], 4), line([20, 30], 5)],
  ]
  const linkedLoops = [line([0, 10, 20, 0, 30, 20], 4)]
  for (const rules of [...exactCases, linkedLoops]) {
    const exact = rules !== linkedLoops
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules }
    const expected = new Map<string, number[]>()
    const edges = rules.flatMap(rule => rule.cells.slice(1).map((cell, i) =>
      [cells.indexOf(rule.cells[i]), cells.indexOf(cell), rule.minDifference]))
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) for (let d = 1; d <= 9; d++) {
      const digits = [a, b, c, d]
      if (edges.some(([first, second, minimum]) => Math.abs(digits[first] - digits[second]) < minimum)) continue
      for (let present = 0; present < 16; present++) {
        const key = digits.map((digit, i) => present & 1 << i ? digit : 0).join('')
        const mask = expected.get(key) ?? [0, 0, 0, 0]
        for (let i = 0; i < 4; i++) mask[i] |= 1 << (digits[i] - 1)
        expected.set(key, mask)
      }
    }
    for (let partial = 0; partial < 10_000; partial++) {
      const key = String(partial).padStart(4, '0')
      const placed = Array.from(key, Number)
      const state = whispersState(puzzle, position(cells, placed))!
      const supported = expected.get(key)
      if (exact) assert.equal(state.conflicts.size > 0, !supported && placed.some(Boolean), key)
      if (!supported) continue
      assert.equal(state.conflicts.size, 0, key)
      for (let i = 0; i < 4; i++) {
        if (!placed[i]) assert.equal(exact ? state.allowed[cells[i]] : state.allowed[cells[i]] & supported[i], supported[i], key)
      }
    }
  }
})

test('German Whispers flags distant placements and clears full-path candidates with mixed rules', () => {
  const cells = [0, 10, 20, 30]
  const solution = '125496783496783125783125496254967831967831254831254967549678312678312549312549678'
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'whispers', cells: cells.slice(0, 3), minDifference: 5 },
    { type: 'whispers', cells: cells.slice(2), minDifference: 4 },
    { type: 'parity', parity: 'odd', cells: [30] },
  ] }
  assert.equal(conflictsOf(solution, puzzle).size, 0)
  assert.deepEqual(conflictsOf(position(cells, [1, 0, 9, 0]), puzzle), new Set([0, 20]))
  assert.deepEqual(conflictsOf(position(cells, [1, 0, 3, 0]), puzzle), new Set())

  let game = { ...makeGame('whispers-feedback', 'Whispers with odd digits', empty, 'imported'),
    variant: { id: 'mixed' as const, puzzle, solution } }
  const targets = cells.slice(1)
  for (const mode of ['center', 'corner'] as const) {
    for (let digit = 1; digit <= 9; digit++) game = enter(game, targets, mode, digit) as typeof game
  }
  const entered = enter(game, [0], 'value', 1)
  const filled = fillEntries(game, position([0], [1]))
  for (const result of [entered, filled]) for (const mode of ['center', 'corner'] as const) {
    assert.deepEqual(targets.map(cell => result.position[mode][cell]), [0b111100000, 0b000001110, 0b101010000])
    assert.deepEqual(undo(result).position, game.position)
    assert.deepEqual(redo(undo(result)).position, result.position)
  }
  assert.deepEqual(enter(game, [0], 'value', 1, { removeCandidates: false }).position.center, game.position.center)
  assert.deepEqual(fillEntries(game, position([0], [1]), false).position.corner, game.position.corner)
})

test('Quad-Arrows use the sum in conflict checks and both Pencil modes', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'quadruple-sum', topLeft: 0, digits: [1] }] }
  const cells = [0, 1, 9, 10]
  const values = position(cells, [1, 2, 3, 0])
  assert.equal(variantPlacedRuleState(puzzle, values)?.allowed[10], 1 << 5)
  assert.equal(conflictsOf(position(cells, [1, 2, 3, 6]), puzzle).size, 0)
  assert.deepEqual(conflictsOf(position(cells, [1, 2, 3, 7]), puzzle), new Set(cells))

  const game = { ...makeGame('quad-arrows', 'Quad-Arrows', empty, 'imported'), variant: { id: 'mixed' as const, puzzle } }
  game.position.center[10] = game.position.corner[10] = 511
  const played = fillEntries(game, values)
  assert.equal(played.position.center[10], 1 << 5)
  assert.equal(played.position.corner[10], 1 << 5)
  assert.deepEqual(undo(played).position, game.position)
})
