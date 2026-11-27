import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

test('Coach legacy oddEven layers are rejected instead of imported as alternating lines', async () => {
  const code = coachCode({ givenDigits: '0'.repeat(81), givenConstraints: [{
    id: 'oddEven', type: 'oddEven', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }] })

  await assert.rejects(detectPuzzle(code), /Odd\/Even layer uses an unsupported legacy format/)
})
