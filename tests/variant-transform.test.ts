import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { readCoachSolutionSources } from './helpers/coach-fixture-sources.ts'

test('Quadruple anchors follow all four corners, preserving repeated printed digits under every symmetry', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'quadruple', topLeft: 21, digits: [2, 2, 6] },
  ] }
  const original = structuredClone(puzzle)
  const expected = [21, 29, 48, 38, 22, 32, 49, 41]
  expected.forEach((topLeft, symmetry) => {
    assert.deepEqual(reflectVariant(puzzle, symmetry).rules, [{ type: 'quadruple', topLeft, digits: [2, 2, 6] }])
  })
  assert.deepEqual(puzzle, original)
})

test('Odd/Even transforms each marked cell while preserving marker kind and rule order', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'parity', parity: 'odd', cells: [1, 13, 72] },
    { type: 'parity', parity: 'even', cells: [0, 80] },
  ] }
  const original = structuredClone(puzzle)
  const expected = [[1, 13, 72], [9, 37, 8], [73, 67, 0], [63, 37, 80],
    [7, 13, 80], [17, 43, 0], [79, 67, 8], [71, 43, 72]]
  const even = [[0, 80], [0, 80], [72, 8], [72, 8], [8, 72], [8, 72], [80, 0], [80, 0]]
  expected.forEach((cells, symmetry) => {
    assert.deepEqual(reflectVariant(puzzle, symmetry).rules, [
      { type: 'parity', parity: 'odd', cells }, { type: 'parity', parity: 'even', cells: even[symmetry] },
    ])
  })
  assert.deepEqual(puzzle, original)
})

test('all eight transformations preserve published Quadruple and Odd/Even completions and sharing', async () => {
  for (const name of ['quadruple-clover', 'parity-big-eight']) {
    const { puzzle, solution } = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as {
      puzzle: VariantPuzzle; solution: string
    }
    const original = structuredClone(puzzle)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const transformed = reflectVariant(puzzle, symmetry)
      assert.equal(transformed.givens, transformedBoard(puzzle.givens, symmetry))
      assertVariantCompletion(transformed, transformedBoard(solution, symmetry))
      const variant = { id: name === 'quadruple-clover' ? 'quadruple' : 'parity', puzzle: transformed }
      assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(variant)))).variant, JSON.parse(JSON.stringify(variant)))
    }
    assert.deepEqual(puzzle, original)
  }
})

test('all eight transformations preserve Coach Magic Square, Unique Cages and Entropic Order rules', async () => {
  const expected = new Set(['magic-square', 'unknown-cage-sums', 'digit-order'])
  const seen = new Set<string>()
  for (const source of readCoachSolutionSources().values()) {
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue
    const relevant = imported.variant.puzzle.rules?.filter(rule => expected.has(rule.type)) ?? []
    for (const rule of relevant) seen.add(rule.type)
    if (!relevant.length) continue
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const transformed = reflectVariant(imported.variant.puzzle, symmetry)
      assertVariantCompletion(transformed, transformedBoard(source.solution, symmetry))
    }
  }
  assert.deepEqual([...seen].sort(), [...expected].sort())
})
