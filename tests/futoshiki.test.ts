import assert from 'node:assert/strict'
import { test } from 'node:test'
import { futoshikiCatalog } from '../src/futoshiki/catalog.ts'
import { createFutoshiki, type FutoshikiPuzzle } from '../src/futoshiki/engine.ts'
import { checkLatin, findLatinHint, solveLatin } from '../src/latin/engine.ts'

function independentCount({ size, givens, inequalities }: FutoshikiPuzzle) {
  const values = givens.slice()
  const candidates = Array.from({ length: size }, (_, i) => i + 1)
  const neighbors = values.map((_, cell) => inequalities.filter(({ less, greater }) => less === cell || greater === cell))
  function search(): number {
    let index = -1
    let domain: number[] = []
    for (let i = 0; i < values.length; i++) {
      if (values[i]) continue
      const row = i - i % size
      const column = i % size
      const possible = candidates.filter(digit => !values.slice(row, row + size).includes(digit) &&
        values.every((value, cell) => cell % size !== column || value !== digit) &&
        neighbors[i].every(({ less, greater }) => i === less
          ? digit < (values[greater] || size)
          : (values[less] || 1) < digit))
      if (possible.length === 0) return 0
      if (index === -1 || domain.length > possible.length) {
        index = i
        domain = possible
      }
    }
    if (index === -1) return 1
    let count = 0
    for (const digit of domain) {
      values[index] = digit
      count += search()
      if (count >= 2) break
    }
    values[index] = 0
    return Math.min(count, 2)
  }
  return search()
}

test('every Futoshiki puzzle is uniquely solvable and depends on its inequalities', () => {
  for (const { id, puzzle } of futoshikiCatalog) {
    assert.equal(independentCount(puzzle), 1, id)
    assert.equal(independentCount({ ...puzzle, inequalities: [] }), 2, id)
    const exact = solveLatin(puzzle)
    assert.equal(exact.status, 'unique', id)
    assert.equal(exact.nodes, 1, id)
    assert.ok(exact.solution)
    const values = [...puzzle.givens]
    let steps = values.filter(digit => digit === 0).length
    while (steps--) {
      const hint = findLatinHint(puzzle, values)
      assert.ok(hint, id)
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, exact.solution[hint.cell], id)
      values[hint.cell] = hint.value
    }
    assert.equal(checkLatin(puzzle, values).complete, true, id)
    assert.ok(puzzle.inequalities.every(({ less, greater }) => values[less] < values[greater]), id)
  }
})

test('candidate support keeps the order of horizontal and vertical signs', () => {
  const puzzle = createFutoshiki(4, Array(16).fill(0), [
    { less: 1, greater: 0 },
    { less: 5, greater: 1 },
  ])
  const values = Array(16).fill(0)
  values[1] = 2
  values[0] = 1
  values[5] = 4
  const bad = checkLatin(puzzle, values)
  assert.ok(bad.conflicts.some(rule => rule.label === 'R1C2 is less than R1C1'))
  assert.ok(bad.conflicts.some(rule => rule.label === 'R2C2 is less than R1C2'))
  assert.equal(solveLatin(puzzle, values).status, 'unsolvable')
  assert.equal(solveLatin(puzzle).status, 'multiple')
})

test('the model rejects wrapping, diagonal, or duplicated inequality edges', () => {
  const givens = Array(16).fill(0)
  assert.throws(() => createFutoshiki(4, givens, [{ less: 3, greater: 4 }]), /adjacent cells/)
  assert.throws(() => createFutoshiki(4, givens, [{ less: 3, greater: 6 }]), /adjacent cells/)
  assert.throws(() => createFutoshiki(4, givens, [{ less: 0, greater: 1 }, { less: 1, greater: 0 }]), /one inequality/)
})
