import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

test('published XV and mixed Quadruple puzzles need every declared rule family', () => {
  for (const name of ['xv-clover', 'xv-quadruple-clover']) {
    const fixture = JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
    assertVariantCompletion(fixture.puzzle, fixture.solution)
    assert.equal(fixture.puzzle.givens.replaceAll('0', '').length, 4)
    const actual = countLineSolutions(fixture.puzzle)
    assert.equal(actual.count, 1); assert.equal(actual.solution, fixture.solution)
    for (const type of new Set(fixture.puzzle.rules!.map(rule => rule.type))) {
      assert.equal(countLineSolutions({ ...fixture.puzzle, rules: fixture.puzzle.rules!.filter(rule => rule.type !== type) }).count, 2)
    }
  }
})

test('independent negative XV flags apply only to their declared sum', () => {
  const givens = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const edges: [number, number][] = []
  for (let a = 0; a < 81; a++) {
    if (a % 9 < 8) edges.push([a, a + 1])
    if (a < 72) edges.push([a, a + 9])
  }
  const five = edges.filter(([a, b]) => Number(givens[a]) + Number(givens[b]) === 5)
  const ten = edges.filter(([a, b]) => Number(givens[a]) + Number(givens[b]) === 10)
  assert.ok(five.length > 0 && ten.length > 0)
  for (const sum of [5, 10]) {
    const puzzle: VariantPuzzle = { version: 1, givens, rules: [{ type: 'xv',
      five: { pairs: sum === 5 ? five.slice(1) : five }, ten: { pairs: sum === 10 ? ten.slice(1) : ten } }] }
    assert.equal(countLineSolutions(puzzle).count, 1)
    const rule = puzzle.rules![0]
    if (rule.type !== 'xv') throw Error('Expected XV definition')
    const opposite = { ...rule, ...(sum === 5 ? { ten: { pairs: ten, negative: true } } : { five: { pairs: five, negative: true } }) }
    assert.equal(countLineSolutions({ ...puzzle, rules: [opposite] }).count, 1)
    const strict = { ...rule, ...(sum === 5 ? { five: { pairs: five.slice(1), negative: true } } : { ten: { pairs: ten.slice(1), negative: true } }) }
    assert.equal(countLineSolutions({ ...puzzle, rules: [strict] }).count, 0)
    // A positive mark in a separate layer still exempts its edge globally.
    const separate: VariantPuzzle = { ...puzzle, rules: [strict,
      { type: 'xv', ...(sum === 5 ? { five: { pairs: [five[0]] } } : { ten: { pairs: [ten[0]] } }) }] }
    assert.equal(countLineSolutions(separate).count, 1)
    assertVariantCompletion(separate, givens)
  }
})

test('independent Quadruple enumeration respects repeated printed digits', () => {
  const givens = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  for (const [digits, expected] of [[[5, 3], 1], [[5, 3, 6, 7], 1], [[5, 5], 0]] as const) {
    const puzzle: VariantPuzzle = { version: 1, givens, rules: [{ type: 'quadruple', topLeft: 0, digits: [...digits] }] }
    assert.equal(countLineSolutions(puzzle).count, expected)
  }
})
