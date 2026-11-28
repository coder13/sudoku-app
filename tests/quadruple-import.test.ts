import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { generationVariant, isPlayablePuzzle, variantName, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countQuadrupleSolutions } from './helpers/quadruple-oracle.ts'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/quadruple-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string; coach: string }
const real = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach.json', import.meta.url), 'utf8')) as { coach: string }

test('Clover’s five-given Quadruple puzzle has an independently counted unique completion', () => {
  const result = countQuadrupleSolutions(fixture.puzzle)
  assert.equal(result.count, 1)
  assert.equal(result.solution, fixture.solution)
  assert.equal(countQuadrupleSolutions({ ...fixture.puzzle, rules: [] }).count, 2)
})

test('a real Coach export preserves repeated digits alongside the original Diagonal and Killer rules', async () => {
  const imported = await detectPuzzle(real.coach)
  assert.equal(imported.variant?.id, 'mixed')
  assert.deepEqual(imported.variant.puzzle.rules?.at(-1), { type: 'quadruple', topLeft: 2, digits: [3, 3] })
  assert.equal(imported.variant.puzzle.rules?.filter(rule => rule.type === 'diagonal').length, 2)
  assert.equal(imported.variant.puzzle.rules?.find(rule => rule.type === 'killer-cages')?.cages.length, 27)
  assert.match(variantName(imported.variant), /Quadruple/)
  assert.equal(generationVariant(imported.variant), undefined)
  assert.ok(variantRuleDescriptions(imported.variant.puzzle).some(text => text.includes('repeated printed digit')))
})

test('pure Quadruple imports retain their name, clues and next-puzzle setting', async () => {
  const source = coachCode({ givenDigits: fixture.puzzle.givens, givenConstraints: [{ type: 'quadruple', settings: {},
    segments: fixture.puzzle.rules!.map(rule => {
      assert.equal(rule.type, 'quadruple')
      return { cells: [rule.topLeft], parameters: { digits: rule.digits.join('') } }
    }) }] })
  const imported = await detectPuzzle(fixture.coach)
  assert.deepEqual((await detectPuzzle(source)).variant, imported.variant)
  assert.equal(imported.variant?.id, 'quadruple')
  assert.deepEqual(imported.variant.puzzle, fixture.puzzle)
  assert.equal(variantName(imported.variant), 'Quadruple')
  assert.equal(generationVariant(imported.variant), 'quadruple')
  const link = '#variant=' + encodeURIComponent(JSON.stringify(imported.variant))
  assert.deepEqual((await detectPuzzle(link)).variant, imported.variant)
})

test('invalid or unsupported Quadruple metadata rejects the entire Coach import', async () => {
  for (const segment of [
    { cells: [8], parameters: { digits: '2' } }, { cells: [72], parameters: { digits: '2' } },
    { cells: [0, 1], parameters: { digits: '2' } }, { cells: [0], parameters: { digits: '' } },
    { cells: [0], parameters: { digits: '12345' } }, { cells: [0], parameters: { digits: '02' } },
    { cells: [0], parameters: { digits: [2, 2] } }, { cells: [0], parameters: { digits: '22', sum: 4 } },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [
    { type: 'diagonalNegative', segments: [], settings: {} }, { type: 'quadruple', segments: [segment], settings: {} },
  ] })), /invalid|unsupported/)
  assert.equal(isPlayablePuzzle('quadruple', { ...fixture.puzzle, rules: [{ type: 'quadruple', topLeft: 1.5, digits: [2] }] }), false)
})

test('reviewed Quad-Arrows, Code Cracker, and Sandwich Roll keep their authored rules with a companion rule', async () => {
  for (const [filename, requiredType] of [
    ['quadruple-coach-sum.json', 'quadruple-sum'],
    ['quadruple-coach-inside-grid.json', 'inside-grid'],
    ['quadruple-coach-lettered.json', 'lettered-quadruples'],
  ] as const) {
    const source = JSON.parse(readFileSync(new URL(`./fixtures/${filename}`, import.meta.url), 'utf8')) as { coach: string }
    const data = await decodeSudokuCoachPayload(source.coach)
    const companion = { type: 'antiKnight', segments: [], settings: {} }
    const imported = await detectPuzzle(coachCode({ ...data, givenConstraints: [
      ...(data.givenConstraints as unknown[]), companion,
    ] }))
    assert.ok(imported.variant?.puzzle.rules?.some(rule => rule.type === requiredType), `${filename} keeps ${requiredType}`)
    assert.ok(imported.variant?.puzzle.rules?.some(rule => rule.type === 'anti-knight'), `${filename} imports the companion`)
  }
})
