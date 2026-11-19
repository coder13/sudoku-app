import assert from 'node:assert/strict'
import test from 'node:test'
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
