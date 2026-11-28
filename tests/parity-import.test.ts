import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { generationVariant, isPlayablePuzzle, variantName, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countParitySolutions } from './helpers/parity-oracle.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/parity-big-eight.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const official = JSON.parse(readFileSync(new URL('./fixtures/parity-coach.json', import.meta.url), 'utf8')) as {
  examples: { coach: string; data: { givenConstraints: { type: string; segments: { cells: number[] }[] }[] } }[]
}

test('the published Big Eight requires its markers for a unique published completion', () => {
  const result = countParitySolutions(fixture.puzzle)
  assert.equal(result.count, 1)
  assert.equal(result.solution, fixture.solution)
  assert.equal(countParitySolutions({ ...fixture.puzzle, rules: [] }).count, 2)
})

test('Coach odd/even segments preserve both marker kinds, cell order and native sharing', async () => {
  const imported = await detectPuzzle(coachCode({ givenDigits: fixture.puzzle.givens,
    givenConstraints: fixture.puzzle.rules!.map(rule => {
      assert.equal(rule.type, 'parity')
      return { type: rule.parity, segments: rule.cells.map(cell => ({ cells: [cell], parameters: {} })), settings: {} }
    }) }))
  assert.deepEqual(imported.variant, { id: 'parity', puzzle: fixture.puzzle })
  assert.equal(variantName(imported.variant), 'Odd/Even')
  assert.equal(generationVariant(imported.variant), 'parity')
  assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(imported.variant)))).variant, imported.variant)
  assert.equal(variantRuleDescriptions(fixture.puzzle).length, 3)
})

test('unmodified official Coach demos without authored regions remain invalid on 3×3 grids', async () => {
  for (const example of official.examples) {
    await assert.rejects(detectPuzzle(example.coach), /needs three connected regions of three cells/)
    // Only the grid size changes; the official rule payload remains intact.
    const { variant } = await detectPuzzle(coachCode({ gridSize: 9, givenConstraints: example.data.givenConstraints }))
    const constraint = example.data.givenConstraints[0]
    assert.deepEqual(variant?.puzzle.rules, [{ type: 'parity', cells: [1, 4, 3], parity: constraint.type }])
  }
})

test('malformed cells, unknown semantics and invalid marker saves cannot silently become Classic', async () => {
  for (const segment of [
    { cells: [] }, { cells: [0, 1] }, { cells: [-1] }, { cells: [81] }, { cells: [1.5] },
    { cells: [0], parameters: { parity: 'even' } },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'odd', segments: [segment], settings: {} }] })), /invalid|unsupported/)
  for (const settings of [{ negativeConstraint: true }, { unknownRule: 1 }]) {
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'even', segments: [{ cells: [0] }], settings }] })), /unsupported/)
  }
  for (const constraint of [
    { type: 'futureRule', segments: [], settings: {} },
    { type: 'futureRule', segments: [{ cells: [0, 1], parameters: {} }], settings: {} },
  ]) {
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })), /unsupported rule type/)
    const sixBySixRegions = Array.from({ length: 36 }, (_, cell) =>
      Math.floor(Math.floor(cell / 6) / 2) * 2 + Math.floor((cell % 6) / 3))
    await assert.rejects(detectPuzzle(coachCode({ gridSize: 6, regions: sixBySixRegions, givenConstraints: [constraint] })),
      /unsupported active rule/)
  }
  for (const rule of [{ type: 'parity', cells: [0], parity: 'any' }, { type: 'parity', cells: [0, 0], parity: 'odd' }]) {
    assert.equal(isPlayablePuzzle('parity', { ...fixture.puzzle, rules: [rule] }), false)
  }
  const { variant } = await detectPuzzle(coachCode({ givenConstraints: [{ type: 'odd', segments: [{ cells: [0] }],
    settings: { colour: '#ffffff', shapeSize: 80, opacity: 100, borderColour: '#000000', borderThickness: 3 } }] }))
  assert.deepEqual(variant?.puzzle.rules, [{ type: 'parity', cells: [0], parity: 'odd' }])
})
