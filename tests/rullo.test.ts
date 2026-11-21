import assert from 'node:assert/strict'
import { test } from 'node:test'
import { numberSolution } from '../src/number-puzzles/solution.ts'
import { rulloCatalog } from '../src/rullo/catalog.ts'
import { crossingTripleSupport } from '../src/rullo/crossing-triples.ts'
import { checkRullo, createRullo, createRulloHintFinder, findRulloHints, findRulloSolutionHints, KEEP, REMOVE, solveRullo, type RulloHint, type RulloPuzzle } from '../src/rullo/engine.ts'

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
  assert.deepEqual(findRulloSolutionHints(puzzle, [KEEP, KEEP]), [])
  assert.deepEqual(findRulloSolutionHints(puzzle, []), [])
  const remaining = findRulloSolutionHints(puzzle, [KEEP])
  assert.deepEqual(remaining.map(({ cell, value }) => [cell, value]), [[1, REMOVE], [2, REMOVE], [3, KEEP]])
  assert.throws(() => createRullo([1, 1, 1, 20], [1, 1], [1, 1]))
})

test('Rullo line masks match direct sums on every supported board size', () => {
  function target(numbers: number[], index: number) {
    if (index === 0) return 0
    if (index === 2) return 1
    return numbers.reduce((sum, number, offset) => sum + (index === 1 || offset % 2 ? number : 0), 0)
  }

  for (let width = 2; width <= 8; width++) {
    for (let height = 2; height <= 8; height++) {
      const numbers = Array.from({ length: width * height }, (_, cell) =>
        cell % width === 1 ? 19 : 2 + (cell * 7) % 17)
      const rows = Array.from({ length: height }, (_, row) =>
        target(numbers.slice(row * width, (row + 1) * width), row))
      const columns = Array.from({ length: width }, (_, col) =>
        target(numbers.filter((_, cell) => cell % width === col), col))
      const puzzle = createRullo(numbers, rows, columns)
      for (const line of puzzle.lines) {
        const expected: number[] = []
        for (let mask = 0; mask < 1 << line.cells.length; mask++) {
          const sum = line.cells.reduce((total, cell, offset) =>
            total + ((mask & (1 << offset)) ? numbers[cell] : 0), 0)
          if (sum === line.target) expected.push(mask)
        }
        assert.deepEqual(line.masks, expected, `${width}×${height} ${line.axis} ${line.index + 1}`)
      }
    }
  }
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

test('Rullo search propagates both row and column changes on a rectangular puzzle', () => {
  const puzzle = createRullo([2, 3, 4, 2, 2, 2, 1, 2, 2, 2, 3, 5], [9, 3, 7], [4, 3, 5, 7])
  assert.equal(solveRullo(puzzle, [], 2).status, 'search-limit')
  assert.equal(solveRullo(puzzle, [], 3).status, 'multiple')
  const kept = solveRullo(puzzle, [KEEP])
  assert.equal(kept.status, 'unique')
  assert.deepEqual(kept.solution, [KEEP, KEEP, KEEP, REMOVE, REMOVE, REMOVE, KEEP, KEEP, KEEP, REMOVE, REMOVE, KEEP])
  const removed = solveRullo(puzzle, [REMOVE])
  assert.equal(removed.status, 'unique')
  assert.deepEqual(removed.solution, [REMOVE, KEEP, KEEP, KEEP, KEEP, REMOVE, KEEP, REMOVE, KEEP, REMOVE, REMOVE, KEEP])
})

function assertProof(puzzle: RulloPuzzle, hint: RulloHint, fixed: number[], id: string) {
  function possible(line: RulloPuzzle['lines'][number], choices = fixed) {
    const matching: number[][] = []
    for (let mask = 0; mask < 2 ** line.cells.length; mask++) {
      const chosen = line.cells.filter((_, i) => mask & 1 << i)
      const total = chosen.reduce((sum, cell) => sum + puzzle.numbers[cell], 0)
      if (total === line.target && line.cells.every(cell =>
        !choices[cell] || choices[cell] === (chosen.includes(cell) ? KEEP : REMOVE))) matching.push(chosen)
    }
    return matching
  }
  function assertForced(
    step: Extract<RulloHint['steps'][number], { combinations: number }>,
    matching: number[][],
    choices: number[],
  ) {
    assert.equal(step.combinations, matching.length, id)
    assert.ok(step.combinations, id)
    for (const { cell, value } of step.decisions) {
      assert.ok(matching.every(chosen => value === (chosen.includes(cell) ? KEEP : REMOVE)), id)
      choices[cell] = value
    }
  }
  for (const step of hint.steps) {
    if ('assumption' in step) {
      const { cell, value } = step.assumption
      assert.ok(!fixed[cell], id)
      const trial = fixed.slice()
      trial[cell] = value
      for (const deduction of step.deductions) {
        assertForced(deduction, possible(deduction.line, trial), trial)
      }
      assert.deepEqual(possible(step.rejectedBy, trial), [], id)
      const opposite = value === KEEP ? REMOVE : KEEP
      assert.deepEqual(step.decisions, [{ cell, value: opposite }], id)
      fixed[cell] = opposite
      continue
    }
    let matching: number[][]
    if ('line' in step) {
      matching = possible(step.line)
    } else {
      const crossing = puzzle.lines.filter(line => line.axis !== step.lines[0].axis)
        .map(line => ({ line, matches: possible(line) }))
      let combinations: number[][] = [[]]
      for (const line of step.lines) {
        const options = possible(line)
        combinations = combinations.flatMap(kept => options.map(option => [...kept, ...option]))
      }
      matching = combinations.filter(kept => crossing.every(({ line, matches }) => matches.some(match =>
        step.lines.every(parallel => {
          const cell = line.cells[parallel.index]
          return match.includes(cell) === kept.includes(cell)
        }))))
    }
    assertForced(step, matching, fixed)
  }
}

test('every Rullo catalog puzzle has one solution and a complete logical walkthrough', () => {
  for (const { id, puzzle } of rulloCatalog) {
    const result = solveRullo(puzzle)
    assert.equal(result.status, 'unique', id)
    const hints = findRulloHints(puzzle, [])
    assert.equal(hints.length, puzzle.numbers.length, id)
    for (const hint of hints) {
      const fixed = puzzle.numbers.map(() => 0)
      assertProof(puzzle, hint, fixed, id)
      assert.equal(fixed[hint.cell], hint.value, id)
    }
    const findHints = createRulloHintFinder(puzzle)
    const walkthrough = numberSolution({
      check: (values, mode) => checkRullo(puzzle, values, { keepUnmarked: mode !== 'solution' }),
      hints: (values, limit) => {
        const hints = findHints(values, limit)
        assert.deepEqual(hints, findRulloHints(puzzle, values, limit), id)
        return hints
      },
      solve: () => assert.fail(`${id} needs search to finish`),
    }, puzzle.numbers.map(() => true))
    assert.equal(walkthrough.complete, true, id)
    assert.deepEqual(walkthrough.positions.at(-1), result.solution, id)
  }
})

test('in Hard 7, removing R1C3 prevents column 8 from reaching its target', () => {
  const { puzzle } = rulloCatalog.find(({ id }) => id === 'hard-7')!
  const replay = findRulloSolutionHints(puzzle, [])
  const index = replay.findIndex(({ technique }) => technique === 'Contradiction')
  assert.equal(index, 16)
  const fixed = puzzle.numbers.map(() => 0)
  for (const { cell, value } of replay.slice(0, index)) fixed[cell] = value
  const [hint] = findRulloHints(puzzle, fixed, 1)
  assert.deepEqual(hint, replay[index])
  const step = hint.steps.at(-1)!
  assert.ok('assumption' in step)
  assert.deepEqual(step.assumption, { cell: 2, value: REMOVE })
  assert.deepEqual(step.decisions, [{ cell: 2, value: KEEP }])
  assert.deepEqual([step.rejectedBy.axis, step.rejectedBy.index, step.rejectedBy.target], ['column', 7, 16])
  assertProof(puzzle, hint, fixed, 'hard-7')
})

test('ordered Rullo Solution steps each prove their choice from the visible grid', () => {
  for (const { id, puzzle } of rulloCatalog) {
    let analyses = 0
    const walkthrough = numberSolution({
      check: values => checkRullo(puzzle, values),
      hints: () => assert.fail('Use the ordered hints for Solution.'),
      solutionHints: values => {
        analyses++
        return findRulloSolutionHints(puzzle, values)
      },
      solve: () => assert.fail(`${id} needs search to finish`),
    }, puzzle.numbers.map(() => true))
    assert.equal(analyses, 1, id)
    assert.equal(walkthrough.complete, true, id)
    assert.equal(walkthrough.steps.length, puzzle.numbers.length, id)
    assert.deepEqual(walkthrough.positions.at(-1), solveRullo(puzzle).solution, id)
    for (const [index, hint] of walkthrough.steps.entries()) {
      assert.ok(hint)
      assert.equal(hint.steps.length, 1, id)
      assert.deepEqual(hint.steps[0].decisions, [{ cell: hint.cell, value: hint.value }], id)
      const visible = [...walkthrough.positions[index]]
      assert.equal(visible[hint.cell], 0, id)
      assertProof(puzzle, hint, visible, id)
      assert.deepEqual(visible, walkthrough.positions[index + 1], id)
    }
  }
})

test('Medium 4 uses two crossing targets to rule out three pairs of choices', () => {
  const { puzzle } = rulloCatalog.find(entry => entry.id === 'medium-4')!
  const replay = findRulloSolutionHints(puzzle, [])
  const firstCrossing = replay.findIndex(hint => hint.technique !== 'Line sum')
  assert.equal(firstCrossing, 18)
  assert.equal(replay.filter(hint => hint.technique === 'Crossing line sums').length, 5)
  assert.equal(replay.filter(hint => hint.technique === 'Line sum').length, 31)

  const fixed = puzzle.numbers.map(() => 0)
  for (const { cell, value } of replay.slice(0, firstCrossing)) fixed[cell] = value
  const [hint] = findRulloHints(puzzle, fixed, 1)
  const step = hint.steps.at(-1)!
  assert.ok('lines' in step)
  assert.equal(hint.cell, 0)
  assert.equal(hint.value, KEEP)
  assert.equal(step.combinations, 1)
  assert.deepEqual(step.lines.map(line => [line.axis, line.index]), [['row', 0], ['row', 1]])
  const comparison = step.comparison
  assert.ok(comparison)
  assert.deepEqual(comparison.options, [[18, 49], [1, 32]])
  assert.deepEqual(comparison.rejected.map(({ options, crossing }) => [options, crossing.index, crossing.target]), [
    [[0, 0], 5, 17], [[0, 1], 0, 10], [[1, 0], 0, 10],
  ])
  for (const { options, crossing } of comparison.rejected) {
    const trial = fixed.slice()
    for (const [index, line] of step.lines.entries()) {
      const mask = comparison.options[index][options[index]]
      for (const [offset, cell] of line.cells.entries()) trial[cell] = mask & (1 << offset) ? KEEP : REMOVE
    }
    assert.ok(checkRullo(puzzle, trial).conflicts.includes(crossing))
  }
  assertProof(puzzle, hint, fixed, 'medium-4')
})

test('two row targets and their crossing column targets force a choice in Hard 4', () => {
  const { puzzle } = rulloCatalog.find(entry => entry.id === 'hard-4')!
  const basic = findRulloHints(puzzle, []).filter(hint => hint.steps.every(step => 'line' in step))
  assert.equal(basic.length, 12)

  const values = puzzle.numbers.map(() => 0)
  for (const { cell, value } of basic) values[cell] = value
  const hint = findRulloHints(puzzle, values, 1)[0]
  assert.equal(hint.cell, 1)
  assert.equal(hint.value, KEEP)
  assert.equal(hint.technique, 'Crossing line sums')
  const step = hint.steps.at(-1)!
  assert.ok('lines' in step)
  assert.deepEqual(step.lines.map(line => [line.axis, line.index, line.target]), [['row', 0, 43], ['row', 1, 45]])
  assert.deepEqual(step.crossings.map(line => line.index), [0, 1, 3, 4, 6])
  assert.equal(step.combinations, 10)
})

test('a chain of line sums keeps the Line sum label', () => {
  const { puzzle } = rulloCatalog.find(entry => entry.id === 'easy-1')!
  const hint = findRulloHints(puzzle, []).find(({ cell }) => cell === 5)!
  assert.ok(hint.steps.length > 1)
  assert.ok(hint.steps.every(step => 'line' in step))
  assert.equal(hint.technique, 'Line sum')
})

test('two column targets and their crossing row targets can also force a choice', () => {
  const puzzle = createRullo([
    5, 8, 4, 9, 11, 1, 7, 7, 9, 9, 2, 4, 4, 4, 10, 10,
    9, 9, 8, 2, 2, 4, 9, 5, 6, 9, 8, 6, 4, 7, 3, 1,
    5, 6, 8, 9, 4, 11, 3, 4, 2, 1, 9, 6, 1, 9, 7, 11,
    3, 1, 5, 6, 7, 5, 6, 1, 4, 2, 9, 7, 3, 7, 11, 7,
  ], [14, 33, 20, 10, 17, 27, 14, 11], [18, 24, 8, 15, 4, 14, 35, 28])
  const hint = findRulloHints(puzzle, []).find(hint => hint.cell === 13)
  assert.equal(hint?.value, REMOVE)
  const step = hint.steps.at(-1)!
  assert.ok('lines' in step)
  assert.deepEqual(step.lines.map(line => [line.axis, line.index]), [['column', 5], ['column', 7]])
  assert.ok(step.crossings.every(line => line.axis === 'row'))
  const opposite = puzzle.numbers.map((_, cell) => cell === hint.cell ? KEEP : 0)
  assert.equal(solveRullo(puzzle, opposite).status, 'unsolvable')
})


test('three parallel row or column targets can force a choice', () => {
  const cases = [
    { id: 'hard-5', axis: 'row', lines: [1, 2, 7], crossings: [0, 1, 2, 3, 4, 5, 6],
      prior: [[55, REMOVE]], cell: 11, combinations: 92 },
    { id: 'hard-6', axis: 'column', lines: [0, 1, 4], crossings: [0, 1, 3, 4, 5, 6, 7],
      prior: [[9, KEEP], [37, REMOVE]], cell: 8, combinations: 56 },
  ]
  for (const { id, axis, lines, crossings, prior, cell, combinations } of cases) {
    const { puzzle } = rulloCatalog.find(entry => entry.id === id)!
    const values = puzzle.numbers.map(() => 0)
    for (const [index, choice] of prior) values[index] = choice
    const [hint] = findRulloHints(puzzle, values, 1)
    assert.equal(hint.technique, 'Three-line sums', id)
    assert.equal(hint.cell, cell, id)
    assert.equal(hint.value, REMOVE, id)
    const step = hint.steps.at(-1)!
    assert.ok('lines' in step)
    assert.deepEqual(step.lines.map(line => [line.axis, line.index]), lines.map(index => [axis, index]), id)
    assert.ok(step.crossings.every(line => line.axis !== axis), id)
    assert.deepEqual(step.crossings.map(line => line.index), crossings, id)
    assert.equal(step.combinations, combinations, id)
    const findHints = createRulloHintFinder(puzzle)
    assert.deepEqual(findHints(values, 1), [hint], id)
    values[cell] = KEEP
    assert.equal(solveRullo(puzzle, values).status, 'unsolvable', id)
    assert.deepEqual(findHints(values, 1), findRulloHints(puzzle, values, 1), id)
    values[cell] = 0
    assert.deepEqual(findHints(values, 1), [hint], id)
  }
})

test('a limited hint can skip crossing checks only for a completable position', () => {
  const { puzzle } = rulloCatalog.find(entry => entry.id === 'hard-6')!
  const values = puzzle.numbers.map(() => 0)
  const findHints = createRulloHintFinder(puzzle)
  const [hint] = findRulloHints(puzzle, values)
  assert.equal(hint.technique, 'Line sum')
  assert.deepEqual(findHints(values, 1), [hint])
  assert.deepEqual(findRulloHints(puzzle, values, 1), [hint])

  values[1] = REMOVE
  assert.deepEqual(checkRullo(puzzle, values).conflicts, [])
  assert.equal(solveRullo(puzzle, values).status, 'unsolvable')
  assert.deepEqual(findHints(values, 1), [])
  assert.deepEqual(findRulloHints(puzzle, values, 1), [])

  values[1] = 0
  assert.deepEqual(findHints(values, 1), [hint])
})

test('cached three-line support matches direct enumeration for every crossing pattern', () => {
  const masks = [[0b000, 0b011, 0b101], [0b001, 0b010, 0b100], [0b001, 0b010, 0b111]] as const
  const combinations = masks[0].flatMap(a => masks[1].flatMap(b => masks[2].map(c => [a, b, c])))
  const kept = (options: readonly number[]) => options.reduce((bits, mask) => bits | mask, 0)
  const removed = (options: readonly number[]) => options.reduce((bits, mask) => bits | ~mask, 0)
  const variable = masks.map(options => kept(options) & removed(options))
  const [first, second, third] = masks.map((options, index) => ({ masks: options, variable: variable[index] }))
  const choices = [first, second, third] as const
  for (let patterns = 0; patterns <= 0xff; patterns++) {
    const restrictions = [
      { offset: 0, patterns },
      { offset: 1, patterns: 0b11010111 },
      { offset: 2, patterns: 0b10110111 },
    ]
    const matching = combinations.filter(combination =>
      restrictions.every(({ offset, patterns }) => {
        const choice = combination.reduce((choice, mask, line) => choice + (((mask >> offset) & 1) << line), 0)
        return patterns & (1 << choice)
      }),
    )
    const options = masks.map((_, line) => matching.map(combination => combination[line]))
    const anyKeep = options.map(kept)
    const anyRemove = options.map(removed)
    const allVariable = variable.every((bits, line) => (anyKeep[line] & anyRemove[line]) === bits)
    const expected = matching.length === 0 ? null : allVariable ? undefined
      : { count: matching.length, kept: anyKeep, removed: anyRemove }
    assert.deepEqual(crossingTripleSupport(choices, restrictions), expected, patterns.toString(2))
  }
})
