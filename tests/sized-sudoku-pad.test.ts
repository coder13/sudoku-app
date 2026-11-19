import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { decodeSizedSudokuPad } from '../src/sudoku/sized-sudoku-pad.ts'

const metadata = {
  title: 'Shared totals',
  author: 'Test author',
  rules: '* Normal 4x4 Sudoku rules apply: Place the digits 1-4 in each row, column, and region.\n' +
    '* Algebraic Killer Cages: Digits in a cage must not repeat and must sum to the total in the top-left corner of the cage. ' +
    '"n" is a positive integer to be determined by the solver.',
}
const input = {
  id: 'fixture',
  metadata,
  cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({}))),
  regions: [
    [[0,0],[0,1],[1,0],[1,1]], [[0,2],[0,3],[1,2],[1,3]],
    [[2,0],[2,1],[3,0],[3,1]], [[2,2],[2,3],[3,2],[3,3]],
  ],
  cages: [{ cells: [[1,0],[1,1]], value: 'n+2' }, { cells: [[2,0]], value: 'n-1' }],
}
const encode = (payload: unknown) => 'scl' + lzString.compressToBase64(JSON.stringify(payload))

test('sized SudokuPad definitions retain cage order, labels, offsets, and authored metadata', () => {
  const code = encode(input)
  const decoded = decodeSizedSudokuPad(code)
  assert.equal(decoded.givens, '0'.repeat(16))
  assert.deepEqual(decoded.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.deepEqual(decoded.rules, [
    { type: 'algebraic-cage', cells: [4,5], label: 'n+2', total: { type: 'variable', name: 'n', offset: 2 } },
    { type: 'algebraic-cage', cells: [8], label: 'n-1', total: { type: 'variable', name: 'n', offset: -1 } },
  ])
  assert.equal(decoded.source.code, code)
  assert.equal(decoded.source.rulesText, metadata.rules)
  assert.equal(decoded.source.author, metadata.author)
})

test('sized SudokuPad rejects unrepresented rules and geometry', () => {
  assert.throws(() => decodeSizedSudokuPad(encode({ ...input, lines: [{}] })), /unsupported puzzle fields/)
  assert.throws(() => decodeSizedSudokuPad(encode({ ...input, metadata: { ...metadata, rules: metadata.rules + '\n* Antiknight.' } })), /cannot verify/)
  assert.throws(() => decodeSizedSudokuPad(encode({
    ...input, cages: [{ cells: [[0,0]], value: 'log(n)' }],
  })), /unsupported total expression/)
  assert.throws(() => decodeSizedSudokuPad(encode({
    ...input, cages: [{ cells: [[0,0],[0,0]], value: 'n' }],
  })), /same cell twice/)
})
