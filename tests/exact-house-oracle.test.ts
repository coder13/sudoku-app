import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'

test('the complete zero-given FzzD fixture needs its directed inequalities', async () => {
  const fixture = JSON.parse(await readFile(new URL('fixtures/inequality-palindrome14.json', import.meta.url), 'utf8'))
  const puzzle = fixture.puzzle as VariantPuzzle
  assert.equal(puzzle.givens, '0'.repeat(81))
  const actual = countLineSolutions(puzzle)
  assert.equal(actual.count, 1)
  assert.equal(actual.solution, fixture.solution)
  assert.equal(countLineSolutions({ ...puzzle, rules: puzzle.rules?.filter(rule => rule.type !== 'inequality') }).count, 2)
})

test('the independent counter preserves the direction of asymmetric pairs', () => {
  const givens = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  assert.equal(countLineSolutions({ version: 1, givens, rules: [{ type: 'inequality', less: 1, greater: 0 }] }).count, 1)
  assert.equal(countLineSolutions({ version: 1, givens, rules: [{ type: 'inequality', less: 0, greater: 1 }] }).count, 0)
})
