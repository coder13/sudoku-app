import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { xSumState } from '../src/sudoku/x-sum.ts'
import { outsideClueLabel, outsideClueLayout } from '../src/sudoku/outside-clues.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { isPlayablePuzzle, variantIdForPuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'

const empty = '0'.repeat(81),
  row = Array.from({ length: 9 }, (_, i) => i)
const clue = (sum: number): VariantRule => ({ type: 'x-sum', direction: 'east', cells: row, sum })
const sources = ['newman', 'murphy', 'clover', 'coach-transcription', 'mixed', 'jigsaw-mixed'].map(
  (name) =>
    JSON.parse(readFileSync(new URL('./fixtures/x-sum-' + name + '.json', import.meta.url), 'utf8')) as {
      puzzle: VariantPuzzle
      solution: string
    },
)

test('complete published X-Sums and authored companions retain every clue and independently unique printed completion', async () => {
  for (const [index, source] of sources.entries()) {
    const share =
      '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle }))
    assert.deepEqual((await detectPuzzle(share)).variant?.puzzle, source.puzzle)
    assertVariantCompletion(source.puzzle, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assert.equal(conflictsOf(source.solution, source.puzzle).size, 0)
    if (index < 4) assert.equal(countLineSolutions({ ...source.puzzle, rules: [] }).count, 2)
    assert.ok(
      variantRuleDescriptions(source.puzzle).some((text) => /first digit is X and counts toward the sum/.test(text)),
    )
  }
})

test('strict X-Sums acceptance retains all edges and totals 1–45, including mathematically impossible clues', () => {
  for (const sum of [1, 2, 45])
    for (let symmetry = 0; symmetry < 8; symmetry++)
      assert.ok(isPlayablePuzzle('x-sum', reflectVariant({ version: 1, givens: empty, rules: [clue(sum)] }, symmetry)))
  for (const extra of [
    { sum: 0 },
    { sum: 46 },
    { sum: 0.5 },
    { sum: '10' },
    { sum: null },
    { direction: ['east'] },
    { direction: null },
    { direction: 'south' },
    { direction: 'south-east' },
    { cells: row.slice(1) },
    { cells: [...row].reverse() },
    { cells: [...row.slice(0, 8), 9] },
    { cells: null },
    { includeFirst: false },
    { max: true },
  ])
    assert.equal(
      isPlayablePuzzle('x-sum', { version: 1, givens: empty, rules: [{ ...clue(10), ...extra }] }),
      false,
      JSON.stringify(extra),
    )
})

test('original Coach AsnF imports its published cosmetic X-Sums and complete definition', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/x-sum-AsnF.json', import.meta.url), 'utf8'))
  assert.equal(source.metadata.custom_constraints, true)
  assert.match(source.metadata.description, /X is the first digit/)
  const text = source.decoded.givenConstraints.flatMap((constraint: { segments: { parameters: { text: string } }[] }) =>
    constraint.segments.filter((segment) => segment.parameters.text),
  )
  assert.equal(text.length, 16)
  assert.equal(sources[3].puzzle.rules!.length, 16)
  const imported = await detectPuzzle(source.metadata.sudoku)
  assert.equal(imported.title, 'X sums #3')
  assert.equal(imported.variant?.id, 'x-sum')
  assert.deepEqual(imported.variant?.puzzle, sources[3].puzzle)
  assertVariantCompletion(imported.variant!.puzzle, source.metadata.solution)
  const counted = countLineSolutions(imported.variant!.puzzle)
  assert.equal(counted.count, 1)
  assert.equal(counted.solution, source.metadata.solution)
})

test('local X-Sum support agrees with direct nine-digit permutations for every total and varied partial rows', () => {
  const permutations: string[][] = Array.from({ length: 46 }, () => [])
  function enumerate(prefix: number[], remaining: number[]) {
    if (!remaining.length) {
      const sum = prefix.slice(0, prefix[0]).reduce((a, b) => a + b, 0)
      permutations[sum].push(prefix.join(''))
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
  for (let sum = 1; sum <= 45; sum++) {
    const completion = permutations[sum][0] ?? '123456789'
    const partials = [
      '000000000',
      ...[1, 2, 3, 7, 23, 85, 170, 257, 341, 438, 510, 511].map((mask) =>
        [...completion].map((digit, i) => (mask & (1 << i) ? digit : '0')).join(''),
      ),
      '110000000',
      '900000001',
      '003020900',
      '390000000',
    ]
    for (const partial of partials) {
      const possible = permutations[sum].filter((candidate) =>
        [...partial].every((digit, i) => digit === '0' || digit === candidate[i]),
      )
      const expected = row.map((i) => possible.reduce((mask, candidate) => mask | (1 << (Number(candidate[i]) - 1)), 0))
      const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [clue(sum)] }
      const state = xSumState(puzzle, partial + empty.slice(9))!
      assert.deepEqual(state.allowed.slice(0, 9), expected, sum + ':' + partial)
      assert.deepEqual([...state.conflicts], possible.length ? [] : row.filter((i) => partial[i] !== '0'))
    }
  }
})

test('both Pencil modes and bulk entry obey the first digit length and restore state through undo/redo', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [clue(6)] }
  const game = {
    ...makeGame('x-sum-input', 'X-Sums', empty, 'imported'),
    variant: { id: 'x-sum' as const, puzzle, solution: sources[0].solution },
  }
  game.position.center = Array<number>(81).fill(511)
  game.position.corner = Array<number>(81).fill(511)
  for (const changed of [enter(game, [0], 'value', 3), fillEntries(game, '3' + empty.slice(1))]) {
    for (const mode of ['center', 'corner'] as const) {
      assert.equal(changed.position[mode][1], 3)
      assert.equal(changed.position[mode][2], 3)
      assert.equal(changed.position[mode][3], 504)
      assert.ok(changed.position[mode][9] & 256)
    }
    assert.deepEqual(undo(changed).position, game.position)
    assert.deepEqual(redo(undo(changed)).position, changed.position)
  }
  assert.deepEqual([...conflictsOf('390' + empty.slice(3), puzzle)].sort(), [0, 1])
  assert.equal(xSumState({ ...puzzle, rules: [clue(45)] }, empty)!.allowed[0], 256)
  assert.equal(xSumState({ ...puzzle, rules: [clue(1)] }, empty)!.allowed[0], 1)
})

test('outside directions, placed support and every published completion survive all eight coordinate transforms', () => {
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transformed = reflectVariant({ version: 1, givens: empty, rules: [clue(6)] }, symmetry)
    const values = transformedBoard('3' + empty.slice(1), symmetry),
      state = xSumState(transformed, values)!
    const rule = transformed.rules![0]
    if (rule.type !== 'x-sum') throw new Error('Missing X-Sum')
    assert.equal(state.allowed[rule.cells[1]], 3)
    assert.match(outsideClueLabel(rule), /X-Sum 6/)
    for (const source of sources)
      assertVariantCompletion(reflectVariant(source.puzzle, symmetry), transformedBoard(source.solution, symmetry))
  }
  const mixed = outsideClueLayout(sources[4].puzzle.rules)
  assert.deepEqual(mixed.legend, ['S = Sandwich', 'X = X-Sums'])
  assert.ok(mixed.clues.some((clue) => clue.label === 'S0'))
  assert.ok(mixed.clues.some((clue) => clue.label === 'X18'))
})
