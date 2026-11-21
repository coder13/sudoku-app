import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hidatoCatalog } from '../src/hidato/catalog.ts'
import { checkHidato, createHidato, findHidatoHint, findHidatoHints, findHidatoSolutionHints, solveHidato, type HidatoPuzzle } from '../src/hidato/engine.ts'
import { indicesOfMask, pruneReservedCells } from '../src/hidato/reservations.ts'
import { numberSolution } from '../src/number-puzzles/solution.ts'

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
    const placements = findHidatoHints(puzzle, values)
    assert.deepEqual(placements[0], findHidatoHint(puzzle, values), id)
    assert.equal(new Set(placements.map(hint => hint.cell)).size, placements.length, id)
    for (const hint of placements) {
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, result.solution[hint.cell], id)
    }
    let analyses = 0
    const editable = puzzle.givens.map(given => given === 0)
    const walkthrough = numberSolution({
      check: current => checkHidato(puzzle, current),
      hints: () => assert.fail(`${id} needs a separate hint request`),
      solutionHints: current => {
        analyses++
        return findHidatoSolutionHints(puzzle, current)
      },
      solve: () => assert.fail(`${id} needs search to finish`),
    }, editable)
    assert.equal(analyses, 1, id)
    assert.equal(walkthrough.complete, true, id)
    assert.equal(walkthrough.steps.length, editable.filter(Boolean).length, id)
    for (const hint of walkthrough.steps) {
      assert.ok(hint, id)
      assert.deepEqual(hint, findHidatoHint(puzzle, values), id)
      assert.equal(puzzle.givens[hint.cell], 0, id)
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, result.solution[hint.cell], id)
      assert.ok(hint.reasons.length)
      values[hint.cell] = hint.value
    }
    assert.ok(checkHidato(puzzle, values).complete, id)
    assert.deepEqual(values, result.solution.map(digit => Math.max(0, digit)), id)
    assert.deepEqual(walkthrough.positions.at(-1), values.map((value, cell) => editable[cell] ? value : 0), id)
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
  assert.deepEqual(findHidatoSolutionHints(puzzle, values), [])
})

test('the walkthrough stops when local checks pass but the path cannot finish', () => {
  const { puzzle } = hidatoCatalog.find(entry => entry.id === 'easy-1')!
  const values = [0, 2]
  assert.deepEqual(checkHidato(puzzle, values).marked, [])
  assert.equal(solveHidato(puzzle, values, 1).status, 'unsolvable')
  assert.deepEqual(findHidatoSolutionHints(puzzle, values), [])
})

test('a board must connect and give each endpoint once', () => {
  assert.throws(() => createHidato(3, [1, -1, 0, -1, -1, -1, 0, -1, 4]), /must connect/)
  assert.throws(() => createHidato(2, [1, 0, 0, 0]), /both Hidato endpoints/)
  assert.throws(() => createHidato(2, [1, 1, 4, 0]), /each clue only once/)
})

test('a short path segment provides the next logical placement in Hard 4', () => {
  const { puzzle } = hidatoCatalog.find(entry => entry.id === 'hard-4')!
  const values = puzzle.givens.map(() => 0)
  const first = findHidatoHint(puzzle, values)
  assert.equal(first?.cell, 6)
  assert.equal(first.value, 10)
  values[first.cell] = first.value

  const hint = findHidatoHint(puzzle, values)
  assert.equal(hint?.technique, 'Path segment')
  assert.equal(hint.cell, 16)
  assert.equal(hint.value, 4)
  assert.ok(hint.marked.includes(17) && hint.marked.includes(11))
  assert.ok(hint.reasons.some(reason => reason.includes('The path from 2 at R4C3 to 8 at R3C2 needs 6 steps.')))
})

test('Hidato explains a longer path segment in Hard 7', () => {
  const { puzzle } = hidatoCatalog.find(entry => entry.id === 'hard-7')!
  const values = puzzle.givens.map(() => 0)
  const first = findHidatoHint(puzzle, values)
  assert.equal(first?.cell, 10)
  assert.equal(first.value, 17)
  values[first.cell] = first.value

  const hint = findHidatoHint(puzzle, values)
  assert.equal(hint?.technique, 'Path segment')
  assert.equal(hint.cell, 8)
  assert.equal(hint.value, 5)
  assert.ok(hint.marked.includes(14) && hint.marked.includes(16))
  assert.ok(hint.reasons.includes('The path from 4 at R3C5 to 14 at R4C2 needs 10 steps. It cannot visit a cell twice.'))

  const replay = findHidatoSolutionHints(puzzle, values)
  assert.deepEqual(replay[0], hint)
  assert.ok(!replay.some(step => step.cell === first.cell || step.value === first.value))
  assert.equal(values.filter(Boolean).length, 1)
  assert.equal(replay.length, puzzle.givens.filter(given => given === 0).length - 1)
})

test('Hidato explains which placement would cut off the path from either endpoint', () => {
  const { puzzle } = hidatoCatalog.find(entry => entry.id === 'hard-8')!
  const partial = [0, 2, 0, 4, 6, 0, 22, 3, 0, 0, 0, 0, 0, 8]
  const reverse = (values: readonly number[]) => values.map(value => value > 0 ? 24 - value : value)
  const cases = [
    {
      puzzle, values: partial, next: 10, range: '1 through 9', endpoint: 23,
    },
    {
      puzzle: createHidato(5, reverse(puzzle.givens)), values: reverse(partial),
      next: 14, range: '15 through 23', endpoint: 1,
    },
  ]
  for (const { puzzle, values, next, range, endpoint } of cases) {
    const hint = findHidatoHint(puzzle, values)
    assert.equal(hint?.technique, 'Cut-off cells')
    assert.equal(hint.cell, 19)
    assert.equal(hint.value, next)
    assert.ok([2, 14, 18, 19].every(cell => hint.marked.includes(cell)))
    assert.ok(hint.reasons.includes(`The path already uses the cells for ${range}. If ${next} goes in R4C4, the remaining path from ${endpoint} cannot reach R4C5.`))

    const wrong = puzzle.givens.map((given, i) => values[i] || given)
    wrong[18] = next
    assert.equal(independentCount(createHidato(5, wrong)), 0)
    assert.deepEqual(findHidatoSolutionHints(puzzle, values)[0], hint)
    assert.equal(solveHidato(puzzle, values, 1).status, 'unique')
  }
})

test('Hidato rules out a placement that leaves an empty cell with no candidate', () => {
  const { puzzle } = hidatoCatalog.find(entry => entry.id === 'hard-9')!
  const hint = findHidatoHint(puzzle, [])

  assert.equal(hint?.technique, 'Contradiction')
  assert.equal(hint.cell, 4)
  assert.equal(hint.value, 17)
  assert.ok(hint.marked.includes(8) && hint.marked.includes(4))
  assert.ok(hint.reasons.includes('If 17 goes in R2C4, no number can go in R1C5.'))
  assert.deepEqual(hint.trace, [{
    assumption: 'Assume 17 goes in R2C4.',
    steps: [
      'Before the trial, only 15 and 17 can go in R1C5.',
      'R2C4 holds 17, so 14 cannot go there.',
      'No candidate cell for 14 touches R1C5. 15 cannot go there.',
    ],
    conclusion: 'No number can go in R1C5. Remove 17 from R2C4.',
  }])
  assert.deepEqual(findHidatoSolutionHints(puzzle, [])[0], hint)

  const wrong = puzzle.givens.slice()
  wrong[8] = 17
  assert.equal(independentCount(createHidato(puzzle.width, wrong)), 0)
  assert.equal(independentCount(puzzle), 1)
})

test('Hidato keeps valid paths when a long segment reaches the search limit', () => {
  const givens = [
    -1, 1, 7, 0, 0,
    9, 8, 2, 0, 5,
    10, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    20, 0, 22, 23, 24,
  ]
  const puzzle = createHidato(5, givens)
  const disputedCell = 11
  // Both 11 and 12 can go here. Partial path results would wrongly suggest 11.
  for (const value of [11, 12]) {
    const withGiven = givens.slice()
    withGiven[disputedCell] = value
    assert.ok(independentCount(createHidato(5, withGiven)) > 0)
  }
  assert.ok(!findHidatoHints(puzzle, []).some(hint => hint.cell === disputedCell))
  assert.equal(solveHidato(puzzle, [], 1).status, 'search-limit')
  assert.equal(solveHidato(puzzle).status, 'multiple')
  assert.deepEqual(findHidatoSolutionHints(puzzle, []), [findHidatoHint(puzzle, [])])
})

test('reserved cells keep exactly the assignments that fit unique cells', () => {
  // Compare all four-number candidate grids with a direct assignment search.
  for (let code = 0x1111; code <= 0xffff; code++) {
    const domains = [0, 4, 8, 12].map(shift => (code >> shift) & 15)
    if (domains.includes(0)) continue
    const support = [0, 0, 0, 0]
    const picks: number[] = []
    function assign(number: number, used: number) {
      if (number === domains.length) {
        picks.forEach((cell, index) => { support[index] |= cell })
        return
      }
      for (const slot of indicesOfMask(domains[number] & ~used)) {
        const cell = 1 << slot
        picks[number] = cell
        assign(number + 1, used | cell)
      }
    }
    assign(0, 0)

    const pruned = domains.slice()
    const explained = domains.slice()
    const changed = pruneReservedCells(pruned, (number, reserved, cells) => {
      const numbers = indicesOfMask(reserved)
      assert.ok(!numbers.includes(number))
      assert.equal(numbers.reduce((mask, i) => mask | domains[i], 0), cells)
      assert.equal(numbers.length, indicesOfMask(cells).length)
      explained[number] &= ~cells
    })
    if (support[0]) {
      assert.equal(changed, support.some((mask, index) => mask !== domains[index]))
      assert.deepEqual(pruned, support)
      assert.deepEqual(explained, support)
    } else {
      assert.equal(changed, null)
    }
  }
})

test('Hidato explains which numbers reserve cells before it places another number', () => {
  const pair = hidatoCatalog.find(entry => entry.id === 'hard-5')!.puzzle
  const pairHint = findHidatoHint(pair, [])
  assert.equal(pairHint?.technique, 'Reserved cells')
  assert.equal(pairHint.cell, 7)
  assert.equal(pairHint.value, 2)
  assert.ok(pairHint.marked.includes(3) && pairHint.marked.includes(9))
  assert.ok(pairHint.reasons.includes('12 and 14 can only go in R1C4 and R2C5. These cells are reserved for them.'))

  const larger = hidatoCatalog.find(entry => entry.id === 'hard-6')!.puzzle
  const values = larger.givens.map(() => 0)
  values[16] = 22
  values[19] = 18
  values[23] = 20
  const largerHint = findHidatoHint(larger, values)
  assert.equal(largerHint?.technique, 'Reserved cells')
  assert.equal(largerHint.cell, 11)
  assert.equal(largerHint.value, 13)
  assert.ok([2, 3, 6, 8, 9, 13, 14, 17].every(cell => largerHint.marked.includes(cell)))
  assert.equal(largerHint.reasons.filter(reason => reason.includes('reserved for them')).length, 1)
  assert.match(largerHint.reasons.join('\n'), /3, 4, 5, 7, 8, 9, 16, and 17 can only go in R1C3/)
})
