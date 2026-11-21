import assert from 'node:assert/strict'
import test from 'node:test'
import { createLatinPuzzle, findLatinHints, findLatinSolutionHints } from '../src/latin/engine.ts'
import { numberSolution } from '../src/number-puzzles/solution.ts'

test('the solution path holds each position before its move and ends with the completed grid', () => {
  const hint = { cell: 1, value: 2 }
  const board = {
    hints: (values: readonly number[]) => values[1] ? [] : [hint],
    check: (values: readonly number[]) => ({ complete: values[1] === 2 }),
    solve: () => assert.fail('Logical placement completes the puzzle.'),
  }
  assert.deepEqual(numberSolution(board, [false, true]), {
    positions: [[0, 0], [0, 2]], steps: [hint], complete: true,
  })
})

test('exact search appears as one step when the logical path stalls', () => {
  const board = {
    hints: () => [],
    check: (values: readonly number[]) => ({ complete: values[0] === 1 }),
    solve: () => [1],
  }
  assert.deepEqual(numberSolution(board, [true]), { positions: [[0], [1]], steps: [null], complete: true })
  assert.deepEqual(numberSolution({ ...board, solve: () => null }, [true]), {
    positions: [[0]], steps: [], complete: false,
  })
})

test('ordered hints build multiple Solution steps from one analysis', () => {
  const first = { cell: 2, value: 3 }
  const second = { cell: 1, value: 2 }
  let calls = 0
  const trace = numberSolution({
    hints: () => assert.fail('Use the ordered hints for Solution.'),
    solutionHints: values => {
      assert.deepEqual(values, [0, 0, 0])
      calls++
      return [first, second]
    },
    check: values => ({ complete: values[1] === 2 && values[2] === 3 }),
    solve: () => assert.fail('The ordered hints finish the puzzle.'),
  }, [false, true, true])
  assert.equal(calls, 1)
  assert.deepEqual(trace, {
    positions: [[0, 0, 0], [0, 0, 3], [0, 2, 3]], steps: [first, second], complete: true,
  })
})

test('ordered hints preserve the logical steps before the solver finishes the grid', () => {
  const hint = { cell: 0, value: 2 }
  const trace = numberSolution({
    hints: () => assert.fail('Use the ordered hints for Solution.'),
    solutionHints: values => values[0] ? [] : [hint],
    check: values => ({ complete: values[0] === 2 && values[1] === 1 }),
    solve: () => [2, 1],
  }, [true, true])
  assert.deepEqual(trace, {
    positions: [[0, 0], [2, 0], [2, 1]], steps: [hint, null], complete: true,
  })
})

test('a Solution step can use an earlier placement without repeating its proof', () => {
  const ruleA = { cells: [0], label: 'Set the first cell', support: () => [1] }
  const ruleB = { cells: [0, 1], label: 'Use the first cell', support: () => [1, 2] }
  const puzzle = createLatinPuzzle(3, Array<number>(9).fill(0), [ruleA, ruleB])
  const find = (hints: ReturnType<typeof findLatinHints>) => hints.find(hint => hint.cell === 1)
  const live = find(findLatinHints(puzzle, []))
  const solution = find(findLatinSolutionHints(puzzle, []))
  assert.deepEqual(live?.rules.map(rule => rule.label), [ruleB.label, ruleA.label])
  assert.deepEqual(solution?.rules.map(rule => rule.label), [ruleB.label])
  assert.equal(solution?.value, live?.value)
})
