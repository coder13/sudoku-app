import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

const coachExamples = JSON.parse(readFileSync(new URL('./fixtures/parity-coach.json', import.meta.url), 'utf8')) as {
  legacyOddEven: { code: string }
}

test('Coach legacy oddEven layers are rejected instead of imported as alternating lines', async () => {
  const code = coachCode({ givenDigits: '0'.repeat(81), givenConstraints: [{
    id: 'oddEven', type: 'oddEven', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }] })

  await assert.rejects(detectPuzzle(code), /Odd\/Even layer uses an unsupported legacy format/)
})

test('the public Coach Odd/Even layer example imports its legacy cell parities', async () => {
  const imported = await detectPuzzle(coachExamples.legacyOddEven.code)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, '0'.repeat(81))
  assert.equal(imported.variant?.puzzle.rules?.length, 10)
  assert.deepEqual(imported.variant?.puzzle.rules, [
    { type: 'parity', cells: [10], parity: 'odd' },
    { type: 'parity', cells: [13], parity: 'odd' },
    { type: 'parity', cells: [16], parity: 'odd' },
    { type: 'parity', cells: [31], parity: 'even' },
    { type: 'parity', cells: [39], parity: 'even' },
    { type: 'parity', cells: [41], parity: 'even' },
    { type: 'parity', cells: [49], parity: 'even' },
    { type: 'parity', cells: [64], parity: 'odd' },
    { type: 'parity', cells: [67], parity: 'odd' },
    { type: 'parity', cells: [70], parity: 'odd' },
  ])
})
