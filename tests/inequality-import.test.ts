import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isPlayablePuzzle, variantDigitExclusions, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const empty = '0'.repeat(81)
const rule: VariantRule = { type: 'inequality', less: 0, greater: 80 }
const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [rule] }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/inequality-palindrome14.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }

test('the published Coach puzzle preserves every directed sign, line and dot', async () => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/palindrome-coach.json', import.meta.url), 'utf8'))
  const imported = (await detectPuzzle(examples[1].code)).variant!
  assert.equal(imported.id, 'mixed')
  assert.equal(imported.puzzle.givens, empty)
  assert.equal(imported.puzzle.rules!.length, 11)
  for (const [index, expected] of fixture.puzzle.rules!.entries()) {
    const actual = imported.puzzle.rules![index]
    const explicit = expected.type === 'kropki' ? { ...expected, consecutive: { ...expected.consecutive, negative: false } } : expected
    assert.deepEqual(actual.type === 'palindrome' ? { type: actual.type, cells: actual.cells } : actual, explicit)
    if (actual.type === 'palindrome') assert.equal(actual.segments, undefined)
  }
  assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(imported)))).variant, imported)
})

test('inequality validation accepts distant endpoints and rejects malformed or hidden semantics', async () => {
  assert.equal(isPlayablePuzzle('inequality', puzzle), true)
  assert.equal(generationVariant({ id: 'inequality' }), 'inequality')
  assert.ok(variantRuleDescriptions(puzzle).some(text => text.includes('smaller digit')))
  for (const [less, greater] of [[0, 0], [-1, 2], [0, 81], [1.5, 2], [0, '1']]) {
    assert.equal(isPlayablePuzzle('inequality', { ...puzzle, rules: [{ type: 'inequality', less, greater }] }), false)
  }
  for (const constraint of [
    { segments: [] }, { segments: [{ cells: [0], parameters: {} }] },
    { segments: [{ cells: [0, 80], parameters: { difference: 2 } }] },
    { settings: { negativeConstraint: true }, segments: [{ cells: [0, 80], parameters: {} }] },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'greaterLess', ...constraint }] })))
  const imported = (await detectPuzzle(coachCode({ givenConstraints: [{ type: 'greaterLess', segments: [{ cells: [0, 80], parameters: {} }] }] }))).variant!
  assert.deepEqual(imported.puzzle.rules, [rule])
})

test('every digit pair respects strict direction, including equal digits and boundaries', () => {
  for (let smaller = 1; smaller <= 9; smaller++) for (let larger = 1; larger <= 9; larger++) {
    assert.equal(Boolean(variantDigitExclusions(puzzle, 0, 80, smaller) & 1 << (larger - 1)), smaller >= larger)
    assert.equal(Boolean(variantDigitExclusions(puzzle, 80, 0, larger) & 1 << (smaller - 1)), smaller >= larger)
    const values = [...empty]; values[0] = String(smaller); values[80] = String(larger)
    assert.equal(conflictsOf(values.join(''), puzzle).size, smaller >= larger ? 2 : 0)
    assert.equal(variantDigitExclusions(puzzle, 0, 70, smaller), 0)
  }
})

test('placements clean both note types, preserve compatible notes, and replay through undo', () => {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const game = { ...makeGame('inequality', 'Inequality', empty, 'imported'), variant: { id: 'inequality' as const, puzzle, solution } }
  for (const [cell, partner, permitted] of [[0, 80, 511 & ~15], [80, 0, 7]]) {
    let noted = game
    for (let digit = 1; digit <= 9; digit++) {
      noted = enter(noted, [partner], 'center', digit)
      noted = enter(noted, [partner], 'corner', digit)
    }
    const next = enter(noted, [cell], 'value', 4)
    assert.equal(next.position.center[partner], permitted)
    assert.equal(next.position.corner[partner], permitted)
    assert.deepEqual(undo(next).position, noted.position)
    assert.deepEqual(redo(undo(next)).position, next.position)
    const values = [...empty]; values[cell] = '4'
    assert.equal(fillEntries(noted, values.join('')).position.center[partner], permitted)
  }
})

test('all eight grid transformations preserve the directed relation and full companion geometry', () => {
  const maps = [
    (r: number, c: number) => [r, c], (r: number, c: number) => [c, r],
    (r: number, c: number) => [8 - r, c], (r: number, c: number) => [8 - c, r],
    (r: number, c: number) => [r, 8 - c], (r: number, c: number) => [c, 8 - r],
    (r: number, c: number) => [8 - r, 8 - c], (r: number, c: number) => [8 - c, 8 - r],
  ]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transformed = reflectVariant(fixture.puzzle, symmetry)
    const index = (cell: number) => { const [r, c] = maps[symmetry](Math.floor(cell / 9), cell % 9); return r * 9 + c }
    const solution = Array<string>(81)
    for (let cell = 0; cell < 81; cell++) solution[index(cell)] = fixture.solution[cell]
    assert.equal(transformed.rules!.length, fixture.puzzle.rules!.length)
    for (const [i, relation] of transformed.rules!.entries()) if (relation.type === 'inequality') {
      const original = fixture.puzzle.rules![i]
      assert.equal(original.type, 'inequality')
      if (original.type !== 'inequality') continue
      assert.equal(relation.less, index(original.less)); assert.equal(relation.greater, index(original.greater))
      assert.ok(Number(solution[relation.less]) < Number(solution[relation.greater]))
    }
    assert.equal(conflictsOf(solution.join(''), transformed).size, 0)
  }
})
