import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hidatoCatalog } from '../src/hidato/catalog.ts'
import { checkHidato, createHidato, findHidatoHint, solveHidato, type HidatoPuzzle } from '../src/hidato/engine.ts'

function independentCount(puzzle: HidatoPuzzle) {
  const { width, givens } = puzzle
  const cells = givens.flatMap((given, i) => given < 0 ? [] : [i])
  const distance = (a: number, b: number) => Math.max(Math.abs(a % width - b % width),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)))
  const used = new Set([givens.indexOf(1)])
  let completions = 0
  function walk(value: number, cell: number) {
    if (value === cells.length) {
      completions++
      return
    }
    const fixed = givens.indexOf(value + 1)
    for (const next of fixed < 0 ? cells : [fixed]) {
      if (used.has(next) || fixed < 0 && givens[next] !== 0 || distance(cell, next) !== 1) continue
      used.add(next)
      walk(value + 1, next)
      used.delete(next)
      if (completions >= 2) return
    }
  }
  walk(1, givens.indexOf(1))
  return completions
}

test('every irregular Hidato catalog board has one independent path and a full logical replay', () => {
  for (const { id, puzzle } of hidatoCatalog) {
    assert.equal(independentCount(puzzle), 1, id)
    const result = solveHidato(puzzle)
    assert.equal(result.status, 'unique', id)
    assert.equal(result.nodes, 1, id)
    assert.ok(result.solution)
    const values = puzzle.givens.map(digit => Math.max(0, digit))
    for (const _ of values.filter((digit, i) => digit === 0 && puzzle.givens[i] !== -1)) {
      const hint = findHidatoHint(puzzle, values)
      assert.ok(hint, id)
      assert.equal(puzzle.givens[hint.cell], 0, id)
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, result.solution[hint.cell], id)
      assert.ok(hint.reasons.length)
      values[hint.cell] = hint.value
    }
    assert.ok(checkHidato(puzzle, values).complete, id)
    assert.deepEqual(values, result.solution.map(digit => Math.max(0, digit)), id)
  }
})

test('diagonal steps are valid, duplicate digits and too-distant steps conflict', () => {
  const square = createHidato(2, [1, 4, 0, 0])
  assert.equal(checkHidato(square, [1, 4, 3, 2]).complete, true)
  assert.equal(solveHidato(square).status, 'multiple')
  assert.equal(solveHidato(square, [], 0).status, 'search-limit')
  assert.equal(checkHidato(square, [1, 4, 2, 2]).marked.length, 2)

  const { puzzle } = hidatoCatalog.find(entry => entry.id === 'hard-1')!
  const values = puzzle.givens.map(digit => Math.max(0, digit))
  values[1] = 2
  assert.ok(checkHidato(puzzle, values).marked.includes(1))
  assert.equal(findHidatoHint(puzzle, values), null)
  assert.equal(solveHidato(puzzle, values).status, 'unsolvable')
})

test('a board must connect and give each endpoint once', () => {
  assert.throws(() => createHidato(3, [1, -1, 0, -1, -1, -1, 0, -1, 4]), /must connect/)
  assert.throws(() => createHidato(2, [1, 0, 0, 0]), /both Hidato endpoints/)
  assert.throws(() => createHidato(2, [1, 1, 4, 0]), /each clue only once/)
})
