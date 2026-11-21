import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { endpointLineState } from '../src/sudoku/between.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { isPlayablePuzzle, variantIdForPuzzle, variantName, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const published = JSON.parse(readFileSync(new URL('./fixtures/between-newman.json', import.meta.url), 'utf8'))
const coach = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]
const empty = '0'.repeat(81)
const bit = (digit: number) => 1 << (digit - 1)
const position = (cells: readonly number[], digits: readonly number[]) => {
  const values = [...empty]
  cells.forEach((cell, i) => { values[cell] = String(digits[i]) })
  return values.join('')
}

test('published pure and mixed Between puzzles retain every source clue and printed completion', async () => {
  assert.equal(published.puzzle.givens.replaceAll('0', '').length, 14)
  assert.equal(published.puzzle.rules.length, 8)
  assert.equal(variantIdForPuzzle(published.puzzle), 'between')
  assert.equal(variantName({ id: 'between', puzzle: published.puzzle }), 'Between Lines')
  assert.ok(isPlayablePuzzle('between', published.puzzle))
  const imported = await detectPuzzle(coach.code)
  assert.equal(imported.variant?.id, 'mixed')
  assert.deepEqual(imported.variant?.puzzle, coach.puzzle)
  assert.equal(coach.puzzle.rules.filter((r: { type: string }) => r.type === 'between').length, 12)
  for (const source of [published, coach]) {
    const { puzzle, solution } = source
    for (let i = 0; i < 9; i++) {
      assert.deepEqual([...solution.slice(i * 9, i * 9 + 9)].sort(), [...'123456789'])
      assert.deepEqual([...solution].filter((_, cell) => cell % 9 === i).sort(), [...'123456789'])
      assert.deepEqual([...solution].filter((_, cell) => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3) === i).sort(), [...'123456789'])
    }
    for (const rule of puzzle.rules) if (rule.type === 'between') {
      const a = Number(solution[rule.cells[0]]), b = Number(solution[rule.cells.at(-1)])
      for (const cell of rule.cells.slice(1, -1)) assert.ok(Number(solution[cell]) > Math.min(a, b) && Number(solution[cell]) < Math.max(a, b))
    }
    assert.equal(conflictsOf(solution, puzzle).size, 0)
    assert.match(variantRuleDescriptions(puzzle).join(' '), /strictly between/)
  }
})

test('independent touching paths preserve endpoint order and reject hidden semantics or invalid cells', async () => {
  const paths = [[0, 10, 20], [20, 30, 40]]
  const input = { givenConstraints: [{ type: 'betweenLine', settings: {}, segments: paths.map(cells => ({ cells, parameters: {} })) }] }
  const imported = await detectPuzzle(coachCode(input))
  assert.deepEqual(imported.variant?.puzzle.rules, paths.map(cells => ({ type: 'between', cells })))
  for (const cells of [[], [0], [0, 10], [0, 10, 0], [0, 10, 81], [0, 10, -1], [0, 10, 1.5]]) {
    assert.equal(isPlayablePuzzle('between', { version: 1, givens: empty, rules: [{ type: 'between', cells }] }), false)
  }
  for (const extra of [{ minimum: 3 }, { segments: [[0, 10, 20]] }]) {
    assert.equal(isPlayablePuzzle('between', { version: 1, givens: empty, rules: [{ type: 'between', cells: paths[0], ...extra }] }), false)
  }
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'betweenLine', settings: { minimumDifference: 3 }, segments: [{ cells: paths[0], parameters: {} }] }] })), /unsupported settings/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'betweenLine', settings: {}, segments: [{ cells: paths[0], parameters: { negative: true } }] }] })), /invalid Between line/)
})

test('placed-digit restrictions match direct full triples for every partial triple in both orientations', () => {
  const cells = [0, 40, 80]
  // A truth table of complete digit assignments, independent of the interval
  // masks and endpoint-pair search used by the player implementation.
  const complete: number[][] = []
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
    if (a < b && b < c || c < b && b < a) complete.push([a, b, c])
  }
  for (const path of [cells, [...cells].reverse()]) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'between', cells: path }] }
    for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) for (let c = 0; c <= 9; c++) {
      const partial = [a, b, c]
      const matches = complete.filter(tuple => partial.every((digit, i) => digit === 0 || digit === tuple[i]))
      const expected = path.map((_, i) => matches.reduce((mask, tuple) => mask | bit(tuple[i]), 0))
      const state = endpointLineState(puzzle, position(path, partial))!
      assert.deepEqual(path.map(cell => state.allowed[cell]), expected, JSON.stringify({ path, partial }))
      assert.deepEqual([...state.conflicts].sort((a, b) => a - b), matches.length ? [] : path.filter((_, i) => partial[i] !== 0).sort((a, b) => a - b))
      assert.equal(state.allowed[13], 511)
    }
  }
})

test('interior digits may repeat across houses while endpoints exclude equal digits', () => {
  const cells = [0, 13, 26, 39, 80]
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'between', cells }] }
  const state = endpointLineState(puzzle, position(cells, [2, 5, 5, 5, 8]))!
  assert.equal(state.conflicts.size, 0)
  assert.equal(variantPeers(puzzle, 13, 26), false)
  assert.equal(variantPeers(puzzle, 0, 26), true)
  assert.equal(variantPeers(puzzle, 80, 0), true)
  assert.ok(endpointLineState(puzzle, position(cells, [2, 2, 5, 5, 8]))!.conflicts.has(13))
  assert.equal(endpointLineState(undefined, empty), undefined)
})

test('both Pencil modes retain compatible candidates and histories restore endpoint edits', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'between', cells: [0, 40, 80] }] }
  const game = { ...makeGame('between-notes', 'Between Lines', empty, 'imported'), variant: { id: 'between' as const, puzzle, solution: published.solution } }
  game.position.center[40] = game.position.corner[40] = 511
  game.position.center[37] = game.position.corner[37] = 511
  const first = enter(game, [0], 'value', 7)
  const second = enter(first, [80], 'value', 2)
  for (const mode of ['center', 'corner'] as const) {
    assert.equal(second.position[mode][40], bit(3) | bit(4) | bit(5) | bit(6))
    assert.equal(second.position[mode][37], 511)
    assert.deepEqual(undo(second).position[mode], first.position[mode])
  }
  assert.deepEqual(redo(undo(second)).position, second.position)
  const wrong = enter(second, [40], 'value', 9)
  for (const cell of [0, 40, 80]) assert.ok(conflictsOf(position([0, 40, 80], [7, 9, 2]), puzzle).has(cell))
  assert.deepEqual(undo(wrong).position, second.position)
})
