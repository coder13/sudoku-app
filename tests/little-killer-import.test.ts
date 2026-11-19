import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { littleKillerState } from '../src/sudoku/little-killer.ts'
import { outsideClueLayout, validOutsideRay } from '../src/sudoku/outside-clues.ts'
import { isPlayablePuzzle, variantRuleDescriptions, variantPeers } from '../src/sudoku/variants.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { coachCode } from './helpers/coach-code.ts'
import { littleKillerCoach } from './helpers/little-killer-export.ts'
const empty = '0'.repeat(81)
const sources = ['murphy', 'newman'].map((name) =>
  JSON.parse(readFileSync(new URL('./fixtures/little-killer-' + name + '.json', import.meta.url), 'utf8')),
) as { puzzle: VariantPuzzle; solution: string }[]
const short = (sum: number): VariantRule => ({
  type: 'little-killer',
  cells: [6, 16, 26],
  direction: 'south-east',
  sum,
})

test('both complete published Little Killer controls retain every printed ray and independent unique completion', async () => {
  for (const source of sources) {
    const native = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'little-killer', puzzle: source.puzzle }))
    for (const code of [native, littleKillerCoach(source.puzzle)])
      assert.deepEqual((await detectPuzzle(code)).variant?.puzzle, source.puzzle)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    assert.equal(conflictsOf(source.solution, source.puzzle).size, 0)
    assert.equal(countLineSolutions({ ...source.puzzle, rules: [] }).count, 2)
    assert.ok(variantRuleDescriptions(source.puzzle).some((text) => text.includes('Digits may repeat')))
  }
})

test('Little Killer accepts complete rays of one through nine cells and rejects wrong direction, sum and hidden parameters', () => {
  const single = { type: 'little-killer', cells: [0], direction: 'south-west', sum: 1 }
  for (const rule of [
    single,
    short(3),
    short(27),
    { type: 'little-killer', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80], direction: 'south-east', sum: 45 },
  ])
    assert.ok(isPlayablePuzzle('little-killer', { version: 1, givens: empty, rules: [rule] }))
  for (const extra of [
    { sum: 2 },
    { sum: 28 },
    { sum: 5.5 },
    { sum: '8' },
    { sum: null },
    { direction: ['south-east'] },
    { direction: null },
    { direction: 1 },
    { direction: 'north-west' },
    { direction: 'south' },
    { cells: [6, 16] },
    { cells: [16, 26] },
    { cells: [6, 16, 27] },
    { cells: null },
    { distinct: true },
    { total: 8 },
  ])
    assert.equal(
      isPlayablePuzzle('little-killer', { version: 1, givens: empty, rules: [{ ...short(8), ...extra }] }),
      false,
      JSON.stringify(extra),
    )
  for (const direction of ['north-east', 'north-west', 'south-east', 'south-west'])
    for (let first = 0; first < 81; first++) {
      const dr = direction.startsWith('north') ? -1 : 1,
        dc = direction.endsWith('east') ? 1 : -1
      let row = Math.floor(first / 9),
        col = first % 9
      if (row - dr >= 0 && row - dr < 9 && col - dc >= 0 && col - dc < 9) continue
      const cells = []
      while (row >= 0 && row < 9 && col >= 0 && col < 9) {
        cells.push(row * 9 + col)
        row += dr
        col += dc
      }
      assert.ok(validOutsideRay(cells, direction, true))
      assert.ok(
        isPlayablePuzzle('little-killer', {
          version: 1,
          givens: empty,
          rules: [{ type: 'little-killer', cells, direction, sum: cells.length * 5 }],
        }),
      )
    }
})

test('Coach diagonal parameters map every direction and corner and never reinterpret cosmetic zero arrows', async () => {
  const data = (parameters: unknown, cells: unknown = [[0, -1]], settings: unknown = {}) =>
    coachCode({ givenConstraints: [{ type: 'littleKiller', segments: [{ cells, parameters }], settings }] })
  const imported = await detectPuzzle(data({ positive: false, value: 8 }))
  assert.deepEqual(imported.variant!.puzzle.rules, [
    { type: 'little-killer', direction: 'south-east', cells: [1, 11, 21, 31, 41, 51, 61, 71], sum: 8 },
  ])
  for (const parameters of [
    { positive: false, value: 0 },
    { positive: 'false', value: 8 },
    { value: 8 },
    { positive: false, value: '8' },
    { positive: false, value: 8, bread: 19 },
  ])
    await assert.rejects(detectPuzzle(data(parameters)), /Little Killer/)
  for (const cells of [
    [[0, 0]],
    [[10, -1]],
    [[0.5, -1]],
    [[0]],
    [],
    [[-1, 0]],
    [
      [0, -1],
      [1, -1],
    ],
  ])
    await assert.rejects(detectPuzzle(data({ positive: true, value: 8 }, cells)), /Little Killer/)
  await assert.rejects(
    detectPuzzle(data({ positive: false, value: 8 }, [[0, -1]], { distinct: true })),
    /unsupported settings/,
  )
  for (const code of ['DLeM', 'GJBz']) {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/little-killer-unsupported-' + code + '.json', import.meta.url), 'utf8'),
    )
    await assert.rejects(
      detectPuzzle(fixture.metadata.sudoku),
      code === 'GJBz' ? /6 × 6.*unsupported active rule/ : /cosmetic Little Killer|not supported|unsupported/,
    )
  }
})

test('placed-digit sum masks match direct assignments for every three-cell partial state and total', () => {
  const tuples: number[][][] = Array.from({ length: 28 }, () => [])
  for (let a = 1; a <= 9; a++)
    for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) tuples[a + b + c].push([a, b, c])
  for (let a = 0; a <= 9; a++)
    for (let b = 0; b <= 9; b++)
      for (let c = 0; c <= 9; c++)
        for (let sum = 3; sum <= 27; sum++) {
          const partial = [a, b, c],
            values = [...empty]
          ;[6, 16, 26].forEach((cell, i) => {
            values[cell] = String(partial[i])
          })
          const possible = tuples[sum].filter((tuple) => partial.every((digit, i) => !digit || digit === tuple[i]))
          const state = littleKillerState({ version: 1, givens: empty, rules: [short(sum)] }, values.join(''))!
          for (const [i, cell] of [6, 16, 26].entries())
            if (!partial[i])
              assert.equal(
                state.allowed[cell],
                possible.reduce((mask, tuple) => mask | (1 << (tuple[i] - 1)), 0),
                partial + ':' + sum,
              )
          assert.deepEqual([...state.conflicts], possible.length ? [] : [6, 16, 26].filter((_, i) => partial[i]))
        }
})

test('diagonal repeats remain legal outside shared houses and both Pencil modes respect sum bounds through undo and redo', () => {
  const long: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [{ type: 'little-killer', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80], direction: 'south-east', sum: 45 }],
  }
  const values = [...empty]
  values[0] = values[80] = '1'
  assert.equal(conflictsOf(values.join(''), long).size, 0)
  assert.equal(variantPeers(long, 0, 80), false)
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [short(8)] }
  const game = {
    ...makeGame('little-killer-input', 'Little Killer', empty, 'imported'),
    variant: { id: 'little-killer' as const, puzzle, solution: sources[0].solution },
  }
  game.position.center = Array(81).fill(511)
  game.position.corner = Array(81).fill(511)
  const full = [...empty]
  full[6] = '2'
  for (const next of [enter(game, [6], 'value', 2), fillEntries(game, full.join(''))]) {
    for (const mode of ['center', 'corner'] as const)
      for (const cell of [16, 26]) assert.equal(next.position[mode][cell], 1 | 4 | 8 | 16)
    assert.deepEqual(undo(next).position, game.position)
    assert.deepEqual(redo(undo(next)).position, next.position)
  }
  values.fill('0')
  values[6] = '9'
  assert.deepEqual([...conflictsOf(values.join(''), puzzle)], [6])
})

test('all eight transforms preserve literal diagonal coordinates, singleton directions, opposite clues and printed completions', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [{ type: 'little-killer', cells: [0], direction: 'south-west', sum: 1 }],
  }
  const expected = [
    ['south-west', 0],
    ['north-east', 0],
    ['north-west', 72],
    ['south-east', 72],
    ['south-east', 8],
    ['north-west', 8],
    ['north-east', 80],
    ['south-west', 80],
  ]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transformed = reflectVariant(puzzle, symmetry),
      rule = transformed.rules![0]
    assert.deepEqual('direction' in rule && [rule.direction, rule.cells[0]], expected[symmetry])
    assert.ok(isPlayablePuzzle('little-killer', transformed))
    for (const source of sources)
      assertVariantCompletion(reflectVariant(source.puzzle, symmetry), transformedBoard(source.solution, symmetry))
  }
  const layout = outsideClueLayout(sources[1].puzzle.rules)
  assert.equal(layout.clues.length, 12)
  for (const side of ['top', 'right', 'bottom', 'left'] as const) assert.ok(layout.depths[side] > 0)
})

test('the complete zero-given Renban ModE control has one independently verified printed completion with all fourteen lines', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/little-killer-menace.json', import.meta.url), 'utf8'))
  assert.equal(source.puzzle.rules.filter((rule: VariantRule) => rule.type === 'renban').length, 14)
  assert.ok(isPlayablePuzzle('mixed', source.puzzle))
  assertVariantCompletion(source.puzzle, source.solution)
  assert.deepEqual((await detectPuzzle(littleKillerCoach(source.puzzle))).variant?.puzzle, source.puzzle)
  const counted = countLineSolutions(source.puzzle)
  assert.equal(counted.count, 1)
  assert.equal(counted.solution, source.solution)
})
