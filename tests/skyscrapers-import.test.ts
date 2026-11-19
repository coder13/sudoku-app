import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { skyscrapersState } from '../src/sudoku/skyscrapers.ts'
import { outsideClueLabel, outsideClueLayout } from '../src/sudoku/outside-clues.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { isPlayablePuzzle, variantIdForPuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'

const empty = '0'.repeat(81),
  row = Array.from({ length: 9 }, (_, i) => i)
const clue = (count: number): VariantRule => ({ type: 'skyscrapers', direction: 'east', cells: row, count })
const sources = ['murphy', 'clover', 'bulten', 'mixed', 'jigsaw-mixed'].map(
  (name) =>
    JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-' + name + '.json', import.meta.url), 'utf8')) as {
      puzzle: VariantPuzzle
      solution: string
    },
)

test('complete published visibility controls and authored companions retain independently unique printed completions', async () => {
  for (const [index, source] of sources.entries()) {
    const share =
      '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle }))
    assert.deepEqual((await detectPuzzle(share)).variant?.puzzle, source.puzzle)
    assertVariantCompletion(source.puzzle, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assert.equal(conflictsOf(source.solution, source.puzzle).size, 0)
    if (index < 3) assert.equal(countLineSolutions({ ...source.puzzle, rules: [] }).count, 2)
    assert.ok(variantRuleDescriptions(source.puzzle).some((text) => /taller buildings hide shorter ones/.test(text)))
  }
})

test('Skyscrapers accepts exact full rays and counts 1–9 while rejecting changed visibility or grid semantics', () => {
  for (const count of [1, 5, 9])
    for (let symmetry = 0; symmetry < 8; symmetry++)
      assert.ok(
        isPlayablePuzzle('skyscrapers', reflectVariant({ version: 1, givens: empty, rules: [clue(count)] }, symmetry)),
      )
  for (const extra of [
    { count: 0 },
    { count: 10 },
    { count: 0.5 },
    { count: '3' },
    { count: null },
    { direction: ['east'] },
    { direction: null },
    { direction: 'south' },
    { direction: 'south-east' },
    { cells: row.slice(1) },
    { cells: [...row].reverse() },
    { cells: [...row.slice(0, 8), 9] },
    { cells: null },
    { sum: 15 },
    { countVisibleZero: true },
  ])
    assert.equal(
      isPlayablePuzzle('skyscrapers', { version: 1, givens: empty, rules: [{ ...clue(3), ...extra }] }),
      false,
      JSON.stringify(extra),
    )
})

test('the original seven-by-seven Coach visibility source remains an intact unsupported control', async () => {
  const source = JSON.parse(
    readFileSync(new URL('./fixtures/skyscrapers-unsupported-9W3o.json', import.meta.url), 'utf8'),
  )
  assert.equal(source.decoded.gridSize, 7)
  assert.equal(source.metadata.solution.length, 49)
  assert.match(source.metadata.description, /Clues outside the grid indicate the number/)
  assert.ok(source.decoded.givenConstraints.some((rule: { type: string }) => rule.type === 'cosmeticText'))
  await assert.rejects(detectPuzzle(source.metadata.sudoku), /grid|supported|9/)
})

test('bounded visibility support matches direct nine-digit permutations for every count and varied partial rows', () => {
  const permutations: string[][] = Array.from({ length: 10 }, () => [])
  function enumerate(prefix: number[], remaining: number[]) {
    if (!remaining.length) {
      let maximum = 0,
        visible = 0
      for (const digit of prefix)
        if (digit > maximum) {
          maximum = digit
          visible++
        }
      permutations[visible].push(prefix.join(''))
      return
    }
    remaining.forEach((digit, i) =>
      enumerate(
        [...prefix, digit],
        remaining.filter((_, j) => j !== i),
      ),
    )
  }
  enumerate([], [1, 2, 3, 4, 5, 6, 7, 8, 9])
  for (let count = 1; count <= 9; count++) {
    const completion = permutations[count][0]
    const partials = [
      '000000000',
      ...row.flatMap((cell) =>
        Array.from({ length: 9 }, (_, i) => row.map((index) => (index === cell ? String(i + 1) : '0')).join('')),
      ),
      ...[1, 2, 3, 7, 23, 85, 170, 257, 341, 438, 510, 511].map((mask) =>
        [...completion].map((digit, i) => (mask & (1 << i) ? digit : '0')).join(''),
      ),
      '110000000',
      '900000001',
      '003020900',
      '390000000',
    ]
    for (const partial of partials) {
      const possible = permutations[count].filter((candidate) =>
        [...partial].every((digit, i) => digit === '0' || digit === candidate[i]),
      )
      const expected = row.map((i) => possible.reduce((mask, candidate) => mask | (1 << (Number(candidate[i]) - 1)), 0))
      const state = skyscrapersState({ version: 1, givens: empty, rules: [clue(count)] }, partial + empty.slice(9))!
      assert.deepEqual(state.allowed.slice(0, 9), expected, count + ':' + partial)
      assert.deepEqual([...state.conflicts], possible.length ? [] : row.filter((i) => partial[i] !== '0'))
    }
  }
})

test('both Pencil modes and bulk entry obey visibility and retain reversible candidate state', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [clue(9)] }
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  assertVariantCompletion(puzzle, solution)
  const game = {
    ...makeGame('skyscrapers-input', 'Skyscrapers', empty, 'imported'),
    variant: { id: 'skyscrapers' as const, puzzle, solution },
  }
  game.position.center = Array<number>(81).fill(511)
  game.position.corner = Array<number>(81).fill(511)
  for (const changed of [enter(game, [0], 'value', 1), fillEntries(game, '1' + empty.slice(1))]) {
    for (const mode of ['center', 'corner'] as const) {
      for (let i = 1; i < 9; i++) assert.equal(changed.position[mode][i], 1 << i)
      assert.ok(changed.position[mode][9] & 256)
    }
    assert.deepEqual(undo(changed).position, game.position)
    assert.deepEqual(redo(undo(changed)).position, changed.position)
  }
  assert.deepEqual([...conflictsOf('310' + empty.slice(3), puzzle)].sort(), [0, 1])
  assert.equal(skyscrapersState({ ...puzzle, rules: [clue(1)] }, empty)!.allowed[0], 256)
})

test('all eight transforms preserve visibility direction, local support, printed completions and mixed clue identity', () => {
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant({ version: 1, givens: empty, rules: [clue(9)] }, symmetry)
    const state = skyscrapersState(puzzle, transformedBoard('1' + empty.slice(1), symmetry))!,
      rule = puzzle.rules![0]
    if (rule.type !== 'skyscrapers') throw Error('Missing visibility clue')
    assert.equal(state.allowed[rule.cells[1]], 2)
    assert.match(outsideClueLabel(rule), /Skyscrapers 9/)
    for (const source of sources)
      assertVariantCompletion(reflectVariant(source.puzzle, symmetry), transformedBoard(source.solution, symmetry))
  }
  const layout = outsideClueLayout(sources[4].puzzle.rules)
  assert.deepEqual(layout.legend, ['S = Sandwich', 'X = X-Sums', 'Sk = Skyscrapers'])
  assert.ok(layout.clues.some((clue) => clue.rule.type === 'skyscrapers' && clue.label.startsWith('Sk')))
})
