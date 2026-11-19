import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import { checkKakuro, createKakuro, findKakuroHint, solveKakuro, type KakuroPuzzle, type KakuroRun } from '../src/kakuro/engine.ts'

function enumerateTuples(run: KakuroRun): number[][] {
  const result: number[][] = []
  function enumerate(partial: number[], total: number) {
    if (partial.length === run.cells.length) {
      if (total === run.total) result.push(partial)
      return
    }
    for (let digit = 1; digit <= 9; digit++) {
      if (total + digit <= run.total && !partial.includes(digit)) enumerate([...partial, digit], total + digit)
    }
  }
  enumerate([], 0)
  return result
}

function countWithTuples(puzzle: KakuroPuzzle): number {
  const tuples = puzzle.runs.map(enumerateTuples)
  const values = puzzle.cells.map(() => 0)
  const playable = puzzle.cells.flatMap((cell, index) => cell === null ? [index] : [])

  function search(): number {
    let bestCell = -1
    let bestDigits: number[] = []
    for (const cell of playable) {
      if (values[cell]) continue
      const choices = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit =>
        puzzle.runs.every((run, i) => {
          const position = run.cells.indexOf(cell)
          return position === -1 || tuples[i].some(tuple => tuple[position] === digit &&
            run.cells.every((index, offset) => !values[index] || values[index] === tuple[offset]))
        }))
      if (!choices.length) return 0
      if (bestCell === -1 || choices.length < bestDigits.length) {
        bestCell = cell
        bestDigits = choices
      }
    }
    if (bestCell === -1) return 1
    let count = 0
    for (const digit of bestDigits) {
      values[bestCell] = digit
      count += search()
      if (count >= 2) break
    }
    values[bestCell] = 0
    return count
  }
  return search()
}

test('every Kakuro recipe has one independently counted solution and a complete logical replay', () => {
  for (const { id, difficulty, puzzle } of kakuroCatalog) {
    assert.equal(countWithTuples(puzzle), 1, id)
    const exact = solveKakuro(puzzle)
    assert.equal(exact.status, 'unique', id)
    assert.equal(exact.nodes, 1, id)
    assert.ok(exact.solution, id)
    const path = puzzle.cells.map(() => 0)
    let depth = 0
    while (!checkKakuro(puzzle, path).complete) {
      const hint = findKakuroHint(puzzle, path)
      assert.ok(hint, id)
      assert.ok(hint.runs.some(run => run.cells.includes(hint.cell)), id)
      assert.equal(path[hint.cell], 0, id)
      assert.equal(hint.digit, exact.solution[hint.cell], id)
      path[hint.cell] = hint.digit
      depth = Math.max(depth, hint.depth)
    }
    assert.equal(depth, { easy: 1, medium: 2, hard: 4 }[difficulty], id)
  }
})

test('each clue step can be replayed from placed digits and earlier steps', () => {
  for (const { id, puzzle } of kakuroCatalog) {
    const tuples = new Map(puzzle.runs.map(run => [run, enumerateTuples(run)]))
    const values = puzzle.cells.map(() => 0)
    while (!checkKakuro(puzzle, values).complete) {
      const hint = findKakuroHint(puzzle, values)
      assert.ok(hint, id)
      const domains = values.map(digit => digit ? 1 << (digit - 1) : 0b111111111)
      for (const { run, changes } of hint.steps) {
        const compatible = tuples.get(run)!.filter(tuple =>
          tuple.every((digit, i) => domains[run.cells[i]] & (1 << (digit - 1))))
        assert.ok(compatible.length, id)
        const expected = run.cells.flatMap((cell, i) => {
          const remainingMask = compatible.reduce((mask, tuple) => mask | (1 << (tuple[i] - 1)), 0)
          const removedMask = domains[cell] & ~remainingMask
          return removedMask ? [{ cell, removedMask, remainingMask }] : []
        })
        assert.deepEqual(changes, expected, id)
        for (const { cell, remainingMask } of changes) domains[cell] = remainingMask
      }
      assert.equal(domains[hint.cell], 1 << (hint.digit - 1), id)
      values[hint.cell] = hint.digit
    }
  }
})

test('a contradiction between individually valid runs suppresses a placement hint', () => {
  const puzzle = createKakuro(3, [{}, { down: 3 }, { down: 3 }, { across: 3 }, null, null, { across: 4 }, null, null])
  assert.equal(checkKakuro(puzzle, []).conflicts.length, 0)
  assert.equal(findKakuroHint(puzzle, []), null)
})

test('rules catch duplicate digits even when a run has the correct sum', () => {
  const puzzle = createKakuro(3, [{}, { down: 4 }, { down: 4 }, { across: 4 }, null, null, { across: 4 }, null, null])
  const values = [0, 0, 0, 0, 2, 2, 0, 2, 2]
  assert.equal(checkKakuro(puzzle, values).conflicts.length, 4)
  assert.equal(findKakuroHint(puzzle, values), null)
  assert.equal(solveKakuro(puzzle, values).status, 'unsolvable')
  assert.equal(solveKakuro(puzzle).status, 'multiple')
  assert.equal(solveKakuro(puzzle, [], 1).status, 'search-limit')
})

test('a clue owns only its contiguous run and every white cell requires both directions', () => {
  assert.throws(() => createKakuro(3, [{}, { down: 6 }, { down: 3 }, { across: 3 }, null, null, {}, null, null]),
    /one across clue and one down clue/)
  assert.throws(() => createKakuro(3, [{}, { down: 1 }, { down: 3 }, { across: 3 }, null, null, { across: 3 }, null, null]),
    /Invalid Kakuro down clue/)
})

test('nine-cell runs permit all digits and handle bounded exact search', () => {
  const columns = [3, 5, 7, 9, 11, 13, 15, 17, 10]
  const row = [{ across: 45 }, ...columns.map(() => null)]
  const puzzle = createKakuro(10, [{}, ...columns.map(down => ({ down })), ...row, ...row])
  const values = [0, ...columns.map(() => 0), 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 2, 3, 4, 5, 6, 7, 8, 9, 1]
  assert.equal(checkKakuro(puzzle, values).complete, true)
  assert.equal(solveKakuro(puzzle, values).status, 'unique')
  assert.equal(solveKakuro(puzzle).status, 'multiple')
})
