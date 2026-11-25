import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { readReviewedCoachRowEquations } from '../src/sudoku/puzzle-import/coach-row-equation.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-row-equations.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('the reviewed Coach drawing parses its five authored row equations', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const rules = await readReviewedCoachRowEquations(data.givenConstraints, data.gridSize)
  assert.deepEqual(rules, [
    { type: 'row-equation', cells: [0, 1, 2, 3], operators: ['multiply', 'subtract', 'equals'] },
    { type: 'row-equation', cells: [7, 8, 9], operators: ['subtract', 'equals'] },
    { type: 'row-equation', cells: [11, 12, 13, 14], operators: ['join', 'divide', 'equals'] },
    { type: 'row-equation', cells: [15, 16, 17, 18, 19], operators: ['add', 'add', 'equals', 'join'] },
    { type: 'row-equation', cells: [21, 22, 23, 24], operators: ['multiply', 'subtract', 'equals'] },
  ])
  assert.equal(source.solution, '2315445321512433451212435')
})

test('unreviewed Coach drawings remain unsupported instead of guessing arithmetic', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const changed = structuredClone(data.givenConstraints) as Record<string, unknown>[]
  changed[0].id = 'different-source'
  assert.equal(await readReviewedCoachRowEquations(changed, data.gridSize), undefined)
  assert.equal(await readReviewedCoachRowEquations(data.givenConstraints, 9), undefined)
})
