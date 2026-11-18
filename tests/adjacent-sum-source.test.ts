import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { countLineSolutions, type OracleRelation } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

type ReferenceCase = { basePuzzle: VariantPuzzle; additionalSums: { cells: [number, number]; total: number }[]; solution: string }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/adjacent-sum-coach.json', import.meta.url), 'utf8')) as ReferenceCase & {
  source: { code: string }; requiresSumForUniqueness: boolean; authoredControl: ReferenceCase & { alternative: string }
}
const relations = ({ additionalSums }: ReferenceCase): OracleRelation[] => additionalSums.map(({ cells: [a, b], total }) => [a, b, (left, right) => left + right === total])

test('the original Coach export contains one sum-15 edge, two givens and all three Miracle rules', () => {
  const encoded = fixture.source.code.split('_')[2]
  const bits = [...encoded].map(digit => '0123456789abcdefghijklmnopqrstuv'.indexOf(digit).toString(2).padStart(5, '0')).join('')
  const original = JSON.parse(inflateSync(Uint8Array.from(bits.match(/.{8}/g)!, byte => Number.parseInt(byte, 2))).toString())
  assert.equal(original.givenDigits, fixture.basePuzzle.givens)
  assert.equal(fixture.basePuzzle.givens.replaceAll('0', '').length, 2)
  assert.deepEqual(original.givenConstraints.map((rule: { type: string }) => rule.type), ['antiKnight', 'antiKing', 'nonconsecutive', 'twoCellSum'])
  assert.deepEqual(original.givenConstraints[3].segments, [{ cells: [80, 79], parameters: { sum: 15 } }])
  assert.deepEqual(fixture.additionalSums, [{ cells: [80, 79], total: 15 }])
  assertVariantCompletion(fixture.basePuzzle, fixture.solution)
  assert.equal(Number(fixture.solution[80]) + Number(fixture.solution[79]), 15)
})

test('independent counting preserves the published total and exposes its redundancy rather than replacing it with V or X', () => {
  const full = countLineSolutions(fixture.basePuzzle, 2000, relations(fixture))
  assert.equal(full.count, 1); assert.equal(full.solution, fixture.solution)
  const without = countLineSolutions(fixture.basePuzzle, 2000)
  assert.equal(without.count, 1); assert.equal(without.solution, fixture.solution)
  assert.equal(fixture.requiresSumForUniqueness, false)
  for (const wrong of [5, 10]) assert.equal(countLineSolutions(fixture.basePuzzle, 2000, [[80, 79, (a, b) => a + b === wrong]]).count, 0)
})

test('an authored total-15 control needs its sum to distinguish two valid ordinary completions', () => {
  const example = fixture.authoredControl
  assertVariantCompletion(example.basePuzzle, example.solution)
  assertVariantCompletion(example.basePuzzle, example.alternative)
  const without = countLineSolutions(example.basePuzzle)
  assert.equal(without.count, 2)
  assert.deepEqual(new Set(without.solutions), new Set([example.solution, example.alternative]))
  const full = countLineSolutions(example.basePuzzle, 2000, relations(example))
  assert.equal(full.count, 1); assert.equal(full.solution, example.solution)
  assert.notEqual(Number(example.alternative[30]) + Number(example.alternative[39]), 15)
  assert.throws(() => countLineSolutions(example.basePuzzle, 1), /exhausted its budget/)
})
