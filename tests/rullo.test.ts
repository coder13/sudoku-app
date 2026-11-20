import assert from 'node:assert/strict'
import { test } from 'node:test'
import { numberSolution } from '../src/number-puzzles/solution.ts'
import { rulloCatalog } from '../src/rullo/catalog.ts'
import { checkRullo, createRullo, findRulloHints, KEEP, REMOVE, solveRullo } from '../src/rullo/engine.ts'

test('Rullo distinguishes multiple, unique, contradictory, and limited searches', () => {
  const puzzle = createRullo([1, 1, 1, 1], [1, 1], [1, 1])
  assert.equal(solveRullo(puzzle).status, 'multiple')
  assert.equal(solveRullo(puzzle, [], 1).status, 'search-limit')
  const forced = solveRullo(puzzle, [KEEP], 1)
  assert.equal(forced.status, 'unique')
  assert.deepEqual(forced.solution, [KEEP, REMOVE, REMOVE, KEEP])
  const conflicts = checkRullo(puzzle, [KEEP, KEEP]).conflicts
  assert.deepEqual(conflicts.map(line => [line.axis, line.index]), [['row', 0]])
  assert.equal(solveRullo(puzzle, [KEEP, KEEP]).status, 'unsolvable')
  assert.deepEqual(findRulloHints(puzzle, [KEEP, KEEP]), [])
  assert.throws(() => createRullo([1, 1, 1, 20], [1, 1], [1, 1]))
})

test('Rullo toggle play counts unmarked numbers while replay requires explicit choices', () => {
  const puzzle = createRullo([1, 1, 1, 1], [1, 1], [1, 1])
  const keepUnmarked = { keepUnmarked: true }
  assert.equal(checkRullo(puzzle, [], keepUnmarked).complete, false)
  const removed = [0, REMOVE, REMOVE, 0]
  assert.equal(checkRullo(puzzle, removed, keepUnmarked).complete, true)
  assert.equal(checkRullo(puzzle, removed).complete, false)
  const invalid = checkRullo(puzzle, [REMOVE, REMOVE, 0, 0], keepUnmarked)
  assert.deepEqual(invalid.conflicts.map(({ axis, index }) => [axis, index]), [['row', 0]])
})

test('every Rullo catalog puzzle has one solution and a complete line-sum walkthrough', () => {
  for (const { id, puzzle } of rulloCatalog) {
    const result = solveRullo(puzzle)
    assert.equal(result.status, 'unique', id)
    const hints = findRulloHints(puzzle, [])
    assert.equal(hints.length, puzzle.numbers.length, id)
    for (const hint of hints) {
      const fixed = puzzle.numbers.map(() => 0)
      for (const { line, combinations, decisions } of hint.steps) {
        const matching: number[][] = []
        for (let mask = 0; mask < 2 ** line.cells.length; mask++) {
          const chosen = line.cells.filter((_, i) => mask & 1 << i)
          const total = chosen.reduce((sum, cell) => sum + puzzle.numbers[cell], 0)
          if (total === line.target && line.cells.every(cell =>
            !fixed[cell] || fixed[cell] === (chosen.includes(cell) ? KEEP : REMOVE))) matching.push(chosen)
        }
        assert.equal(combinations, matching.length, id)
        assert.ok(combinations, id)
        for (const { cell, value } of decisions) {
          assert.ok(matching.every(chosen => value === (chosen.includes(cell) ? KEEP : REMOVE)), id)
          fixed[cell] = value
        }
      }
      assert.equal(fixed[hint.cell], hint.value, id)
    }
    const walkthrough = numberSolution({
      check: (values, mode) => checkRullo(puzzle, values, { keepUnmarked: mode !== 'solution' }),
      hints: (values, limit) => findRulloHints(puzzle, values, limit),
      solve: () => assert.fail(`${id} needs search to finish`),
    }, puzzle.numbers.map(() => true))
    assert.equal(walkthrough.complete, true, id)
    assert.deepEqual(walkthrough.positions.at(-1), result.solution, id)
  }
})
